"""Runs one automation, kept alive by herdr-core after the window closes.

    runner.py DIR run ID RUN TRIGGER    run automation ID as run RUN (schedule or manual)
    runner.py DIR list                  print every run, newest first, by automation
    runner.py DIR output ID RUN         print a run's answer and log
    runner.py DIR delete ID             delete the runs of an automation

DIR holds automations.json (written by the mod) and runs/<automation>/<run>/:
run.json (state), log.txt (full output), answer.md (an agent's final answer).
A run holds its automation's lock file until it ends, so a second one is skipped
and a run that died without a final state is known to be interrupted.

A script is a child process. A prompt is an ordinary interactive agent in a hidden
terminal of its own, with the status that it reports to herdr-core (OSC 7501). The run
ends with the agent's first turn, but the agent stays until the automation's next run,
so a person can open and continue it. What it said comes from its own transcript.
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
from urllib.parse import quote

KEEP = 20
POLL = 1
SETTLE = 3  # seconds that a turn's end must last: an agent can go on by itself
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


def drop(path):
    try:
        retire(load(path / "run.json") or {})
    except (CoreError, OSError, subprocess.SubprocessError):
        pass
    shutil.rmtree(path, ignore_errors=True)


def prune(folder):
    # Skipped entries have their own limit: they must not push out real results.
    for skipped in (False, True):
        group = [path for path, meta in runs_of(folder) if (meta["state"] == "skipped") == skipped]
        for path in group[KEEP:]:
            drop(path)


def hc(*args, timeout=60):
    # Without the caller's terminal, the agent is nobody's sub-agent.
    env = {k: v for k, v in os.environ.items() if not k.startswith("HC_TERMINAL")}
    done = subprocess.run(["hc", *args], env=env, capture_output=True, text=True, timeout=timeout)
    try:
        answer = json.loads(done.stdout or done.stderr)
    except ValueError:
        answer = {}
    if done.returncode:
        error = answer.get("error", {}) if isinstance(answer, dict) else {}
        raise CoreError(error.get("message") or done.stderr.strip() or f"hc {args[0]} failed.", error.get("kind"))
    return answer


class CoreError(Exception):
    def __init__(self, message, kind=None):
        super().__init__(message)
        self.kind = kind


def agent_of(meta):
    """A run's live agent terminal, or None."""
    if not meta.get("agent"):
        return None
    try:
        terminal = hc("get", meta["agent"], "--json")
    except CoreError as error:
        if error.kind == "not_found":
            return None
        raise
    # Addresses are not used again, but the label proves it.
    ours = (terminal.get("labels") or {}).get("automation.run") == meta["id"]
    return terminal if ours and terminal["state"] != "finished" else None


def status_of(terminal):
    return (terminal.get("status") or {}).get("state")


def placed(terminal):
    return "herdr.space" in (terminal.get("labels") or {})


def retire(meta):
    """Ends a run's hidden agent. One that a person gave a tab is theirs."""
    if not meta.get("agent"):
        return
    terminal = agent_of(meta)
    if terminal and placed(terminal):
        return
    try:
        if terminal:
            hc("kill", meta["agent"])
        hc("rm", meta["agent"])
    except CoreError:
        pass  # it ended by itself


def trust(harness, folder):
    """Claude Code asks once for each folder, and nobody is there to answer."""
    if harness != "claude":
        return
    # The folder of the home directory cannot be trusted this way (the form refuses it).
    file, key = Path.home() / ".claude.json", os.path.realpath(folder)
    lock = Path(f"{file}.lock")  # Claude Code's own lock
    if ((load(file) or {}).get("projects", {}).get(key) or {}).get("hasTrustDialogAccepted"):
        return
    for _ in range(50):
        try:
            lock.mkdir()
            break
        except FileExistsError:
            time.sleep(0.2)
    else:
        raise RuntimeError("Cannot trust the folder: Claude Code's configuration is locked.")
    try:
        config = load(file)
        if not isinstance(config, dict):
            raise RuntimeError("Cannot trust the folder: ~/.claude.json is not readable. Start Claude Code one time.")
        config.setdefault("projects", {}).setdefault(key, {})["hasTrustDialogAccepted"] = True
        temp = file.with_name(f".claude.json.automations-{os.getpid()}")
        temp.touch(0o600)
        temp.write_text(json.dumps(config, indent=2, ensure_ascii=False))
        temp.replace(file.resolve())
    finally:
        lock.rmdir()


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

    def execute(self):
        folder = os.path.expanduser(self.spec["folder"])
        if not os.path.isdir(folder):
            raise RuntimeError(f"The folder does not exist: {folder}")
        return self.script(folder) if self.spec["kind"] == "script" else self.prompt(folder)

    def script(self, folder):
        text = self.spec["text"]
        file = self.path / "script"
        file.write_text(text if text.endswith("\n") else text + "\n")
        file.chmod(0o700)
        argv = [str(file)] if text.startswith("#!") else ["zsh", str(file)]
        env = {k: v for k, v in os.environ.items() if not k.startswith(("HC_", "HERDR_"))}
        # Its own session: no terminal to ask questions on, and one group to end.
        proc = subprocess.Popen(argv, cwd=folder, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, start_new_session=True)

        def read():
            for line in proc.stdout:
                self.write(line.decode("utf-8", "replace").rstrip("\r\n"))

        try:
            thread = threading.Thread(target=read, daemon=True)
            thread.start()
            code = proc.wait(timeout=self.limit())
            thread.join(2)  # a process left behind can keep the pipe open
            self.meta["exit_code"] = code
            return "failed" if code else "done"
        finally:
            self.end(proc)

    def limit(self):
        return float(self.spec.get("limit") or 60) * 60

    def argv(self, folder):
        """The interactive agent, and its session when it is known before the start."""
        spec, text = self.spec, self.spec["text"]
        model, effort = spec.get("model"), spec.get("effort")
        if spec["harness"] == "claude":
            session = str(uuid.uuid4())
            return ["claude", "--session-id", session, *(["--model", model] if model else []),
                    *(["--effort", effort] if effort else []), "--", text], session
        if spec["harness"] == "codex":
            # The folder is trusted for this run only.
            return ["codex", "--no-daemon", "-c", codex_trust(folder), *(["-m", model] if model else []),
                    *(["-c", f"model_reasoning_effort={effort}"] if effort else []), "--", text], None
        if spec["harness"] == "opencode":
            # Its TUI has no model option: the session gets it.
            body = {"model": {"providerID": spec.get("provider"), "id": model, **({"variant": effort} if effort else {})}} if model else {}
            session = opencode("post", "/api/session", "-d", json.dumps({**body, "location": {"directory": os.path.realpath(folder)}}))["id"]
            return ["opencode", "--session", session, f"--prompt={text}"], session
        raise RuntimeError(f"Unknown harness: {spec['harness']}")

    def prompt(self, folder):
        trust(self.spec["harness"], folder)
        argv, session = self.argv(folder)
        started = hc("run", "--bg", "--json", "--outlive-parent", "--no-notify", "--cwd", folder,
                     "--label", f"automation.agent={self.spec['id']}", "--label", f"automation.run={self.meta['id']}", "--", *argv)
        self.keep(agent=started["address"], session=session)
        try:
            return self.follow()
        except (Stopped, subprocess.TimeoutExpired):
            retire(self.meta)
            raise

    def keep(self, **values):
        self.meta.update({k: v for k, v in values.items() if v})
        save(self.path / "run.json", self.meta)

    def follow(self):
        """Waits for the end of the agent's first turn."""
        spent, last, ended, failures = 0.0, time.monotonic(), None, 0
        while True:
            try:
                terminal, failures = hc("get", self.meta["agent"], "--json"), 0
            except (CoreError, subprocess.TimeoutExpired) as error:
                # The core restarts for an update, and its terminals stay.
                failures += 1
                if getattr(error, "kind", None) == "not_found" or failures > 30:
                    raise RuntimeError(f"Lost the agent's terminal: {error}") from None
                time.sleep(POLL)
                continue
            status, now_ = status_of(terminal), time.monotonic()
            # The time that a person takes to answer does not count.
            spent += 0 if status == "blocked" else now_ - last
            last = now_
            if not self.meta.get("session") and self.spec["harness"] == "codex":
                self.keep(session=codex_session(terminal))
            if terminal["state"] == "finished":
                self.meta["exit_code"] = terminal.get("exit_code")
                if terminal.get("reason") == "killed":
                    return "stopped"
                if not terminal.get("turn"):
                    self.error = "The agent ended before it did the work."
                return "failed" if terminal.get("exit_code") or self.error else "done"
            if status == "error":
                self.error = terminal["status"].get("msg") or "The agent reported an error."
                return "failed"
            # Before its first turn an agent is idle too.
            if status in ("idle", "done") and terminal.get("turn"):
                ended = ended or now_
                if now_ - ended >= SETTLE:
                    return "done"
            else:
                ended = None
            if spent >= self.limit():
                raise subprocess.TimeoutExpired("agent", self.limit())
            time.sleep(POLL)

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
        if self.spec["kind"] == "prompt":
            read_transcript(self.path, self.meta)
        (self.path / "script").unlink(missing_ok=True)
        save(self.path / "run.json", self.meta)


# ---- what an agent said, from its own transcript ---------------------------------------


def opencode(method, path, *args):
    done = subprocess.run(["opencode", "api", method, path, *args], capture_output=True, text=True, timeout=30)
    try:
        return json.loads(done.stdout)["data"]
    except (ValueError, KeyError, TypeError):
        raise RuntimeError(f"OpenCode: {(done.stdout or done.stderr).strip()[:300]}") from None


def codex_trust(folder):
    return f"projects={{{json.dumps(os.path.realpath(folder))}={{trust_level=\"trusted\"}}}}"


def codex_session(terminal):
    """Codex keeps its session's file open."""
    pid = (terminal.get("foreground") or {}).get("pid")
    try:
        links = [os.readlink(link) for link in Path(f"/proc/{pid}/fd").iterdir()]
    except OSError:
        return None
    found = [re.search(r"/rollout-.*-([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$", link) for link in links]
    return next((match.group(1) for match in found if match), None)


def json_lines(file):
    for line in file.read_text(errors="replace").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict):
            yield event


# Each yields ("user" | "text" | "tool", text) in order.
def claude_items(session):
    for file in (Path.home() / ".claude/projects").glob(f"*/{session}.jsonl"):
        for event in json_lines(file):
            if event.get("isSidechain") or event.get("isMeta") or event.get("type") not in ("user", "assistant"):
                continue
            content = (event.get("message") or {}).get("content") or []
            for block in [{"type": "text", "text": content}] if isinstance(content, str) else content:
                if block.get("type") == "text":
                    yield ("text" if event["type"] == "assistant" else "user"), block["text"]
                elif block.get("type") == "tool_use":
                    yield "tool", f"{block['name']} {json.dumps(block.get('input'), ensure_ascii=False)}"


def codex_items(session):
    for file in (Path.home() / ".codex/sessions").glob(f"*/*/*/rollout-*-{session}.jsonl"):
        for event in json_lines(file):
            item = event.get("payload") or {}
            if event.get("type") != "response_item":
                continue
            if item.get("type") == "message" and item.get("role") == "assistant":
                yield "text", "\n".join(part.get("text", "") for part in item.get("content") or [])
            elif item.get("type") in ("function_call", "custom_tool_call"):
                yield "tool", f"{item.get('name')} {item.get('arguments') or item.get('input') or ''}"


def opencode_items(session):
    for message in reversed(opencode("get", f"/api/session/{quote(session)}/message")):
        if message.get("type") == "user":
            yield "user", message.get("text") or ""
        for part in message.get("content") or [] if message.get("type") == "assistant" else []:
            if part.get("type") == "text":
                yield "text", part["text"]
            elif part.get("type") == "tool":
                yield "tool", f"{part['name']} {json.dumps((part.get('state') or {}).get('input'), ensure_ascii=False)}"


def read_transcript(path, meta):
    """Saves the log and the answer: the text after the last tool or message of the person."""
    read = {"claude": claude_items, "codex": codex_items, "opencode": opencode_items}.get(meta.get("harness"))
    if not read or not meta.get("session"):
        return
    log, answer, texts = [], "", []
    try:
        for kind, text in read(meta["session"]):
            if kind == "text":
                texts.append(text)
                answer = "\n\n".join(texts)
                log.append(text)
            else:
                texts = []
                log.append(f"{'→' if kind == 'tool' else '>'} {' '.join(text.split())[:300]}")
    except (OSError, RuntimeError, AttributeError, KeyError, TypeError, subprocess.SubprocessError):
        return  # a transcript that is gone or has a new shape: the saved text stays
    if log:
        (path / "log.txt").write_text("\n".join(log)[-LOG_LIMIT:] + "\n")
        (path / "answer.md").write_text(answer)


def output(path):
    meta = load(path / "run.json") or {}
    if meta.get("kind") == "prompt":
        read_transcript(path, meta)

    def text(name):
        try:
            return (path / name).read_text(errors="replace")
        except OSError:
            return ""

    return {"answer": text("answer.md"), "log": "\n".join(text("log.txt").rstrip().split("\n")[-500:])}


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
    # An agent of an earlier run that works again, or that waits for a person, is a run too.
    busy = not lock
    for _, old in runs_of(folder) if lock else ():
        terminal = agent_of(old)
        if terminal and not placed(terminal) and status_of(terminal) in ("working", "blocked"):
            busy = True
    if busy:
        save(path / "run.json", {**meta, "finished": now()})
        prune(folder)
        return 0
    for other, old in runs_of(folder):
        retire(old)
        if old["state"] == "running":
            save(other / "run.json", {**old, "state": "interrupted"})
    meta["state"] = "running"
    save(path / "run.json", meta)
    for number in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(number, on_signal)
    job = Run(spec, path, meta)
    try:
        state = job.execute()
        job.finish(state, job.error)
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
    elif action == "output":
        if not re.fullmatch(r"[a-z0-9]+", args[1]):
            sys.exit("Invalid run.")
        print(json.dumps(output(base / "runs" / args[0] / args[1])))
    elif action == "delete":
        folder = base / "runs" / args[0]
        if locked(folder):
            sys.exit("This automation is running.")
        for path in list(folder.glob("*/")):
            drop(path)
        shutil.rmtree(folder, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
