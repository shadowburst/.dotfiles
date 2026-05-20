import test from "node:test";
import assert from "node:assert/strict";
import {
  checkTask,
  extractFinalJsonBlock,
  firstUncheckedTask,
  isValidConventionalCommitTitle,
  parseGitStatusPorcelain,
  parseImplementationTasks,
  taskCommitTitle,
  unexpectedDirtyPaths,
  validateTaskSummary,
} from "../forge-core.mjs";

const spec = `# Example

## Requirements

Text.

## Implementation Tasks

- [x] 1. Done task.
  - Covers: Requirement: A
- [ ] 2. Next task.
  - guidance one
  - guidance two
- [ ] 3. Later task.

## Out of Scope

- Nope.
`;

test("parses top-level implementation task ledger", () => {
  const tasks = parseImplementationTasks(spec);
  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].checked, true);
  assert.equal(tasks[1].checked, false);
  assert.equal(tasks[1].number, 2);
  assert.equal(tasks[1].text, "Next task.");
  assert.match(tasks[1].guidance, /guidance one/);
});

test("selects and checks first unchecked task only", () => {
  const task = firstUncheckedTask(spec);
  assert.equal(task.number, 2);
  const updated = checkTask(spec, task.lineIndex);
  const tasks = parseImplementationTasks(updated);
  assert.equal(tasks[1].checked, true);
  assert.equal(tasks[2].checked, false);
});

test("extracts the last fenced json block", () => {
  const parsed = extractFinalJsonBlock('noise\n```json\n{"status":"stop","summary":"old"}\n```\n```json\n{"status":"done","summary":"new","changedPaths":["a"],"validation":["ok"],"commitTitle":"feat: x"}\n```');
  assert.equal(parsed.summary, "new");
});

test("validates simple done and stop summaries", () => {
  assert.equal(validateTaskSummary({ status: "stop", summary: "blocked" }).status, "stop");
  const done = validateTaskSummary({ status: "done", summary: "ok", changedPaths: ["./a.ts"], validation: ["test passed"], commitTitle: "feat: add thing" });
  assert.deepEqual(done.changedPaths, ["a.ts"]);
  assert.throws(() => validateTaskSummary({ status: "done", summary: "ok", changedPaths: ["a.ts"], validation: [], commitTitle: "feat: add thing" }), /validation/);
});

test("parses porcelain status and detects unexpected paths", () => {
  const dirty = parseGitStatusPorcelain(' M src/a.ts\n?? docs/spec.md\nR  old.ts -> new.ts\n');
  assert.deepEqual(dirty, ["src/a.ts", "docs/spec.md", "new.ts"]);
  assert.deepEqual(unexpectedDirtyPaths(dirty, ["src/a.ts", "docs/spec.md"]), ["new.ts"]);
});

test("validates and falls back conventional commit titles", () => {
  assert.equal(isValidConventionalCommitTitle("feat(pi): add forge"), true);
  assert.equal(isValidConventionalCommitTitle("add forge"), false);
  assert.equal(taskCommitTitle(4, "bad"), "feat: complete spec task 4");
});
