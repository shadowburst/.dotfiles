import assert from "node:assert/strict";
import test from "node:test";

import {
  cycleIndex,
  formatWindowDuration,
  maskEmail,
  parseCopilotUsagePayload,
  parseUsagePayload,
  resetCountdown,
  selectCopilotUsageWindow,
  selectUsageWindow,
} from "./state.ts";

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

test("selects the tightest limit relevant to the active model", () => {
  const snapshot = parseUsagePayload({
    rate_limit: {
      primary_window: { used_percent: 42, limit_window_seconds: 18_000 },
      secondary_window: { used_percent: 70, limit_window_seconds: 604_800 },
    },
    code_review_rate_limit: { primary_window: { used_percent: 99 } },
    additional_rate_limits: [{
      limit_name: "Codex Spark",
      rate_limit: { primary_window: { used_percent: 80 } },
    }],
  });

  assert.equal(selectUsageWindow(snapshot, "gpt-5.6-luna")?.usedPercent, 70);
  assert.equal(selectUsageWindow(snapshot, "gpt-5.3-codex-spark")?.usedPercent, 80);
});

test("normalizes GitHub Copilot quota snapshots", () => {
  const snapshot = parseCopilotUsagePayload({
    copilot_plan: "individual",
    quota_reset_date_utc: "2026-09-01T00:00:00.000Z",
    quota_snapshots: {
      premium_interactions: { percent_remaining: 37.5, entitlement: 300, remaining: 112 },
      chat: { unlimited: true, percent_remaining: 0 },
      completions: { entitlement: 4_000, remaining: 3_000 },
    },
  });

  assert.deepEqual(snapshot, {
    plan: "Individual",
    windows: [
      { label: "Premium", usedPercent: 62.5, resetsAt: 1_788_220_800 },
      { label: "Chat", usedPercent: 0, resetsAt: 1_788_220_800 },
      { label: "Completions", usedPercent: 25, resetsAt: 1_788_220_800 },
    ],
  });
  assert.equal(selectCopilotUsageWindow(snapshot, "ignored")?.label, "Premium");
});

test("cycles provider tabs in either direction", () => {
  assert.equal(cycleIndex(0, 2, 1), 1);
  assert.equal(cycleIndex(1, 2, 1), 0);
  assert.equal(cycleIndex(0, 2, -1), 1);
});

test("formats reset countdowns without seconds", () => {
  const window = { label: "General", usedPercent: 0, resetsAt: 100_000 };
  assert.equal(resetCountdown(window, 90_000), "2h 46m");
  assert.equal(resetCountdown(window, 90_000, true), "2h");
  assert.equal(resetCountdown({ label: "General", usedPercent: 0 }), "—");
});
