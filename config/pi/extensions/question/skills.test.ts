import assert from "node:assert/strict";
import test from "node:test";

import { queueSkillMentions } from "./skills.ts";

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
