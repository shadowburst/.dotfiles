import assert from "node:assert/strict";
import test from "node:test";

import { formatWindowDuration, maskEmail, parseUsagePayload } from "./state.ts";

test("normalizes every Codex limit and meaningful metadata", () => {
  const snapshot = parseUsagePayload({
    email: "person@example.com",
    plan_type: "pro_lite",
    rate_limit: {
      primary_window: { used_percent: 42, limit_window_seconds: 18_000, reset_at: 1_700_000_000 },
      secondary_window: { used_percent: 101, limit_window_seconds: 604_800, reset_at: 1_700_100_000 },
    },
    code_review_rate_limit: {
      rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 86_400 } },
    },
    additional_rate_limits: [{
      limit_name: "Codex Spark",
      rate_limit: { primary_window: { used_percent: 7, limit_window_seconds: 604_800 } },
    }],
    credits: { has_credits: true, balance: "9.99" },
  });

  assert.deepEqual(snapshot, {
    email: "person@example.com",
    plan: "Pro Lite",
    credits: "9.99",
    windows: [
      { label: "General · 5 hours", usedPercent: 42, windowSeconds: 18_000, resetsAt: 1_700_000_000 },
      { label: "General · 1 week", usedPercent: 100, windowSeconds: 604_800, resetsAt: 1_700_100_000 },
      { label: "Code review · 1 day", usedPercent: 12, windowSeconds: 86_400 },
      { label: "Codex Spark · 1 week", usedPercent: 7, windowSeconds: 604_800 },
    ],
  });
  assert.equal(formatWindowDuration(300), "5 minutes");
  assert.equal(maskEmail("person@example.com"), "p•••@example.com");
  assert.equal(parseUsagePayload({ credits: { has_credits: false, balance: "0" } }).credits, undefined);
});
