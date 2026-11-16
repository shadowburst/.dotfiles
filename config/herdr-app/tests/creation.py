"""Run: python3 config/herdr-app/tests/creation.py. Uses real Git and fake hooks/agents."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

RUNNER = Path(__file__).resolve().parents[1] / "mods/worktrees/create.py"


class Creation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="worktree-task-", dir="/tmp/opencode")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / "repo"
        self.repo.mkdir()
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}", "FIXTURE": str(self.base),
                    "HC_TERMINAL_ID": "test-task", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1",
                    "GIT_AUTHOR_NAME": "Task Test", "GIT_AUTHOR_EMAIL": "test@example.invalid",
                    "GIT_COMMITTER_NAME": "Task Test", "GIT_COMMITTER_EMAIL": "test@example.invalid"}
        self.git("init", "--initial-branch=main")
        self.git("commit", "--allow-empty", "-m", "root")
        self.program("hc", '''import json, os, sys
from pathlib import Path
if sys.argv[1] == "read":
    print("Saved setup output")
else:
    with (Path(os.environ["FIXTURE"]) / "labels").open("a") as f:
        f.write(json.dumps(sys.argv[1:]) + "\\n")
''')
        self.program("wt", '''import os, subprocess, sys, time
from pathlib import Path
b = Path(os.environ["FIXTURE"])
(b / "setup.started").touch()
if os.environ.get("PARALLEL"):
    end = time.monotonic() + 3
    while not (b / "naming.started").exists() and time.monotonic() < end:
        time.sleep(.01)
    assert (b / "naming.started").exists(), "Naming did not start alongside setup"
if os.environ.get("FAIL_SETUP"):
    sys.exit(7)
args = sys.argv
if "--create" in args:
    branch = args[args.index("--create") + 1]
    base = args[args.index("--base") + 1]
    command = ["git", "worktree", "add", "--quiet", "-b", branch, str(b / "unchanged folder"), base]
else:
    command = ["git", "worktree", "add", "--quiet", str(b / "unchanged folder"), args[2]]
subprocess.run(command, check=True)
(b / "setup.done").touch()
''')
        self.naming = self.program("namer", '''import os, sys
from pathlib import Path
(Path(os.environ["FIXTURE"]) / "naming.started").touch()
sys.stdin.read()
if os.environ.get("FAIL_NAMING"):
    sys.exit(1)
print("feat/voice-worktree")
''')
        self.agent = self.program("agent", '''import json, os, subprocess, sys
from pathlib import Path
b = Path(os.environ["FIXTURE"])
(b / "agent.json").write_text(json.dumps({"cwd": os.getcwd(), "argv": sys.argv[1:],
    "after_hooks": (b / "setup.done").exists(),
    "branch": subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()}))
''')

    def program(self, name, body):
        file = self.bin / name
        file.write_text(f"#!{sys.executable}\n" + body)
        file.chmod(0o700)
        return str(file)

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], env=self.env, text=True, capture_output=True, check=True).stdout.strip()

    def run_task(self, **changes):
        task = {"root": str(self.repo), "branch": "worktree/default-name", "base": "main", "rename": True,
                "prompt": 'Fix "quotes"; $(touch injected)\n{{ task }}', "naming": [self.naming], "agent": [self.agent], **changes}
        spec = self.base / "spec.json"
        spec.write_text(json.dumps(task))
        spec.chmod(0o600)
        result = subprocess.run([sys.executable, str(RUNNER), str(spec)], env=self.env, cwd=self.repo, text=True, capture_output=True, timeout=10)
        self.assertFalse(spec.exists(), "Remove the private submission file after reading it")
        self.labels = (self.base / "labels").read_text() if (self.base / "labels").exists() else ""
        return task, result

    def test_parallel_setup_and_rename_keep_folder_and_prompt(self):
        self.env["PARALLEL"] = "1"
        task, result = self.run_task()
        self.assertEqual(result.returncode, 0, result.stderr)
        agent = json.loads((self.base / "agent.json").read_text())
        self.assertTrue(agent["after_hooks"], "Start the agent only after setup succeeds")
        self.assertEqual(agent["branch"], "feat/voice-worktree")
        self.assertEqual(agent["cwd"], str(self.base / "unchanged folder"))
        self.assertEqual(agent["argv"], [task["prompt"]])
        self.assertFalse((self.repo / "injected").exists())
        self.assertIn("task.state=ready", self.labels)
        log = self.base / "spec.json.log"
        self.assertEqual(log.stat().st_mode & 0o777, 0o600)
        self.assertIn("Saved setup output", log.read_text())
        self.assertEqual(self.git("config", "branch.feat/voice-worktree.gh-merge-base"), "main")

    def test_setup_failure_does_not_start_agent(self):
        self.env["FAIL_SETUP"] = "1"
        _, result = self.run_task()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.base / "agent.json").exists())
        self.assertIn("task.state=failed", self.labels)

    def test_naming_failure_keeps_temporary_branch(self):
        self.env["FAIL_NAMING"] = "1"
        _, result = self.run_task()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.base / "agent.json").read_text())["branch"], "worktree/default-name")
        self.assertIn("temporary name was kept", self.labels)

    def test_naming_collision_does_not_overwrite_branch(self):
        original = self.git("rev-parse", "HEAD")
        self.git("branch", "feat/voice-worktree")
        _, result = self.run_task()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.base / "agent.json").read_text())["branch"], "feat/voice-worktree-2")
        self.assertEqual(self.git("rev-parse", "feat/voice-worktree"), original)

    def test_explicit_branch_is_not_renamed(self):
        _, result = self.run_task(branch="fix/explicit", rename=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.base / "naming.started").exists())
        self.assertEqual(json.loads((self.base / "agent.json").read_text())["branch"], "fix/explicit")

    def test_existing_checkout_is_reused_without_hooks(self):
        _, result = self.run_task(branch="main", rename=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.base / "setup.started").exists())
        self.assertEqual(json.loads((self.base / "agent.json").read_text())["cwd"], str(self.repo))

    def test_existing_branch_without_checkout(self):
        self.git("branch", "fix/existing")
        _, result = self.run_task(branch="fix/existing", rename=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.base / "agent.json").read_text())["branch"], "fix/existing")

    def test_exact_remote_base_and_upstream(self):
        self.git("remote", "add", "origin", "https://example.invalid/repo")
        self.git("update-ref", "refs/remotes/origin/feature", "HEAD")
        _, result = self.run_task(branch="fix/remote", base="refs/remotes/origin/feature", remote="origin", mergeBase="feature", rename=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git("rev-parse", "--abbrev-ref", "fix/remote@{upstream}"), "origin/feature")
        self.assertEqual(self.git("config", "branch.fix/remote.gh-merge-base"), "feature")

    def test_create_from_base_never_reuses_colliding_branch(self):
        self.git("branch", "fix/collision")
        before = self.git("rev-parse", "fix/collision")
        _, result = self.run_task(branch="fix/collision", createFromBase=True, rename=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.base / "agent.json").exists())
        self.assertEqual(self.git("rev-parse", "fix/collision"), before)

    def test_plain_checkout_finishes_without_agent(self):
        _, result = self.run_task(branch="fix/no-agent", rename=False, agent=[])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.base / "agent.json").exists())
        self.assertIn("task.state=ready", self.labels)


if __name__ == "__main__":
    unittest.main()
