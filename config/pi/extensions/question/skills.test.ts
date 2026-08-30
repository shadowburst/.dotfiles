import assert from "node:assert/strict";
import test from "node:test";

import { createReopenSkillQueue, discoverSkillMentions, queueSkillMentions } from "./skills.ts";

test("discovers valid and unknown skill mentions without delivering them", () => {
  const details = {
    answers: [["/skill:deploy and /skill:missing"]],
  };

  assert.deepEqual(
    discoverSkillMentions(details, [{ name: "skill:deploy" }]),
    { valid: ["deploy"], unknown: ["missing"] },
  );
});

test("holds reopened skills until the agent-start delivery point", () => {
  const delivered: string[] = [];
  const queue = createReopenSkillQueue((name) => delivered.push(name));

  queue.schedule(["deploy", "review"]);
  assert.deepEqual(delivered, []);

  queue.flush();
  assert.deepEqual(delivered, ["deploy", "review"]);

  queue.flush();
  assert.deepEqual(delivered, ["deploy", "review"]);
});

test("queues unique valid skill mentions from answers and notes", () => {
  const details = {
    answers: [["before /skill:deploy and /skill:review", "after /skill:deploy"]],
    notes: [{ choice: "note /skill:review and /skill:missing" }],
  };
  const queued: string[] = [];

  const unknown = queueSkillMentions(
    details,
    [{ name: "skill:deploy" }, { name: "skill:review" }],
    (name) => queued.push(`/skill:${name}`),
  );

  assert.deepEqual(queued, ["/skill:deploy", "/skill:review"]);
  assert.deepEqual(unknown, ["missing"]);
  assert.deepEqual(details, {
    answers: [["before /skill:deploy and /skill:review", "after /skill:deploy"]],
    notes: [{ choice: "note /skill:review and /skill:missing" }],
  });
});
