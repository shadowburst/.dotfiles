"""Ask a harness for its own subscription usage, so that it renews its own login.

    python3 -I probe.py claude    Claude Code's get_usage control request
    python3 -I probe.py codex     codex app-server: account/read + account/rateLimits/read

Prints one JSON object: the harness's answer, or {"error": "..."}. The harness runs
without a prompt (no model call) and is stopped as soon as it has answered.
"""

import json
import os
import queue
import signal
import subprocess
import sys
import threading
import time

TIMEOUT = 25


def child_env():
    # Without Herdr's variables, the harness's Herdr hooks cannot report this probe as an agent.
    return {k: v for k, v in os.environ.items() if not k.startswith(("HC_", "HERDR_"))}


def converse(argv, requests, answered):
    proc = subprocess.Popen(
        argv,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env=child_env(),
        cwd=os.path.expanduser("~"),
        start_new_session=True,
    )
    lines = queue.Queue()

    def read():
        for line in proc.stdout:
            lines.put(line)
        lines.put(None)

    threading.Thread(target=read, daemon=True).start()
    try:
        for request in requests:
            proc.stdin.write((json.dumps(request) + "\n").encode())
        proc.stdin.flush()
        deadline = time.monotonic() + TIMEOUT
        state = {}
        while True:
            left = deadline - time.monotonic()
            if left <= 0:
                return {"error": "no answer in time"}
            try:
                line = lines.get(timeout=left)
            except queue.Empty:
                return {"error": "no answer in time"}
            if line is None:
                return {"error": "the program exited before it answered"}
            try:
                message = json.loads(line)
            except ValueError:
                continue
            result = answered(message, state)
            if result is not None:
                return result
    finally:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)


def claude():
    def answered(message, _state):
        if message.get("type") != "control_response":
            return None
        response = message.get("response") or {}
        if response.get("request_id") != "usage":
            return None
        if response.get("subtype") != "success":
            return {"error": response.get("error") or "Claude Code refused the usage request"}
        return {"usage": response.get("response")}

    return converse(
        [
            "claude", "-p",
            "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
            "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
        ],
        [{"type": "control_request", "request_id": "usage", "request": {"subtype": "get_usage", "skip_behaviors": True}}],
        answered,
    )


def codex():
    def answered(message, state):
        if message.get("id") not in (2, 3):
            return None
        if "error" in message:
            return {"error": (message["error"] or {}).get("message") or "Codex refused the usage request"}
        state[message["id"]] = message.get("result")
        if 2 in state and 3 in state:
            return {"account": state[2], "limits": state[3]}
        return None

    return converse(
        ["codex", "app-server"],
        [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
                "clientInfo": {"name": "herdr-usage", "title": "Herdr usage", "version": "1"},
                "capabilities": {"experimentalApi": True}}},
            {"jsonrpc": "2.0", "method": "initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "account/read", "params": {}},
            {"jsonrpc": "2.0", "id": 3, "method": "account/rateLimits/read", "params": None},
        ],
        answered,
    )


if __name__ == "__main__":
    try:
        result = {"claude": claude, "codex": codex}[sys.argv[1]]()
    except FileNotFoundError as error:
        result = {"error": f"{error.filename} is not installed"}
    except Exception as error:  # the mod shows the message; a traceback helps nobody there
        result = {"error": str(error) or type(error).__name__}
    print(json.dumps(result))
