import assert from "node:assert/strict";
import test from "node:test";

import { parseGitCommand, usage } from "./state.ts";

test("parses guided and explicit git workflows", () => {
  assert.deepEqual(parseGitCommand(""), { type: "guided" });
  assert.deepEqual(parseGitCommand(" commit  split, include untracked "), {
    type: "explicit",
    action: "commit",
    context: "split, include untracked",
  });
  assert.deepEqual(parseGitCommand("pr draft"), {
    type: "explicit",
    action: "pr",
    context: "draft",
  });
});

test("rejects unsupported git workflows with concise usage", () => {
  assert.equal(parseGitCommand("push"), undefined);
  assert.equal(usage(), "Usage: /git [commit|pr] [additional context]");
});
