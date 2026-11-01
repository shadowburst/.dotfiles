// Offline checks. No real sign-ins or provider endpoints are used.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as c from "../mods/usage-bar/collect.mjs";

for (const bad of [null, "45", true, -1, NaN, Infinity]) assert.equal(c.window("Total", bad), null);
assert.deepEqual(c.parseCodex({ rate_limit: {
  primary_window: { used_percent: 0, limit_window_seconds: 18000 },
  secondary_window: { used_percent: 47, limit_window_seconds: 604800 },
} }).map(w => [w.label, w.used]), [["5h", 0], ["7d", 47]]);
assert.equal(c.parseCodex({ rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 2592000 } } })[0].label, "30d");
for (const [raw, expected] of [["1234.50", "1234.5"], ["0", "0"], [15, "15"], [100, "100"], ["1.005", "1"], ["1.015", "1.02"], ["1e-10000", "0"], ["1000000000000000000", "1000000000000000000"]]) {
  assert.equal(c.parseCodexCredits({ credits: { balance: raw } }).balance, expected);
}
for (const raw of ["secret-token", "NaN", "Infinity", "-1", true, "1e10000", "1000000000000000001", "", "0x12"]) {
  assert.equal(c.parseCodexCredits({ credits: { balance: raw } }).balance, null);
}
assert.equal(c.parseCodexCredits({}), null);
assert.equal(c.parseCodexCredits({ credits: { unlimited: true } }).unlimited, true);
assert.equal(c.parseCodexCredits({ credits: {} }).has_credits, null);
assert.equal(c.parseClaude({ five_hour: null, seven_day: { utilization: 24 } })[0].label, "7d");
assert.equal(c.parseCursor({ individualUsage: { plan: { totalPercentUsed: 73, used: 10, limit: 20 } } })[0].used, 73);
assert.equal(c.parseCursor({ individualUsage: { plan: { used: 3500, limit: 2000 } } })[0].used, 175);
for (const data of [{ isUnlimited: true }, { individualUsage: { plan: { used: 0, limit: 0 } } },
  { individualUsage: { plan: { enabled: false, totalPercentUsed: 20 } } }]) assert.deepEqual(c.parseCursor(data), []);

const folder = mkdtempSync(join(tmpdir(), "herdr-usage-"));
const env = { ...process.env };
const fetch = globalThis.fetch;
const providers = { ...c.providers };
const token = `header.${Buffer.from(JSON.stringify({ sub: "auth0|test-user", exp: Date.now() / 1000 + 3600 })).toString("base64url")}.signature`;
try {
  process.env.CODEX_HOME = join(folder, "codex");
  process.env.CLAUDE_CONFIG_DIR = join(folder, "claude");
  process.env.XDG_CONFIG_HOME = folder;
  for (const dir of ["codex", "claude", "cursor", "Cursor/User/globalStorage"]) mkdirSync(join(folder, dir), { recursive: true });
  writeFileSync(join(folder, "codex/auth.json"), JSON.stringify({ tokens: { access_token: "synthetic-secret", account_id: "test-account" } }));
  writeFileSync(join(folder, "claude/.credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "synthetic-secret", scopes: ["user:profile"], expiresAt: Date.now() + 3600000 } }));
  writeFileSync(join(folder, "cursor/auth.json"), JSON.stringify({ accessToken: token }));
  assert.equal(c.cursorToken(), `test-user%3A%3A${token}`);
  assert.equal(c.cursorCookie(`test-user%3A%3A${token}`), `test-user%3A%3A${token}`);
  for (const value of [null, "not a token", token + "\r\nInjected: header"]) assert.throws(() => c.cursorCookie(value), c.Unavailable);
  const expired = `header.${Buffer.from(JSON.stringify({ sub: "test-user", exp: 1 })).toString("base64url")}.signature`;
  assert.throws(() => c.cursorCookie(expired), error => error.code === "expired");

  // Cursor desktop fallback reads both text and binary values from a live WAL.
  rmSync(join(folder, "cursor/auth.json"));
  const dbPath = join(folder, "Cursor/User/globalStorage/state.vscdb");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE ItemTable (key TEXT, value BLOB)");
    const insert = db.prepare("INSERT INTO ItemTable VALUES (?, ?)");
    for (const value of [token, Buffer.from(token, "utf16le")]) {
      db.exec("DELETE FROM ItemTable");
      insert.run("cursorAuth/accessToken", value);
      assert.equal(c.cursorToken(), `test-user%3A%3A${token}`);
    }
  } finally { db.close(); }

  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal);
    if (url.includes("chatgpt.com")) {
      assert.equal(options.headers.Authorization, "Bearer synthetic-secret");
      assert.equal(options.headers["ChatGPT-Account-Id"], "test-account");
      return Response.json({ credits: { balance: "25", has_credits: true } });
    }
    if (url.includes("anthropic.com")) return Response.json({ five_hour: { utilization: 0 } });
    assert.equal(options.headers.Cookie, `WorkosCursorSessionToken=test-user%3A%3A${token}`);
    return Response.json({ individualUsage: { plan: { totalPercentUsed: 10 } } });
  };
  const codex = await c.collect("codex");
  assert.equal(codex.error, null);
  assert.equal(codex.credits.balance, "25");
  assert.deepEqual(codex.windows, []);
  assert.equal((await c.collect("claude")).windows[0].used, 0);
  assert.equal((await c.collect("cursor")).windows[0].used, 10);

  for (const [status, code] of [[401, "expired"], [403, "forbidden"], [429, "rate_limited"], [500, "unavailable"], [302, "unavailable"]]) {
    globalThis.fetch = async () => new Response("", { status, headers: { Location: "https://untrusted.invalid" } });
    await assert.rejects(c.request("https://test.invalid", {}), error => error.code === code);
  }
  for (const response of ["not json", "[]", "null", " ".repeat(1024 * 1024 + 1)]) {
    globalThis.fetch = async () => new Response(response);
    await assert.rejects(c.request("https://test.invalid", {}), c.Unavailable);
  }
  globalThis.fetch = async () => { throw new Error("synthetic-secret"); };
  const offline = await c.collect("codex");
  assert.equal(offline.code, "offline");
  assert.ok(!JSON.stringify(offline).includes("synthetic-secret"));
  c.providers.codex = async () => { throw new Error("Bearer synthetic-secret"); };
  assert.equal((await c.collect("codex")).code, "reader_error");
  assert.ok(!JSON.stringify(await c.collect("codex")).includes("synthetic-secret"));
  c.providers.claude = async () => { throw new c.Unavailable("No saved login", "not_signed_in", "Sign in with Claude Code"); };
  assert.equal((await c.collect("claude")).action, "Sign in with Claude Code");
  c.providers.codex = async () => ({ windows: [{ label: "5h", used: 0, reset: null }] });
  assert.equal((await c.collect("codex")).error, null);
  c.providers.codex = async () => ({ windows: [] });
  assert.equal((await c.collect("codex")).code, "no_quota");
  assert.equal((await c.collect("toString")).code, "unavailable");
  assert.equal(existsSync(join(folder, "data/usage-bar/cursor-session.json")), false);
} finally {
  globalThis.fetch = fetch;
  Object.assign(c.providers, providers);
  process.env = env;
  rmSync(folder, { recursive: true, force: true });
}
console.log("Collector checks passed (offline, synthetic credentials).");
