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
                    "HC_TERMINAL_ID": "test-task", "SHELL": "/bin/sh", "ENV": "", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1",
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
        self.program("wt", '''import os, subprocess, sys
from pathlib import Path
b = Path(os.environ["FIXTURE"])
(b / "setup.started").touch()
if os.environ.get("FAIL_SETUP"):
    sys.exit(7)
args = sys.argv
if "--create" in args:
    branch = args[args.index("--create") + 1]
    base = args[args.index("--base") + 1]
    command = ["git", "worktree", "add", "--quiet", "-b", branch, str(b / branch.replace("/", "-")), base]
else:
    command = ["git", "worktree", "add", "--quiet", str(b / args[2].replace("/", "-")), args[2]]
subprocess.run(command, check=True)
(b / "setup.done").touch()
''')
        self.naming = self.program("namer", '''import os, sys
from pathlib import Path
b = Path(os.environ["FIXTURE"])
assert not (b / "setup.started").exists(), "Name the branch before setup"
(b / "naming.started").touch()
sys.stdin.read()
if os.environ.get("FAIL_NAMING"):
    sys.exit(1)
print(os.environ.get("NAME", "Feat/voice-worktree"))
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

    # Runs the worker; by default it must succeed. Returns the task and what the agent saw.
    # `input` is what the person types in the shell that the agent leaves.
    def run_task(self, ok=True, input="", **changes):
        task = {"root": str(self.repo), "branch": "", "base": "main",
                "prompt": 'Fix "quotes"; $(touch injected)\n{{ task }}', "naming": [self.naming], "agent": [self.agent], **changes}
        spec = self.base / "spec.json"
        spec.write_text(json.dumps(task))
        spec.chmod(0o600)
        result = subprocess.run([sys.executable, str(RUNNER), str(spec)], env=self.env, cwd=self.repo, text=True, capture_output=True, timeout=10, input=input, start_new_session=True)
        self.assertEqual(result.returncode == 0, ok, result.stderr)
        self.assertFalse(spec.exists(), "Remove the private submission file after reading it")
        self.labels = (self.base / "labels").read_text() if (self.base / "labels").exists() else ""
        agent = self.base / "agent.json"
        return task, json.loads(agent.read_text()) if agent.exists() else None

    def test_name_decides_branch_and_folder_before_setup(self):
        task, agent = self.run_task()
        self.assertTrue(agent["after_hooks"], "Start the agent only after setup succeeds")
        self.assertEqual(agent["branch"], "feat/voice-worktree")
        self.assertEqual(agent["cwd"], str(self.base / "feat-voice-worktree"))
        self.assertEqual(agent["argv"], [task["prompt"]])
        self.assertFalse((self.repo / "injected").exists())
        self.assertIn("task.state=ready", self.labels)
        log = self.base / "spec.json.log"
        self.assertEqual(log.stat().st_mode & 0o777, 0o600)
        self.assertIn("Saved setup output", log.read_text())
        self.assertEqual(self.git("config", "branch.feat/voice-worktree.gh-merge-base"), "main")

    def test_shell_stays_in_worktree_after_agent(self):
        # The shell reads this when the agent has quit (sh, so no personal rc file runs).
        agent = self.run_task(input="echo left > shell-cwd\n")[1]
        self.assertTrue((Path(agent["cwd"]) / "shell-cwd").exists(), "Quitting the agent leaves a shell in the worktree")

    def test_failed_agent_leaves_shell(self):
        self.run_task(agent=["missing-agent"], input="echo left > shell-cwd\n")
        self.assertTrue((self.base / "feat-voice-worktree/shell-cwd").exists())

    def test_name_has_at_most_four_words(self):
        self.env["NAME"] = "Sure: fix/login-button-breaks-on-mobile-safari"
        self.assertEqual(self.run_task()[1]["branch"], "fix/login-button-breaks-on")

    def test_naming_failure_names_from_task_text(self):
        self.env["FAIL_NAMING"] = "1"
        self.assertEqual(self.run_task(prompt="Réparer le bouton de connexion cassé")[1]["branch"], "feat/reparer-le-bouton-de")
        self.assertIn("name comes from the task text", self.labels)

    def test_taken_name_gets_suffix_and_is_not_overwritten(self):
        original = self.git("rev-parse", "HEAD")
        self.git("branch", "feat/voice-worktree")
        self.git("update-ref", "refs/remotes/origin/feat/voice-worktree-2", "HEAD")
        self.assertEqual(self.run_task()[1]["branch"], "feat/voice-worktree-3")
        self.assertEqual(self.git("rev-parse", "feat/voice-worktree"), original)

    def test_setup_failure_does_not_start_agent(self):
        self.env["FAIL_SETUP"] = "1"
        self.assertIsNone(self.run_task(ok=False)[1])
        self.assertIn("task.state=failed", self.labels)

    def test_explicit_branch_skips_naming(self):
        self.assertEqual(self.run_task(branch="fix/explicit")[1]["branch"], "fix/explicit")
        self.assertFalse((self.base / "naming.started").exists())

    def test_existing_checkout_is_reused_without_hooks(self):
        self.assertEqual(self.run_task(branch="main")[1]["cwd"], str(self.repo))
        self.assertFalse((self.base / "setup.started").exists())

    def test_existing_branch_without_checkout(self):
        self.git("branch", "fix/existing")
        self.assertEqual(self.run_task(branch="fix/existing")[1]["branch"], "fix/existing")

    def test_exact_remote_base_and_upstream(self):
        self.git("remote", "add", "origin", "https://example.invalid/repo")
        self.git("update-ref", "refs/remotes/origin/feature", "HEAD")
        self.run_task(branch="fix/remote", base="refs/remotes/origin/feature", remote="origin", mergeBase="feature")
        self.assertEqual(self.git("rev-parse", "--abbrev-ref", "fix/remote@{upstream}"), "origin/feature")
        self.assertEqual(self.git("config", "branch.fix/remote.gh-merge-base"), "feature")

    def test_create_from_base_never_reuses_colliding_branch(self):
        self.git("branch", "fix/collision")
        before = self.git("rev-parse", "fix/collision")
        self.assertIsNone(self.run_task(ok=False, branch="fix/collision", createFromBase=True)[1])
        self.assertEqual(self.git("rev-parse", "fix/collision"), before)

    def test_plain_checkout_finishes_without_agent(self):
        self.assertIsNone(self.run_task(branch="fix/no-agent", agent=[])[1])
        self.assertIn("task.state=ready", self.labels)

if __name__ == "__main__":
    unittest.main()
