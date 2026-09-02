import assert from "node:assert/strict";
import test from "node:test";

import { AgentPool, transcriptForView, validateAgentRequest } from "./state.ts";

test("only approved model and effort combinations validate", () => {
  assert.deepEqual(validateAgentRequest("openai-codex/gpt-5.6-luna", "xhigh"), { ok: true });
  assert.deepEqual(validateAgentRequest("openai-codex/gpt-5.6-terra", "xhigh"), { ok: false, error: "openai-codex/gpt-5.6-terra supports low, medium, high" });
  assert.deepEqual(validateAgentRequest("openai-codex/gpt-5.6-luna", "medium", "worktree"), { ok: true });
  assert.deepEqual(validateAgentRequest("openai-codex/gpt-5.6-luna", "medium", "off"), { ok: false, error: 'isolation must be "worktree"' });
});

test("the pool starts queued work in FIFO order with at most eight running", () => {
  const pool = new AgentPool();
  const first = Array.from({ length: 9 }, (_, index) => `agent-${index + 1}`);
  assert.deepEqual(first.flatMap((id) => pool.enqueue(id)), first.slice(0, 8));
  assert.deepEqual(pool.finish("agent-3"), ["agent-9"]);
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
