"""Runs one automation, kept alive by herdr-core after the window closes.

    runner.py DIR run ID RUN TRIGGER    run automation ID as run RUN (schedule or manual)
    runner.py DIR list                  print every run, newest first, by automation
    runner.py DIR delete ID             delete the runs of an automation

DIR holds automations.json (written by the mod) and runs/<automation>/<run>/:
run.json (state), log.txt (full output), answer.md (an agent's final answer).
A run holds its automation's lock file until it ends, so a second one is skipped
and a run that died without a final state is known to be interrupted.
"""

import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid

KEEP = 20
LOG_LIMIT = 5_000_000


def now():
    return int(time.time() * 1000)


def load(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def save(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value))
    temp.replace(path)


def locked(folder):
    try:
        with open(folder / "lock") as file:
            fcntl.flock(file, fcntl.LOCK_SH | fcntl.LOCK_NB)
    except FileNotFoundError:
        return False
    except BlockingIOError:
        return True
    return False


def acquire(folder):
    file = open(folder / "lock", "a")
    # `list` takes the lock for an instant to test it: one failure proves nothing.
    for _ in range(10):
        try:
            fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return file
        except BlockingIOError:
            time.sleep(0.1)
    return None


def runs_of(folder):
    runs = [(path.parent, load(path)) for path in folder.glob("*/run.json")]
    return sorted([r for r in runs if r[1]], key=lambda r: r[1]["started"], reverse=True)


def prune(folder):
    # Skipped entries have their own limit: they must not push out real results.
    for skipped in (False, True):
        group = [path for path, meta in runs_of(folder) if (meta["state"] == "skipped") == skipped]
        for path in group[KEEP:]:
            shutil.rmtree(path, ignore_errors=True)


class Stopped(Exception):
    pass


def on_signal(*_):
    for number in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(number, signal.SIG_IGN)
    raise Stopped


class Run:
    def __init__(self, spec, path, meta):
        self.spec, self.path, self.meta = spec, path, meta
        self.log = open(path / "log.txt", "w", encoding="utf-8")
        self.logged = 0
        self.lock = threading.Lock()
        self.answer = ""
        self.error = ""

    def write(self, text):
        text = text.rstrip("\n") + "\n"
        with self.lock:
            if self.logged < LOG_LIMIT:
                self.logged += len(text)
                self.log.write(text if self.logged < LOG_LIMIT else "[The log stops here: it is too long.]\n")
                self.log.flush()
            try:
                print(text, end="", flush=True)
            except OSError:
                pass  # the terminal is gone: the log stays

    def command(self):
        """The argv, the stdin text (None: no input) and the line parser."""
        spec, text = self.spec, self.spec["text"]
        if spec["kind"] == "script":
            file = self.path / "script"
            file.write_text(text if text.endswith("\n") else text + "\n")
            file.chmod(0o700)
            return ([str(file)] if text.startswith("#!") else ["zsh", str(file)]), None, self.write
        model, effort = spec.get("model"), spec.get("effort")
        if spec["harness"] == "claude":
            self.session(str(uuid.uuid4()))
            argv = ["claude", "-p", "--session-id", self.meta["session"], "--output-format", "stream-json", "--verbose"]
            argv += [*(["--model", model] if model else []), *(["--effort", effort] if effort else [])]
            return argv, text, self.events(self.claude)
        if spec["harness"] == "codex":
            argv = ["codex", "--no-daemon", "exec", "--json", "--skip-git-repo-check"]
            argv += [*(["-m", model] if model else []), *(["-c", f"model_reasoning_effort={effort}"] if effort else []), "-"]
            return argv, text, self.events(self.codex)
        if spec["harness"] == "opencode":
            argv = ["opencode", "run", "--format", "json", "--title", spec["name"]]
            if spec.get("provider") and model:
                argv += ["-m", f"{spec['provider']}/{model}" + (f"#{effort}" if effort else "")]
            return [*argv, "--", text], None, self.events(self.opencode)
        raise RuntimeError(f"Unknown harness: {spec['harness']}")

    def session(self, value):
        if value and self.meta.get("session") != value:
            self.meta["session"] = value
            save(self.path / "run.json", self.meta)

    def events(self, handle):
        def parse(line):
            try:
                event = json.loads(line)
            except ValueError:
                event = None
            if not isinstance(event, dict):
                return self.write(line) if line.strip() else None
            try:
                handle(event)
            except (AttributeError, KeyError, TypeError):
                self.write(line)  # an event with a new shape: keep it as it is
        return parse

    def tool(self, name, details):
        details = details if isinstance(details, str) else json.dumps(details, ensure_ascii=False) if details else ""
        self.write(f"→ {name} {' '.join(details.split())[:300]}".rstrip())

    def claude(self, event):
        if event.get("type") == "assistant" and not event.get("parent_tool_use_id"):
            for block in event["message"]["content"]:
                if block["type"] == "text":
                    self.write(block["text"])
                elif block["type"] == "tool_use":
                    self.tool(block["name"], block.get("input"))
        elif event.get("type") == "result":
            self.answer = event.get("result") or self.answer
            for denial in event.get("permission_denials") or []:
                self.write(f"Permission denied: {denial.get('tool_name')}")
            if event.get("is_error"):
                self.error = event.get("result") or event.get("subtype") or "Claude Code reported an error."

    def codex(self, event):
        kind, item = event.get("type"), event.get("item") or {}
        if kind == "thread.started":
            self.session(event.get("thread_id"))
        elif kind == "item.completed" and item.get("type") == "agent_message":
            self.answer = item["text"]
            self.write(item["text"])
        elif kind == "item.completed" and item.get("type") != "reasoning":
            self.tool(item["type"], item.get("command") or item.get("tool") or item.get("message") or item.get("changes"))
        elif kind in ("turn.failed", "error"):
            self.error = (event.get("error") or {}).get("message") or event.get("message") or "Codex reported an error."
            self.write(self.error)

    def opencode(self, event):
        kind, part = event.get("type"), event.get("part") or {}
        self.session(event.get("sessionID"))
        if kind == "step_start":
            self.step = ""
        elif kind == "text":
            self.step = "\n\n".join(filter(None, [getattr(self, "step", ""), part["text"]]))
            self.answer = self.step
            self.write(part["text"])
        elif kind == "tool_use":
            self.tool(part["tool"], (part.get("state") or {}).get("input"))
        elif kind == "error":
            error = event.get("error") or {}
            self.error = error.get("message") or (error.get("data") or {}).get("message") or "OpenCode reported an error."
            self.write(self.error)

    def execute(self):
        folder = os.path.expanduser(self.spec["folder"])
        if not os.path.isdir(folder):
            raise RuntimeError(f"The folder does not exist: {folder}")
        argv, text, parse = self.command()
        stdin = subprocess.DEVNULL
        if text is not None:
            (self.path / "prompt").write_text(text)
            stdin = open(self.path / "prompt", "rb")
        script = self.spec["kind"] == "script"
        # Without Herdr's variables, the agent's hooks cannot report this run as a terminal agent.
        env = {k: v for k, v in os.environ.items() if not k.startswith(("HC_", "HERDR_"))}
        # Its own session: no terminal to ask questions on, and one group to end.
        proc = subprocess.Popen(argv, cwd=folder, env=env, stdin=stdin, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT if script else subprocess.PIPE, start_new_session=True)
        try:
            def read(pipe, handle):
                for line in pipe:
                    handle(line.decode("utf-8", "replace").rstrip("\r\n"))

            threads = [threading.Thread(target=read, args=(proc.stdout, parse), daemon=True)]
            if proc.stderr:
                threads.append(threading.Thread(target=read, args=(proc.stderr, self.write), daemon=True))
            for thread in threads:
                thread.start()
            code = proc.wait(timeout=float(self.spec.get("limit") or 60) * 60)
            for thread in threads:
                thread.join(2)  # a process left behind can keep the pipe open
            self.meta["exit_code"] = code
            return code
        finally:
            self.end(proc)

    @staticmethod
    def end(proc):
        for number, wait in ((signal.SIGTERM, 3), (signal.SIGKILL, 3)):
            try:
                os.killpg(proc.pid, number)
            except ProcessLookupError:
                return
            try:
                proc.wait(timeout=wait)
            except subprocess.TimeoutExpired:
                pass

    def finish(self, state, error=""):
        self.meta.update(state=state, finished=now(), error=error[-500:])
        if self.answer:
            (self.path / "answer.md").write_text(self.answer)
        for name in ("script", "prompt"):
            (self.path / name).unlink(missing_ok=True)
        save(self.path / "run.json", self.meta)


def run(base, automation, name, trigger):
    folder = base / "runs" / automation
    path = folder / name
    try:
        path.mkdir(parents=True)
    except FileExistsError:
        return 0  # this scheduled minute already ran
    listed = (load(base / "automations.json") or {}).get("automations", [])
    spec = next((a for a in listed if a["id"] == automation), None)
    meta = {"id": name, "trigger": trigger, "state": "skipped", "started": now(),
            **{k: spec[k] for k in ("kind", "harness", "folder") if spec and k in spec}}
    if not spec:
        path.rmdir()
        return 1
    lock = acquire(folder)
    if not lock:
        save(path / "run.json", {**meta, "finished": now()})
        prune(folder)
        return 0
    for other, old in runs_of(folder):
        if old["state"] == "running":
            save(other / "run.json", {**old, "state": "interrupted"})
    meta["state"] = "running"
    save(path / "run.json", meta)
    for number in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(number, on_signal)
    job = Run(spec, path, meta)
    try:
        code = job.execute()
        failed = code != 0 or job.error
        job.finish("failed" if failed else "done", job.error)
    except Stopped:
        job.finish("stopped")
    except subprocess.TimeoutExpired:
        job.finish("timeout", f"Stopped after the time limit of {spec.get('limit') or 60} minutes.")
    except Exception as error:  # the card shows the message; a traceback helps nobody there
        job.write(str(error))
        job.finish("failed", str(error) or type(error).__name__)
    prune(folder)
    return 0


def listing(base):
    out = {}
    for folder in (base / "runs").glob("*/"):
        busy = locked(folder)
        # Read after the lock test: a run that ends meanwhile has its final state by now.
        runs = [meta for _, meta in runs_of(folder)]
        for meta in runs:
            if meta["state"] == "running" and not busy:
                meta["state"] = "interrupted"
        out[folder.name] = runs
    return out


def main():
    os.umask(0o077)
    base, action, *args = sys.argv[1:]
    base = Path(base)
    if args and not re.fullmatch(r"[a-z0-9]+", args[0]):
        sys.exit("Invalid automation id.")
    if action == "run":
        return run(base, *args)
    if action == "list":
        print(json.dumps(listing(base)))
    elif action == "delete":
        folder = base / "runs" / args[0]
        if locked(folder):
            sys.exit("This automation is running.")
        shutil.rmtree(folder, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
