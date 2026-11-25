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
        # The real runner, with shorter waits.
        self.runner = Path(temp.name) / "runner.py"
        source = RUNNER.read_text()
        self.assertTrue("\nPOLL = 1\n" in source and "\nSETTLE = 3 " in source)
        self.runner.write_text(source.replace("\nPOLL = 1\n", "\nPOLL = 0.2\n").replace("\nSETTLE = 3 ", "\nSETTLE = 0.3 "))
        self.base = Path(temp.name) / "state"
        self.bin = Path(temp.name) / "bin"
        self.work = Path(temp.name) / "work"
        for folder in (self.base, self.bin, self.work):
            folder.mkdir()
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}", "HC_TERMINAL_ID": "t1", "HERDR_X": "1"}

    def define(self, text, kind="script", **extra):
        automation = {"id": "a1", "name": "Test", "kind": kind, "text": text, "folder": str(self.work), "cron": "", "active": True, "limit": 60, **extra}
        (self.base / "automations.json").write_text(json.dumps({"automations": [automation]}))

    def command(self, *args):
        return [sys.executable, "-I", str(self.runner), str(self.base), *args]

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

    # ---- prompts: a fake hc plays the agent's statuses, one for each `get` ----

    def core(self, *statuses, turn=1, **last):
        """The agent's terminal: (state) words, then `last` fields on the final one."""
        frames = [{"state": "live", "turn": 0, "status": {"state": w} if w else None} for w in statuses]
        frames.append({"state": "live", "turn": turn, "status": {"state": "idle"}, **last})
        (self.bin / "frames").write_text(json.dumps(frames))
        self.program("hc", """
calls = open(f"{here}/calls", "a"); calls.write(json.dumps([sys.argv[1:], "HC_TERMINAL_ID" in os.environ]) + "\\n"); calls.close()
labels = f"{here}/labels-"
if sys.argv[1] == "run":
    address = f"t{sum(1 for _ in open(f'{here}/calls'))}"
    json.dump(dict(a.split("=", 1) for a in sys.argv if a.startswith("automation.")), open(labels + address, "w"))
    print(json.dumps({"address": address}))
elif sys.argv[1] == "get":
    if not os.path.exists(labels + sys.argv[2]):
        print(json.dumps({"error": {"kind": "not_found", "message": "gone"}}), file=sys.stderr); sys.exit(3)
    frames = json.load(open(f"{here}/frames"))
    if len(frames) > 1: json.dump(frames[1:], open(f"{here}/frames", "w"))
    print(json.dumps({"labels": json.load(open(labels + sys.argv[2])), **frames[0]}))
elif sys.argv[1] == "rm":
    os.path.exists(labels + sys.argv[2]) and os.unlink(labels + sys.argv[2])
    print("{}")
else: print("{}")
""")

    def program(self, name, body):
        file = self.bin / name
        file.write_text(f"#!{sys.executable}\nimport json, os, sys\nhere = {str(self.bin)!r}\n{body}")
        file.chmod(0o755)

    def calls(self, name):
        return [c for c, _ in map(json.loads, (self.bin / "calls").read_text().splitlines()) if c[0] == name]

    def agent_argv(self):
        call = self.calls("run")[0]
        return call[call.index("--") + 1:]

    def prompt(self, harness, text="-do it", **extra):
        self.env["HOME"] = str(self.work)
        (self.work / ".claude.json").write_text(json.dumps({"keep": 1, "projects": {"/other": {"x": 1}}}))
        self.define(text, "prompt", harness=harness, **extra)

    def output(self, name="m1"):
        done = subprocess.run(self.command("output", "a1", name), env=self.env, capture_output=True, text=True, check=True)
        return json.loads(done.stdout)

    def test_prompt_is_an_ordinary_hidden_agent(self):
        self.core(None, "idle", "working")
        self.prompt("claude", model="opus", effort="high")
        self.run_()
        run = self.runs()[0]
        self.assertEqual(run["state"], "done")
        self.assertEqual(self.agent_argv(), ["claude", "--session-id", run["session"], "--model", "opus", "--effort", "high", "--", "-do it"])
        start = self.calls("run")[0]
        self.assertIn("automation.agent=a1", start)
        self.assertNotIn("automation.id=a1", start)
        self.assertIn("--outlive-parent", start)
        self.assertEqual(self.calls("kill"), [], "The agent stays, for the person to continue")
        self.assertFalse(any(inside for _, inside in map(json.loads, (self.bin / "calls").read_text().splitlines())), "Nobody's sub-agent")

    def test_idle_before_the_first_turn_is_not_the_end(self):
        self.core("idle", "idle", "idle", "idle", "idle", "idle", "working")
        self.prompt("codex")
        self.run_()
        self.assertEqual((self.runs()[0]["state"], json.loads((self.bin / "frames").read_text())[0]["turn"]), ("done", 1))

    def test_waiting_for_a_person_does_not_use_the_time_limit(self):
        self.core("working", *["blocked"] * 20)
        self.prompt("codex", limit=2.5 / 60)
        self.run_()
        self.assertEqual(self.runs()[0]["state"], "done")

    def test_time_limit_ends_the_agent(self):
        self.core(*["working"] * 20)
        self.prompt("codex", limit=1.5 / 60)
        self.run_()
        self.assertEqual(self.runs()[0]["state"], "timeout")
        self.assertEqual(len(self.calls("kill")), 1)

    def test_stop_ends_the_agent(self):
        self.core(*["working"] * 50)
        self.prompt("codex")
        proc = self.start()
        self.wait_for(self.bin / "calls")
        time.sleep(1.5)
        proc.send_signal(signal.SIGHUP)
        proc.wait(10)
        self.assertEqual(self.runs()[0]["state"], "stopped")
        self.assertEqual(len(self.calls("kill")), 1)

    def test_agent_error_and_early_exit(self):
        self.core("working", status={"state": "error", "msg": "Usage limit reached"})
        self.prompt("codex")
        self.run_()
        self.assertEqual((self.runs()[0]["state"], self.runs()[0]["error"]), ("failed", "Usage limit reached"))
        for label in self.bin.glob("labels-*"):
            label.unlink()
        self.core("idle", state="finished", turn=0, exit_code=0, status=None)
        self.run_("m2")
        self.assertEqual(self.runs()[0]["state"], "failed")
        for label in self.bin.glob("labels-*"):
            label.unlink()
        self.core("working", state="finished", exit_code=None, reason="killed", status=None)
        self.run_("m3")
        self.assertEqual(self.runs()[0]["state"], "stopped")

    def test_missing_core(self):
        self.prompt("codex")
        self.env["PATH"] = str(self.bin)
        self.run_()
        self.assertEqual(self.runs()[0]["state"], "failed")

    def test_an_agent_that_waits_or_works_blocks_the_next_run(self):
        self.core("working")
        self.prompt("codex")
        self.run_()
        for word in ("blocked", "working"):
            (self.bin / "frames").write_text(json.dumps([{"state": "live", "turn": 1, "status": {"state": word}}]))
            self.run_(f"s{word[0]}", "schedule")
            self.assertEqual(self.runs()[0]["state"], "skipped")
        self.assertEqual(len(self.calls("run")), 1)

    def test_the_next_run_ends_a_finished_agent_but_not_one_in_a_tab(self):
        self.core("working")
        self.prompt("codex")
        self.run_()
        first = self.runs()[0]["agent"]
        self.core("idle", "working")
        (self.bin / "frames").write_text(json.dumps([{"state": "live", "turn": 1, "status": {"state": "idle"}}]))
        self.run_("m2")
        self.assertEqual([c[1] for c in self.calls("kill")], [first])
        second = self.runs()[0]["agent"]
        labels = self.bin / f"labels-{second}"
        labels.write_text(json.dumps({**json.loads(labels.read_text()), "herdr.space": "sp1"}))
        (self.bin / "frames").write_text(json.dumps([{"state": "live", "turn": 2, "status": {"state": "working"}}] * 2 + [{"state": "live", "turn": 1, "status": {"state": "idle"}}]))
        self.run_("m3")
        self.assertEqual(self.runs()[0]["state"], "done", "A tab does not block the schedule")
        self.assertEqual([c[1] for c in self.calls("kill")], [first])
        subprocess.run(self.command("delete", "a1"), env=self.env, check=True)
        self.assertTrue(labels.exists(), "Deletion leaves the tab too")

    def test_claude_folder_is_trusted_before_the_start(self):
        self.core("working")
        self.prompt("claude")
        self.run_()
        config = json.loads((self.work / ".claude.json").read_text())
        self.assertEqual(config, {"keep": 1, "projects": {"/other": {"x": 1}, str(self.work): {"hasTrustDialogAccepted": True}}})
        self.assertEqual((self.work / ".claude.json").stat().st_mode & 0o077, 0)
        self.assertFalse((self.work / ".claude.json.lock").exists())
        before = (self.work / ".claude.json").stat().st_mtime_ns
        self.run_("m2")
        self.assertEqual((self.work / ".claude.json").stat().st_mtime_ns, before, "No write when it is trusted")

    def test_unreadable_claude_configuration_is_never_overwritten(self):
        self.core("working")
        self.prompt("claude")
        (self.work / ".claude.json").write_text("{ broken")
        self.run_()
        self.assertEqual(self.runs()[0]["state"], "failed")
        self.assertEqual((self.work / ".claude.json").read_text(), "{ broken")
        self.assertFalse((self.work / ".claude.json.lock").exists())

    def test_codex_trusts_the_folder_for_this_run(self):
        self.core("working")
        self.prompt("codex", model="gpt", effort="low")
        self.run_()
        self.assertEqual(self.agent_argv(), ["codex", "--no-daemon", "-c", f'projects={{"{self.work}"={{trust_level="trusted"}}}}',
                                             "-m", "gpt", "-c", "model_reasoning_effort=low", "--", "-do it"])
        self.assertNotIn(str(self.work), (self.work / ".claude.json").read_text())

    def test_claude_transcript(self):
        self.core("working")
        self.prompt("claude")
        self.run_()
        folder = self.work / ".claude/projects/x"
        folder.mkdir(parents=True)
        events = [("user", "Go"), ("assistant", [{"type": "text", "text": "Looking"}]), ("assistant", [{"type": "tool_use", "name": "Bash", "input": {"command": "ls"}}]),
                  ("user", [{"type": "tool_result", "content": "x"}]), ("assistant", [{"type": "text", "text": "One"}]), ("assistant", [{"type": "text", "text": "**Two**"}])]
        lines = [{"type": kind, "message": {"content": content}} for kind, content in events]
        lines.insert(2, {"type": "assistant", "isSidechain": True, "message": {"content": [{"type": "text", "text": "sub-agent"}]}})
        file = folder / f"{self.runs()[0]['session']}.jsonl"
        file.write_text("".join(json.dumps(line) + "\n" for line in lines) + "not json\n")
        expected = {"answer": "One\n\n**Two**", "log": '> Go\nLooking\n→ Bash {"command": "ls"}\nOne\n**Two**'}
        self.assertEqual(self.output(), expected)
        with file.open("a") as more:  # the person continued the agent
            more.write(json.dumps({"type": "user", "message": {"content": "And?"}}) + "\n" + json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "Three"}]}}) + "\n")
        self.assertEqual(self.output()["answer"], "Three")
        file.unlink()
        self.assertEqual(self.output()["answer"], "Three", "The saved text stays when the transcript is gone")

    def test_codex_session_and_transcript(self):
        session = "01a212fc-c8e5-7942-aa1e-d3bcc827bae2"
        folder = self.work / ".codex/sessions/2026/11/25"
        folder.mkdir(parents=True)
        items = [{"type": "message", "role": "user", "content": [{"text": "instructions"}]}, {"type": "function_call", "name": "shell", "arguments": "ls"},
                 {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "Done"}]}]
        file = folder / f"rollout-2026-11-25T14-54-46-{session}.jsonl"
        file.write_text("".join(json.dumps({"type": "response_item", "payload": item}) + "\n" for item in items))
        # The session is the file that the agent's process keeps open.
        with file.open() as handle:
            holder = subprocess.Popen(["sleep", "30"], pass_fds=[handle.fileno()])
        self.addCleanup(lambda: (holder.kill(), holder.wait()))
        self.core("working", foreground={"pid": holder.pid})
        self.prompt("codex")
        self.run_()
        self.assertEqual(self.runs()[0]["session"], session)
        self.assertEqual(self.output(), {"answer": "Done", "log": "→ shell ls\nDone"})

    def test_opencode_session_and_transcript(self):
        self.core("working")
        self.program("opencode", """
open(f"{here}/api", "a").write(json.dumps(sys.argv[1:]) + "\\n")
if sys.argv[2] == "post": print(json.dumps({"data": {"id": "ses_1"}}))
else: print(json.dumps({"data": [{"type": "assistant", "content": [{"type": "tool", "name": "read", "state": {"input": {"path": "a"}}}, {"type": "text", "text": "Two"}]}, {"type": "user", "text": "Go"}]}))
""")
        self.prompt("opencode", provider="openai", model="gpt", effort="high")
        self.run_()
        self.assertEqual(self.agent_argv(), ["opencode", "--session", "ses_1", "--prompt=-do it"])
        body = json.loads(json.loads((self.bin / "api").read_text().splitlines()[0])[-1])
        self.assertEqual(body, {"model": {"providerID": "openai", "id": "gpt", "variant": "high"}, "location": {"directory": str(self.work)}})
        self.assertEqual(self.output(), {"answer": "Two", "log": '> Go\n→ read {"path": "a"}\nTwo'})

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
