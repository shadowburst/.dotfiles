"""Run: python3 config/herdr-app/tests/automations.py. Uses real processes and fake agents."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

RUNNER = Path(__file__).resolve().parents[1] / "mods/automations/runner.py"


class Automations(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="automations-")
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name) / "state"
        self.bin = Path(temp.name) / "bin"
        self.work = Path(temp.name) / "work"
        for folder in (self.base, self.bin, self.work):
            folder.mkdir()
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}", "HC_TERMINAL_ID": "t1", "HERDR_X": "1"}

    def define(self, text, kind="script", **extra):
        automation = {"id": "a1", "name": "Test", "kind": kind, "text": text, "folder": str(self.work), "cron": "", "active": True, "limit": 60, **extra}
        (self.base / "automations.json").write_text(json.dumps({"automations": [automation]}))

    def agent(self, name, *lines, code=0, stderr=""):
        # Records its arguments and input, then prints the events of the real program.
        events = self.bin / f"{name}.events"
        events.write_text("".join((line if isinstance(line, str) else json.dumps(line)) + "\n" for line in lines))
        file = self.bin / name
        file.write_text(f"""#!{sys.executable}
import json, os, sys
call = {{"argv": sys.argv[1:], "stdin": sys.stdin.read(), "env": sorted(os.environ), "cwd": os.getcwd()}}
json.dump(call, open({str(self.work / "call")!r}, "w"))
print(open({str(events)!r}).read(), end="", flush=True)
sys.stderr.write({stderr!r})
sys.exit({code})
""")
        file.chmod(0o755)

    def call(self):
        return json.loads((self.work / "call").read_text())

    def command(self, *args):
        return [sys.executable, "-I", str(RUNNER), str(self.base), *args]

    def run_(self, name="m1", trigger="manual"):
        return subprocess.run(self.command("run", "a1", name, trigger), env=self.env, capture_output=True, text=True, timeout=30)

    def start(self, name="m1"):
        proc = subprocess.Popen(self.command("run", "a1", name, "manual"), env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(lambda: proc.poll() is None and proc.kill())
        return proc

    def wait_for(self, path):
        for _ in range(100):
            if path.exists():
                return
            time.sleep(0.05)
        self.fail(f"{path} did not appear")

    def runs(self):
        out = subprocess.run(self.command("list"), env=self.env, capture_output=True, text=True, check=True).stdout
        return json.loads(out).get("a1", [])

    def log(self, name="m1"):
        return (self.base / "runs/a1" / name / "log.txt").read_text()

    def answer(self, name="m1"):
        return (self.base / "runs/a1" / name / "answer.md").read_text()

    def test_script_output_folder_and_private_files(self):
        self.define("pwd\necho out\necho err >&2\nprint -r -- $HC_TERMINAL_ID$HERDR_X")
        self.run_()
        run = self.runs()[0]
        self.assertEqual((run["state"], run["exit_code"], run["trigger"]), ("done", 0, "manual"))
        self.assertEqual(self.log(), f"{self.work}\nout\nerr\n\n")
        self.assertFalse((self.base / "runs/a1/m1/script").exists())
        self.assertEqual((self.base / "runs/a1/m1/run.json").stat().st_mode & 0o077, 0)

    def test_shebang_and_exit_code(self):
        self.define("#!/usr/bin/env python3\nimport sys\nprint('py')\nsys.exit(7)")
        self.run_()
        run = self.runs()[0]
        self.assertEqual((run["state"], run["exit_code"], self.log()), ("failed", 7, "py\n"))

    def test_missing_folder(self):
        self.define("echo no", folder="/nonexistent/x")
        self.run_()
        self.assertEqual(self.runs()[0]["state"], "failed")
        self.assertIn("does not exist", self.runs()[0]["error"])

    def test_missing_program(self):
        self.define("hello", "prompt", harness="claude")
        self.env["PATH"] = str(self.bin)
        self.run_()
        self.assertEqual(self.runs()[0]["state"], "failed")
        self.assertIn("claude", self.runs()[0]["error"])

    def test_claude(self):
        self.agent("claude", {"type": "system", "subtype": "init"},
                   {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": "ls"}}, {"type": "text", "text": "Looking"}]}},
                   {"type": "assistant", "parent_tool_use_id": "x", "message": {"content": [{"type": "text", "text": "subagent"}]}},
                   {"type": "result", "is_error": False, "result": "The **answer**", "permission_denials": [{"tool_name": "Write"}]})
        self.define("-do it", "prompt", harness="claude", model="opus", effort="high")
        self.run_()
        run, call = self.runs()[0], self.call()
        self.assertEqual((run["state"], self.answer()), ("done", "The **answer**"))
        self.assertEqual(call["stdin"], "-do it")
        self.assertEqual(call["argv"][:3], ["-p", "--session-id", run["session"]])
        self.assertEqual(call["argv"][-4:], ["--model", "opus", "--effort", "high"])
        self.assertNotIn("--dangerously-skip-permissions", call["argv"])
        self.assertEqual(call["cwd"], str(self.work))
        self.assertFalse([k for k in call["env"] if k.startswith(("HC_", "HERDR_"))])
        self.assertEqual(self.log(), '→ Bash {"command": "ls"}\nLooking\nPermission denied: Write\n')
        self.assertFalse((self.base / "runs/a1/m1/prompt").exists())

    def test_claude_error_result(self):
        self.agent("claude", {"type": "result", "is_error": True, "result": "Usage limit reached"})
        self.define("x", "prompt", harness="claude")
        self.run_()
        self.assertEqual((self.runs()[0]["state"], self.runs()[0]["error"]), ("failed", "Usage limit reached"))

    def test_codex(self):
        self.agent("codex", {"type": "thread.started", "thread_id": "th-1"},
                   {"type": "item.completed", "item": {"type": "command_execution", "command": "ls -la"}},
                   {"type": "item.completed", "item": {"type": "agent_message", "text": "first"}},
                   {"type": "item.completed", "item": {"type": "agent_message", "text": "last"}}, stderr="warned\n")
        self.define("go", "prompt", harness="codex", model="gpt", effort="low")
        self.run_()
        self.assertEqual((self.runs()[0]["session"], self.runs()[0]["state"], self.answer()), ("th-1", "done", "last"))
        self.assertEqual(self.call()["argv"], ["--no-daemon", "exec", "--json", "--skip-git-repo-check", "-m", "gpt", "-c", "model_reasoning_effort=low", "-"])
        self.assertIn("→ command_execution ls -la\n", self.log())
        self.assertIn("warned\n", self.log())

    def test_opencode(self):
        self.agent("opencode", {"type": "step_start", "sessionID": "ses_1", "part": {}}, {"type": "text", "sessionID": "ses_1", "part": {"text": "working"}},
                   {"type": "tool_use", "sessionID": "ses_1", "part": {"tool": "read", "state": {"input": {"path": "a"}}}},
                   {"type": "step_start", "sessionID": "ses_1", "part": {}}, {"type": "text", "sessionID": "ses_1", "part": {"text": "one"}},
                   {"type": "text", "sessionID": "ses_1", "part": {"text": "two"}})
        self.define("-go", "prompt", harness="opencode", provider="openai", model="gpt", effort="high")
        self.run_()
        self.assertEqual((self.runs()[0]["session"], self.runs()[0]["state"], self.answer()), ("ses_1", "done", "one\n\ntwo"))
        self.assertEqual(self.call()["argv"], ["run", "--format", "json", "--title", "Test", "-m", "openai/gpt#high", "--", "-go"])

    def test_opencode_error_event(self):
        # OpenCode can exit with 0 after an error event.
        self.agent("opencode", {"type": "error", "sessionID": "ses_1", "error": {"message": "Model unavailable"}})
        self.define("go", "prompt", harness="opencode", provider="p", model="m")
        self.run_()
        self.assertEqual((self.runs()[0]["state"], self.runs()[0]["error"]), ("failed", "Model unavailable"))

    def test_unknown_events_stay_in_the_log(self):
        self.agent("codex", "plain text", {"type": "item.completed", "item": {"type": "agent_message"}})
        self.define("go", "prompt", harness="codex")
        self.run_()
        self.assertEqual(self.runs()[0]["state"], "done")
        self.assertIn("plain text\n", self.log())
        self.assertIn("agent_message", self.log())

    def test_overlap_is_skipped(self):
        self.define("touch started; sleep 20")
        proc = self.start()
        self.wait_for(self.work / "started")
        self.run_("s2", "schedule")
        self.assertEqual({r["id"]: r["state"] for r in self.runs()}, {"m1": "running", "s2": "skipped"})
        deleted = subprocess.run(self.command("delete", "a1"), env=self.env, capture_output=True, text=True)
        self.assertNotEqual(deleted.returncode, 0)
        proc.send_signal(signal.SIGHUP)
        proc.wait(10)

    def test_listing_never_causes_a_skip(self):
        self.define("true")
        loop = "while true; do " + " ".join(map(repr, self.command("list"))) + "; done"
        pollers = [subprocess.Popen(["sh", "-c", loop], stdout=subprocess.DEVNULL) for _ in range(3)]
        self.addCleanup(lambda: [(p.kill(), p.wait()) for p in pollers])
        for n in range(8):
            self.run_(f"m{n}")
        self.assertEqual({r["state"] for r in self.runs()}, {"done"})

    def test_a_scheduled_minute_runs_once(self):
        self.define("echo run >> count")
        self.run_("s5", "schedule")
        self.run_("s5", "schedule")
        self.assertEqual((self.work / "count").read_text(), "run\n")

    def test_stop_ends_the_whole_group(self):
        self.define("sleep 60 & echo $! > child; touch started; wait")
        proc = self.start()
        self.wait_for(self.work / "started")
        proc.send_signal(signal.SIGHUP)  # what `hc kill` sends
        proc.wait(10)
        self.assertEqual(self.runs()[0]["state"], "stopped")
        child = int((self.work / "child").read_text())
        time.sleep(0.2)
        stat = Path(f"/proc/{child}/stat")
        self.assertTrue(not stat.exists() or stat.read_text().split()[2] == "Z")

    def test_time_limit(self):
        self.define("sleep 60", limit=0.01)
        self.run_()
        self.assertEqual(self.runs()[0]["state"], "timeout")

    def test_a_dead_runner_is_interrupted_and_does_not_block(self):
        self.define("touch started; sleep 20")
        proc = self.start()
        self.wait_for(self.work / "started")
        proc.kill()
        proc.wait()
        self.assertEqual(self.runs()[0]["state"], "interrupted")
        self.define("true")
        self.run_("m2")
        self.assertEqual({r["id"]: r["state"] for r in self.runs()}, {"m1": "interrupted", "m2": "done"})

    def test_keeps_twenty_results_besides_skipped_ones(self):
        self.define("true")
        folder = self.base / "runs/a1"
        for n in range(30):
            for prefix, state in (("m", "done"), ("s", "skipped")):
                path = folder / f"{prefix}{n}"
                path.mkdir(parents=True)
                (path / "run.json").write_text(json.dumps({"id": f"{prefix}{n}", "state": state, "started": n}))
        self.run_("m99")
        states = [r["state"] for r in self.runs()]
        self.assertEqual((states.count("done"), states.count("skipped")), (20, 20))
        self.assertEqual(self.runs()[0]["id"], "m99")

    def test_delete_and_invalid_id(self):
        self.define("true")
        self.run_()
        outside = self.base / "keep"
        outside.mkdir()
        self.assertNotEqual(subprocess.run(self.command("delete", "../keep"), capture_output=True).returncode, 0)
        self.assertTrue(outside.exists())
        subprocess.run(self.command("delete", "a1"), check=True)
        self.assertEqual(self.runs(), [])


if __name__ == "__main__":
    unittest.main()
