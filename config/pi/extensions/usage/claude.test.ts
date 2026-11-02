import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadClaudeUsage } from "./claude.ts";
import { parseClaudeUsagePayload, selectClaudeUsageWindow } from "./state.ts";

test("parses Claude quotas and selects the five-hour limit", () => {
  const snapshot = parseClaudeUsagePayload({
    five_hour: { utilization: 20, resets_at: "2026-09-01T00:00:00Z" },
    seven_day: { utilization: 50, resets_at: "invalid" },
    seven_day_opus: { utilization: 90 },
    seven_day_sonnet: null,
  });
  assert.deepEqual(snapshot.windows, [
    { label: "General · 5 hours", usedPercent: 20, windowSeconds: 18_000, resetsAt: 1_788_220_800 },
    { label: "General · 1 week", usedPercent: 50, windowSeconds: 604_800 },
    { label: "Opus · 1 week", usedPercent: 90, windowSeconds: 604_800 },
  ]);
  for (const model of ["claude-opus-5-5", "claude-haiku-5-5", "claude-sonnet"]) {
    assert.equal(selectClaudeUsageWindow(snapshot, model), snapshot.windows[0]);
  }
  assert.deepEqual(parseClaudeUsagePayload({ five_hour: { utilization: "20" } }).windows, []);
  assert.equal(parseClaudeUsagePayload({ five_hour: { utilization: 101 } }).windows[0]?.usedPercent, 100);
  assert.throws(() => parseClaudeUsagePayload(null), /invalid usage response/);
});

test("falls back to the tightest applicable weekly limit", () => {
  const snapshot = parseClaudeUsagePayload({
    seven_day: { utilization: 50 },
    seven_day_opus: { utilization: 90 },
    seven_day_sonnet: { utilization: 70 },
  });
  assert.equal(selectClaudeUsageWindow(snapshot, "claude-opus")?.usedPercent, 90);
  assert.equal(selectClaudeUsageWindow(snapshot, "claude-sonnet")?.usedPercent, 70);
  assert.equal(selectClaudeUsageWindow(snapshot, "claude-haiku")?.usedPercent, 50);
  assert.equal(selectClaudeUsageWindow({ windows: [] }, "claude-opus"), undefined);
});

test("reads the Claude Code config override without changing credentials", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-claude-usage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = join(root, "override");
  await mkdir(config);
  const path = join(config, ".credentials.json");
  const oauth = { accessToken: "synthetic-secret", scopes: ["user:profile"], expiresAt: Date.now() + 60_000 };
  const save = () => writeFile(path, JSON.stringify({ claudeAiOauth: oauth }));
  await save();
  const env = { PI_CLAUDE_CODE_CONFIG_DIR: config, CLAUDE_CONFIG_DIR: root };
  const signal = new AbortController().signal;
  let status = 200;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/api/oauth/usage");
    assert.equal(options.headers.authorization, "Bearer synthetic-secret");
    assert.equal(options.headers["anthropic-beta"], "oauth-2025-04-20");
    assert.equal(options.redirect, "error");
    return new Response(JSON.stringify({ five_hour: { utilization: 25 } }), { status });
  });
  assert.equal((await loadClaudeUsage(env, signal)).windows[0]?.usedPercent, 25);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { claudeAiOauth: oauth });
  status = 401;
  await assert.rejects(loadClaudeUsage(env, signal), /failed \(401\)/);
  oauth.expiresAt = 1;
  await save();
  await assert.rejects(loadClaudeUsage(env, signal), /expired/);
  oauth.expiresAt = Date.now() + 60_000;
  oauth.scopes = [];
  await save();
  await assert.rejects(loadClaudeUsage(env, signal), /cannot read usage/);
  await writeFile(path, "invalid");
  await assert.rejects(loadClaudeUsage(env, signal), /Cannot read Claude Code login/);
  await writeFile(path, "{}");
  await assert.rejects(loadClaudeUsage(env, signal), /not logged in/);
});
