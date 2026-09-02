import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  AgentPool,
  cleanupWorktree,
  createWorktree,
  latestAssistantResponse,
  transcriptForView,
  truncateResponse,
  validateAgentRequest,
} from "./state.ts";

const exec = promisify(execFile);

test("only approved model and effort combinations validate", () => {
  assert.deepEqual(validateAgentRequest("openai-codex/gpt-5.6-luna", "xhigh"), { ok: true });
  assert.deepEqual(validateAgentRequest("openai-codex/gpt-5.6-terra", "xhigh"), { ok: false, error: "openai-codex/gpt-5.6-terra supports low, medium, high" });
  assert.deepEqual(validateAgentRequest("openai-codex/gpt-5.6-luna", "medium", "worktree"), { ok: true });
  assert.deepEqual(validateAgentRequest("openai-codex/gpt-5.6-luna", "medium", "off"), { ok: false, error: 'isolation must be "worktree"' });
});

test("the pool starts queued work in FIFO order with at most eight running", () => {
  const pool = new AgentPool();
  const first = Array.from({ length: 10 }, (_, index) => `agent-${index + 1}`);
  assert.deepEqual(first.flatMap((id) => pool.enqueue(id)), first.slice(0, 8));
  assert.deepEqual(pool.cancel("agent-9"), []);
  assert.deepEqual(pool.finish("agent-3"), ["agent-10"]);
});

test("the original prompt is first and transcript hides tools and thinking", () => {
  assert.deepEqual(
    transcriptForView("Original prompt", [
      { role: "assistant", text: "Answer", thinking: "hidden" },
      { role: "tool", text: "hidden" },
      { role: "user", text: "Steer this" },
    ]),
    [
      { role: "user", text: "Original prompt" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "Steer this" },
    ],
  );
});

test("response extraction stays inside the current run and reports provider failure", () => {
  const messages = [
    { role: "assistant", content: [{ type: "text", text: "old answer" }], stopReason: "stop" },
    { role: "user", content: [{ type: "text", text: "resume" }] },
    { role: "assistant", content: [], stopReason: "error", errorMessage: "quota exhausted" },
  ];
  assert.deepEqual(latestAssistantResponse(messages, 1), { text: "", error: "quota exhausted" });
});

test("tool responses obey byte and line limits with an explicit notice", () => {
  const output = truncateResponse("line\n".repeat(3_000), 1_024, 100);
  assert.match(output, /^line\n/);
  assert.match(output, /\[Output truncated:/);
  assert.ok(Buffer.byteLength(output) <= 1_024);
  assert.ok(output.split("\n").length <= 100);
});

test("worktree cleanup commits edits, preserves a unique branch, and removes the copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "subagents-test-"));
  const pi = {
    async exec(command: string, args: string[], options: { cwd: string; timeout: number }) {
      try {
        const result = await exec(command, args, { cwd: options.cwd, timeout: options.timeout });
        return { stdout: result.stdout, stderr: result.stderr, code: 0, killed: false };
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
        return { stdout: failure.stdout ?? "", stderr: failure.stderr ?? "", code: failure.code ?? 1, killed: failure.killed ?? false };
      }
    },
  };

  try {
    await exec("git", ["init", "-q"], { cwd: root });
    await exec("git", ["config", "user.name", "Subagent test"], { cwd: root });
    await exec("git", ["config", "user.email", "subagent@example.invalid"], { cwd: root });
    await writeFile(join(root, "file.txt"), "base\n");
    await exec("git", ["add", "file.txt"], { cwd: root });
    await exec("git", ["commit", "-qm", "base"], { cwd: root });

    const first = await createWorktree(pi, root, "same-id");
    assert.ok(first);
    await writeFile(join(first.path, "file.txt"), "first\n");
    const firstResult = await cleanupWorktree(pi, root, first, "first edit");
    assert.equal(firstResult.branch, "pi-agent-same-id");

    const second = await createWorktree(pi, root, "same-id", firstResult.branch);
    assert.ok(second);
    assert.equal(await readFile(join(second.path, "file.txt"), "utf8"), "first\n");
    await writeFile(join(second.path, "file.txt"), "second\n");
    const secondResult = await cleanupWorktree(pi, root, second, "second edit");
    assert.match(secondResult.branch ?? "", /^pi-agent-same-id-/);
    await assert.rejects(readFile(second.path));

    const third = await createWorktree(pi, root, "failed-cleanup");
    assert.ok(third);
    await writeFile(join(third.path, "file.txt"), "preserved\n");
    const failingPi = {
      ...pi,
      exec: (command: string, args: string[], options: { cwd: string; timeout: number }) =>
        args[0] === "branch"
          ? Promise.resolve({ stdout: "", stderr: "branch failed", code: 1, killed: false })
          : pi.exec(command, args, options),
    };
    const failedResult = await cleanupWorktree(failingPi, root, third, "failed edit");
    assert.equal(failedResult.path, third.path);
    assert.match(failedResult.error ?? "", /branch failed/);
    assert.equal(await readFile(join(third.path, "file.txt"), "utf8"), "preserved\n");
    await exec("git", ["worktree", "remove", "--force", third.path], { cwd: root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
