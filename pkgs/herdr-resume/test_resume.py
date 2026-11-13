import concurrent.futures
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import resume


class ResumeTests(unittest.TestCase):
    def report(self, agent, event, **extra):
        env = {"HC_TERMINAL_ID": "t1", "HC_TERMINAL_SOCKET": "/core.sock"} | extra
        def reply(method, **params):
            return {"keep": True, **params}
        with patch.dict(os.environ, env, clear=True), patch.object(resume, "core", side_effect=reply) as core:
            resume.report(agent, event)
        return core

    def test_native_plugins_capture_and_clear_without_wrapped_launches(self):
        for agent in ["claude", "codex", "opencode"]:
            with self.subTest(agent=agent):
                event = {"session_id": "selected", "cwd": "/project"}
                record = self.report(agent, event).call_args.kwargs["resume"]
                self.assertEqual(record["key"], f"{agent}:selected")
                self.assertEqual(record["cwd"], "/project")
                self.assertEqual(record["argv"], resume.resume_argv(agent, "selected", []))
                self.report(agent, event | {"hook_event_name": "SessionEnd"}).assert_called_with(
                    "terminal.keep", keep=True, clear_resume=f"{agent}:selected")

    def test_subagents_and_unkept_terminals_are_ignored(self):
        event = {"session_id": "child"}
        self.report("claude", event | {"agent_id": "subagent"}).assert_not_called()
        self.report("claude", event, CLAUDE_CODE_ENTRYPOINT="opencode").assert_not_called()
        self.report("codex", event, CODEX_THREAD_ID="root").assert_not_called()
        self.report("opencode", event, HC_TERMINAL_SOCKET="").assert_not_called()
        with patch.dict(os.environ, {"HC_TERMINAL_ID": "t1", "HC_TERMINAL_SOCKET": "/core"}), \
             patch.object(resume, "core", return_value={"keep": False}) as core:
            resume.report("claude", event)
            core.assert_called_once_with("terminal.get")

    def test_invalid_hook_data_does_not_change_the_record(self):
        for session in [None, "", "--last", "bad\ncommand", "x" * 513]:
            with self.subTest(session=session), self.assertRaises(ValueError):
                self.report("claude", {"session_id": session})
        with self.assertRaises(ValueError):
            self.report("opencode", {"session_id": "selected", "argv": [None]})

    def test_opencode_keeps_its_server_but_does_not_replay_launch_prompts(self):
        argv = resume.resume_argv("opencode", "selected", [
            "--auto", "--prompt", "do not repeat this", "--server", "http://server",
        ])
        self.assertEqual(argv[-2:], ["--server", "http://server"])
        self.assertNotIn("--auto", argv)
        self.assertNotIn("do not repeat this", argv)

    def test_hook_processes_use_only_the_supplied_socket(self):
        for agent in ["claude", "codex", "opencode"]:
            with self.subTest(agent=agent), tempfile.TemporaryDirectory() as folder:
                endpoint = str(Path(folder) / "core.sock")
                requests = []
                def serve(server):
                    for _ in range(4):
                        with server.accept()[0] as client, client.makefile("rb") as stream:
                            request = json.loads(stream.readline())
                            requests.append(request)
                            params = request["params"]
                            result = {"keep": True, **params}
                            client.sendall((json.dumps({"id": 1, "result": result}) + "\n").encode())
                with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server, \
                     concurrent.futures.ThreadPoolExecutor() as pool:
                    server.settimeout(3)
                    server.bind(endpoint)
                    server.listen()
                    serving = pool.submit(serve, server)
                    env = {"HC_TERMINAL_ID": "t1", "HC_TERMINAL_SOCKET": endpoint}
                    for kind in ["SessionStart", "SessionEnd"]:
                        event = {"session_id": "selected", "cwd": folder, "hook_event_name": kind}
                        result = subprocess.run([sys.executable, resume.__file__, agent],
                                                input=json.dumps(event), env=env, text=True,
                                                capture_output=True, timeout=3)
                        self.assertEqual((result.returncode, result.stderr), (0, ""))
                    serving.result(timeout=3)
                self.assertEqual(requests[-1]["params"]["clear_resume"], f"{agent}:selected")
                self.assertTrue(all(r["params"]["terminal"] == "t1" for r in requests))

    def test_a_stopped_core_is_not_started_by_an_exit_hook(self):
        with tempfile.TemporaryDirectory() as folder:
            missing = str(Path(folder) / "absent.sock")
            result = subprocess.run([sys.executable, resume.__file__, "claude"],
                                    input=json.dumps({"session_id": "selected", "hook_event_name": "SessionEnd"}),
                                    env={"HC_TERMINAL_ID": "t1", "HC_TERMINAL_SOCKET": missing},
                                    text=True, capture_output=True, timeout=3)
            self.assertEqual((result.returncode, result.stderr), (0, ""))
            self.assertFalse(Path(missing).exists())

    def test_recovery_uses_literal_arguments_and_returns_to_a_shell(self):
        self.recover("claude", "a' ; $(touch injected)", ["--resume", "a' ; $(touch injected)"])
        self.recover("codex", "selected", ["--no-daemon", "resume", "selected"])
        self.recover("opencode", "selected", ["--session", "selected"])

    def test_missing_opencode_session_is_not_created(self):
        self.recover("opencode", "missing", None)

    def recover(self, agent, session, expected):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            program = root / agent
            program.write_text(f"#!{sys.executable}\n" + """
import json, os, sys
with open(os.environ['LOG'], 'a') as log:
    log.write(json.dumps(sys.argv[1:]) + '\\n')
sys.exit(1 if sys.argv[1:3] == ['api', 'get'] and os.environ['MISSING'] == '1' else 0)
""")
            shell = root / "shell"
            shell.write_text(f"#!{sys.executable}\nimport os\nopen(os.environ['RETURNED'], 'w').close()\n")
            program.chmod(0o700)
            shell.chmod(0o700)
            env = dict(os.environ, PATH=f"{root}:{os.environ['PATH']}", SHELL=str(shell),
                       LOG=str(root / "calls"), RETURNED=str(root / "returned"), MISSING="1" if expected is None else "0")
            result = subprocess.run(resume.resume_argv(agent, session, []), cwd=root, env=env,
                                    capture_output=True, text=True, timeout=3)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((root / "returned").exists())
            self.assertFalse((root / "injected").exists())
            calls = [json.loads(line) for line in (root / "calls").read_text().splitlines()]
            if expected is None:
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0][:2], ["api", "get"])
            else:
                self.assertEqual(calls[-1], expected)


if __name__ == "__main__":
    unittest.main()
