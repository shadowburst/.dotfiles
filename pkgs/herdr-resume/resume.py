"""Report native agent lifecycle events to the existing core, without launching it."""

import json
import os
from pathlib import Path
import socket
import sys
from urllib.parse import quote


def core(method, **params):
    request = {"jsonrpc": "2.0", "id": 1, "method": method,
               "params": {"terminal": os.environ["HC_TERMINAL_ID"], **params}}
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(1)
        client.connect(os.environ["HC_TERMINAL_SOCKET"])
        client.sendall((json.dumps(request) + "\n").encode())
        with client.makefile("rb") as stream:
            reply = json.loads(stream.readline(1 << 20))
    if "error" in reply:
        raise ValueError(reply["error"]["message"])
    return reply["result"]


def resume_argv(agent, session, args):
    if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
        raise ValueError("launch arguments must be strings")
    shell = '"$@"; exec "${SHELL:-sh}" -i'
    if agent == "opencode":
        # OpenCode creates unknown IDs, so verify the session before opening it.
        connection = []
        for i, arg in enumerate(args):
            if arg == "--server" and i + 1 < len(args):
                connection = [arg, args[i + 1]]
            elif arg.startswith("--server="):
                connection = [arg]
        script = ('id=$1; path=$2; shift 2; '
                  'opencode "$@" api get "$path" >/dev/null && opencode "$@" --session "$id"; '
                  'exec "${SHELL:-sh}" -i')
        return ["sh", "-c", script, "herdr-resume", session,
                f"/api/session/{quote(session, safe='')}", *connection]
    command = {"claude": ["claude", "--resume", session],
               "codex": ["codex", "--no-daemon", "resume", session]}[agent]
    return ["sh", "-c", shell, "herdr-resume", *command]


def report(agent, event):
    if not isinstance(event, dict):
        raise ValueError("hook input must be an object")
    if not os.environ.get("HC_TERMINAL_ID") or not os.environ.get("HC_TERMINAL_SOCKET"):
        return
    kind = event.get("hook_event_name", "SessionStart")
    if event.get("agent_id") or kind not in {"SessionStart", "SessionEnd"}:
        return
    if agent == "claude" and os.environ.get("CLAUDE_CODE_ENTRYPOINT") == "opencode":
        return  # The provider subprocess does not own OpenCode's terminal.
    session = event.get("session_id")
    if not isinstance(session, str) or not session or session.startswith("-") or len(session) > 512:
        raise ValueError("invalid conversation ID")
    if any(ord(c) < 32 or ord(c) == 127 for c in session):
        raise ValueError("invalid conversation ID")
    if agent == "codex" and os.environ.get("CODEX_THREAD_ID", session) != session:
        return
    if not core("terminal.get").get("keep"):
        return
    key = f"{agent}:{session}"
    if kind == "SessionEnd":
        core("terminal.keep", keep=True, clear_resume=key)
        return
    cwd = event.get("cwd") or os.getcwd()
    if not isinstance(cwd, str) or not Path(cwd).is_absolute():
        raise ValueError("conversation directory must be absolute")
    record = {"key": key, "cwd": cwd, "argv": resume_argv(agent, session, event.get("argv", []))}
    result = core("terminal.keep", keep=True, resume=record)
    if result.get("resume") != record:
        raise ValueError("the running core does not support conversation recovery")


if __name__ == "__main__":
    try:
        report(sys.argv[1], json.load(sys.stdin))
    except OSError:
        pass  # Closing an agent must not restart a stopped core.
    except (ValueError, KeyError) as error:
        print(f"Herdr: conversation recovery was not saved: {error}", file=sys.stderr)
