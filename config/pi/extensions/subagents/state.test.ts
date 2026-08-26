import assert from "node:assert/strict";
import test from "node:test";

import {
  addChild,
  addCompletionBatchChild,
  closeChild,
  createCompletionBatchState,
  createSchedulerState,
  failChild,
  hasPendingCompletionBatch,
  isSubagentWaitCommand,
  MAX_RETAINED,
  normalizeTitle,
  resolveSpawnDefaults,
  retryChild,
  settleChild,
  settleCompletionBatchChild,
  submitToChild,
  type SchedulerState,
} from "./state.ts";

const spec = (task: string) => ({ title: `Title ${task}`, task, model: "provider/model", thinking: "high" });

function add(state: SchedulerState, task: string) {
  return addChild(state, spec(task));
}

test("a completion batch wakes only after its final child settles", () => {
  let state = createCompletionBatchState();
  state = addCompletionBatchChild(state, 1, "A1");
  state = addCompletionBatchChild(state, 1, "A2");
  assert.equal(hasPendingCompletionBatch(state), true);

  const first = settleCompletionBatchChild(state, "A1");
  assert.deepEqual({ tracked: first.tracked, complete: first.complete }, { tracked: true, complete: false });
  const last = settleCompletionBatchChild(first.state, "A2");
  assert.deepEqual({ tracked: last.tracked, complete: last.complete }, { tracked: true, complete: true });
  assert.equal(hasPendingCompletionBatch(last.state), false);
});

test("separate completion batches settle independently", () => {
  let state = createCompletionBatchState();
  state = addCompletionBatchChild(state, 1, "A1");
  state = addCompletionBatchChild(state, 2, "A2");
  const result = settleCompletionBatchChild(state, "A1");
  assert.equal(result.complete, true);
  assert.equal(hasPendingCompletionBatch(result.state), true);
});

test("detects shell sleeps without blocking commands that only mention sleep", () => {
  assert.equal(isSubagentWaitCommand("sleep 10"), true);
  assert.equal(isSubagentWaitCommand("while kill -0 123; do sleep 1; done"), true);
  assert.equal(isSubagentWaitCommand("echo ready && sleep 2"), true);
  assert.equal(isSubagentWaitCommand("rg sleep config"), false);
  assert.equal(isSubagentWaitCommand("npm test -- sleep"), false);
});

test("resolves model-specific spawn defaults and explicit effort overrides", () => {
  assert.deepEqual(resolveSpawnDefaults(undefined, undefined), { model: "Luna", thinking: "max" });
  assert.deepEqual(resolveSpawnDefaults("Sol", undefined), { model: "Sol", thinking: "high" });
  assert.deepEqual(resolveSpawnDefaults("Sol", "minimal"), { model: "Sol", thinking: "minimal" });
  assert.deepEqual(resolveSpawnDefaults("Luna", "off"), { model: "Luna", thinking: "off" });
});

test("trims titles and rejects blank or oversized ones", () => {
  assert.equal(normalizeTitle("  Fix flaky tests  "), "Fix flaky tests");
  assert.throws(() => normalizeTitle("   "), /1–40 characters/);
  assert.throws(() => normalizeTitle("x".repeat(41)), /1–40 characters/);
});

test("runs four children and queues the fifth", () => {
  let state = createSchedulerState();
  for (let index = 1; index <= 5; index++) state = add(state, `task ${index}`).state;
  assert.deepEqual(state.children.map((child) => child.status), ["running", "running", "running", "running", "queued"]);
  assert.deepEqual(state.queue, [{ childId: "A5", prompt: "task 5" }]);
});

test("releases queued work in global FIFO order", () => {
  let state = createSchedulerState();
  for (let index = 1; index <= 6; index++) state = add(state, `task ${index}`).state;

  const first = settleChild(state, "A2");
  assert.deepEqual(first.started, [{ childId: "A5", prompt: "task 5", run: 1 }]);
  const second = settleChild(first.state, "A1");
  assert.deepEqual(second.started, [{ childId: "A6", prompt: "task 6", run: 1 }]);
});

test("queues a new idle prompt behind existing FIFO work when all slots are occupied", () => {
  let state = createSchedulerState();
  state = add(state, "idle again").state;
  state = settleChild(state, "A1").state;
  for (let index = 2; index <= 6; index++) state = add(state, `task ${index}`).state;

  const result = submitToChild(state, "A1", "second run");
  assert.equal(result.action, "queued");
  assert.deepEqual(result.state.queue.map((work) => work.childId), ["A6", "A1"]);
});

test("merges extra text into one queued child work item", () => {
  let state = createSchedulerState();
  for (let index = 1; index <= 5; index++) state = add(state, `task ${index}`).state;
  const result = submitToChild(state, "A5", "extra direction");
  assert.equal(result.action, "queued");
  assert.equal(result.state.children[4]!.pendingPrompt, "task 5\n\nextra direction");
  assert.deepEqual(result.state.queue, [{ childId: "A5", prompt: "task 5\n\nextra direction" }]);
});

test("closing queued work removes it and closing running work releases the next item", () => {
  let state = createSchedulerState();
  for (let index = 1; index <= 6; index++) state = add(state, `task ${index}`).state;
  state = closeChild(state, "A5").state;
  assert.equal(state.children.some((child) => child.id === "A5"), false);
  assert.deepEqual(state.queue.map((work) => work.childId), ["A6"]);

  const closed = closeChild(state, "A1");
  assert.deepEqual(closed.started, [{ childId: "A6", prompt: "task 6", run: 1 }]);
});

test("failure remains retained and releases a running slot", () => {
  let state = createSchedulerState();
  for (let index = 1; index <= 5; index++) state = add(state, `task ${index}`).state;
  const result = failChild(state, "A1", "process died");
  assert.equal(result.state.children.find((child) => child.id === "A1")?.status, "failed");
  assert.equal(result.state.children.find((child) => child.id === "A1")?.error, "process died");
  assert.deepEqual(result.started, [{ childId: "A5", prompt: "task 5", run: 1 }]);
});

test("retry creates a new identity with the failed child's original runtime", () => {
  let state = add(createSchedulerState(), "original").state;
  state = failChild(state, "A1", "dead").state;
  const retried = retryChild(state, "A1");
  assert.equal(retried.child.id, "A2");
  assert.equal(retried.child.title, "Title original");
  assert.equal(retried.child.task, "original");
  assert.equal(retried.child.model, "provider/model");
  assert.equal(retried.child.thinking, "high");
  assert.equal(retried.state.children.find((child) => child.id === "A1")?.status, "failed");
});

test("refuses a thirteenth retained child without eviction", () => {
  let state = createSchedulerState();
  for (let index = 0; index < MAX_RETAINED; index++) state = add(state, `task ${index}`).state;
  assert.throws(() => add(state, "overflow"), /Retained subagent limit reached/);
  assert.equal(state.children.length, MAX_RETAINED);
});
