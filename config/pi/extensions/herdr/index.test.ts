import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const indexUrl = new URL("./index.ts", import.meta.url).href;
const packages = {
  "@earendil-works/pi-coding-agent": "",
  typebox: `
    const s = (kind, value, options) => ({ kind, value, options });
    export const Type = {
      Optional: value => s("optional", value), String: options => s("string", null, options),
      Integer: options => s("integer", null, options), Number: options => s("number", null, options),
      Boolean: options => s("boolean", null, options), Unknown: () => s("unknown"),
      Literal: value => s("literal", value), Union: value => s("union", value),
      Array: (value, options) => s("array", value, options), Object: (value, options) => s("object", value, options),
    };
  `,
};
register(`data:text/javascript,${encodeURIComponent(`
  const packages = ${JSON.stringify(packages)}, indexUrl = ${JSON.stringify(indexUrl)};
  export function resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(packages, specifier)) return { url: "data:text/javascript," + encodeURIComponent(packages[specifier]), shortCircuit: true };
    return nextResolve(specifier, context);
  }
  export async function load(url, context, nextLoad) {
    if (url === indexUrl) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const { stripTypeScriptTypes } = await import("node:module");
      return { format: "module", shortCircuit: true, source: stripTypeScriptTypes(await readFile(fileURLToPath(url), "utf8"), { mode: "transform" }) };
    }
    return nextLoad(url, context);
  }
`)}`, import.meta.url);

const envKeys = ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_PANE_ID", "HERDR_BIN_PATH"] as const;
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
function setInside(inside = true) {
  if (inside) Object.assign(process.env, { HERDR_ENV: "1", HERDR_SOCKET_PATH: "/tmp/herdr.sock", HERDR_PANE_ID: "w1:p2" });
  else for (const key of envKeys.slice(0, 3)) delete process.env[key];
}
test.after(() => { for (const key of envKeys) originalEnv[key] === undefined ? delete process.env[key] : process.env[key] = originalEnv[key]!; });
const { default: herdr } = await import("./index.ts");
function setup(exec: (...args: any[]) => any, options: { confirm?: boolean | ((...args: any[]) => any); hasUI?: boolean } = {}) {
  const tools = new Map<string, any>(), calls: any[][] = [];
  const pi = { exec: async (...args: any[]) => { calls.push(args); return exec(...args); }, registerTool: (tool: any) => tools.set(tool.name, tool) };
  herdr(pi as any);
  const ctx = { cwd: "/home/user/project", hasUI: options.hasUI ?? true, ui: { confirm: async (...args: any[]) => typeof options.confirm === "function" ? options.confirm(...args) : options.confirm ?? true } };
  return { tools, calls, ctx };
}
const ok = (stdout = "{}") => ({ code: 0, stdout, stderr: "" });
const invoke = (s: ReturnType<typeof setup>, tool: string, params: any, signal?: AbortSignal) => s.tools.get(tool).execute("id", params, signal, undefined, s.ctx);

test("does not register outside Herdr; tools use codemode namespace and output schema", () => {
  setInside(false);
  const s = setup(() => ok());
  assert.equal(s.tools.size, 0);
  setInside();
  const inside = setup(() => ok());
  const tool = inside.tools.get("herdr_pane");
  assert.equal(tool.namespace.name, "herdr");
  assert.equal(tool.exposure, "codemode");
  assert.equal(tool.outputSchema.kind, "object");
});

test("builds local and remote targets explicitly and rejects unsafe remote defaults", async () => {
  setInside(); const s = setup(() => ok());
  await invoke(s, "herdr_workspace", { action: "create" });
  assert.deepEqual(s.calls[0][1], ["workspace", "create", "--cwd", s.ctx.cwd, "--no-focus"]);
  await invoke(s, "herdr_pane", { action: "split", direction: "right" });
  assert.deepEqual(s.calls[1][1], ["pane", "split", "--current", "--direction", "right", "--cwd", s.ctx.cwd, "--no-focus"]);
  await invoke(s, "herdr_pane", { action: "wait-output", pane_id: "w2:p3", match: "done", timeout_ms: 321 });
  assert.deepEqual(s.calls[2][1], ["pane", "wait-output", "w2:p3", "--match", "done", "--source", "recent-unwrapped", "--lines", "80", "--timeout", "321"]);
  assert.equal(s.calls[2][2].timeout, undefined);
  await invoke(s, "herdr_pane", { action: "split", machine: "remote", pane_id: "w9:p4", direction: "down", cwd: "~/work" });
  assert.deepEqual(s.calls[3][1], ["--machine", "remote", "pane", "split", "--pane", "w9:p4", "--direction", "down", "--cwd", "~/work", "--no-focus"]);
  await assert.rejects(invoke(s, "herdr_workspace", { action: "create", machine: "remote" }), /explicit cwd/);
  assert.equal(s.calls.length, 4);
});

test("preserves raw terminal text and reports killed mutations as uncertain", async () => {
  setInside(); const controller = new AbortController();
  const s = setup((_bin, args) => {
    if (args[0] === "pane" && args[1] === "read") return ok('{"error":{"code":"looks-like-error"}}');
    if (args[0] === "agent") return { code: 1, stdout: "partial", stderr: "", killed: true };
    return { code: 1, stdout: "", stderr: '{"error":{"code":"timeout"}}' };
  });
  const raw = await invoke(s, "herdr_pane", { action: "read", pane_id: "w1:p2" }, controller.signal);
  assert.deepEqual(raw.details.data, { text: '{"error":{"code":"looks-like-error"}}' });
  assert.equal(raw.details.ok, true);
  const failed = await invoke(s, "herdr_agent", { action: "prompt", target: "agent1", text: "hello" });
  assert.equal(failed.details.error.code, "cancelled");
  assert.equal(failed.details.execution_uncertain, true);
  const help = await invoke(s, "herdr_help", { group: "pane" }, controller.signal);
  assert.equal(s.calls.at(-1)[2].signal, controller.signal);
  assert.equal(help.details.ok, false);
});

test("direct responses retain full structure and truncate only displayed content", async () => {
  setInside(); let count = 0;
  const s = setup(() => ok(count++ === 0 ? '{"value":1}' : JSON.stringify({ value: "x".repeat(13000) })));
  const small = await invoke(s, "herdr_pane", { action: "list" });
  assert.equal(small.structuredContent.data.value, 1);
  const large = await invoke(s, "herdr_pane", { action: "list" });
  assert.ok(large.structuredContent.data.value.length > 12000);
  assert.equal(JSON.parse(large.content[0].text).truncated, true);
});

test("destructive actions need UI confirmation; denial and no UI never execute", async () => {
  setInside();
  for (const options of [{ confirm: false }, { hasUI: false }]) {
    const s = setup(() => ok(), options);
    const result = await invoke(s, "herdr_pane", { action: "close", pane_id: "w1:p2" });
    assert.equal(result.details.error.code, "confirmation_required");
    assert.equal(s.calls.length, 0);
  }
});

test("checks blocked agent input in UI, but denies headless without reading", async () => {
  setInside(); let prompt = "";
  const blocked = setup((_bin, args) => args.includes("get") ? ok(JSON.stringify({ result: { agent: { agent_status: "blocked" } } })) : ok("Current screen"), { confirm: (_title, message) => { prompt = message; return false; } });
  const result = await invoke(blocked, "herdr_agent", { action: "send-keys", target: "builder", keys: ["y"] });
  assert.equal(result.details.error.code, "agent_blocked");
  assert.deepEqual(blocked.calls.map(call => call[1][1]), ["get", "read"]);
  assert.deepEqual(blocked.calls[1][1].slice(2), ["builder", "--source", "visible", "--lines", "80"]);
  assert.match(prompt, /Current screen/);
  assert.match(prompt, /Requested input:.*builder.*y/);
  const headless = setup((_bin, args) => ok(JSON.stringify({ result: { agent: { agent_status: "blocked" } } })), { hasUI: false });
  assert.equal((await invoke(headless, "herdr_agent", { action: "send-keys", target: "builder", keys: ["y"] })).details.error.code, "agent_blocked");
  assert.equal(headless.calls.length, 1);
});

test("forwards worktree guards and keeps option-looking prompt text as one argument", async () => {
  setInside(); const s = setup(() => ok());
  await assert.rejects(invoke(s, "herdr_worktree", { action: "create", cwd: "/repo", workspace_id: "w1" }), /workspace_id or cwd/);
  await assert.rejects(invoke(s, "herdr_worktree", { action: "open", cwd: "/repo" }), /exactly one/);
  await invoke(s, "herdr_worktree", { action: "open", cwd: "/repo", branch: "topic", trust_repository: true });
  assert.deepEqual(s.calls[0][1], ["worktree", "open", "--cwd", "/repo", "--branch", "topic", "--no-focus", "--trust-repository"]);
  await invoke(s, "herdr_agent", { action: "prompt", target: "builder", text: "--wait", wait: true });
  assert.deepEqual(s.calls[1][1], ["agent", "prompt", "builder", "--wait", "--wait"]);
  assert.equal(s.calls[1][1][3], "--wait", "prompt text remains one argv even when it resembles an option");
});

test("confirmation denial skips trusted worktree; cancellation during confirmation prevents execution", async () => {
  setInside();
  const denied = setup(() => ok(), { confirm: false });
  assert.equal((await invoke(denied, "herdr_worktree", { action: "create", cwd: "/repo", trust_repository: true })).details.error.code, "confirmation_required");
  assert.equal(denied.calls.length, 0);

  const controller = new AbortController();
  const cancelled = setup(() => ok(), { confirm: () => { controller.abort(); return true; } });
  const result = await invoke(cancelled, "herdr_pane", { action: "close", pane_id: "w1:p2" }, controller.signal);
  assert.equal(result.details.error.code, "cancelled");
  assert.equal(cancelled.calls.length, 0);
});

test("loaded tools execute without rechecking the Herdr environment", async () => {
  setInside(); const s = setup(() => ok());
  setInside(false);
  assert.equal((await invoke(s, "herdr_help", {})).details.ok, true);
  assert.equal((await invoke(s, "herdr_help", { group: "worktree" })).details.ok, true);
  assert.equal((await invoke(s, "herdr_pane", { action: "list" })).details.ok, true);
  assert.equal(s.calls.length, 2);
});

test("schemas accept discovered opaque IDs across every operation", async () => {
  const { groups } = await import("./index.ts");
  const ids = { workspace_id: "wG", pane_id: "wG:pA", target_pane_id: "wG:pB", tab_id: "wG:tC", target: "wG:pA" };
  for (const [group, definition] of Object.entries(groups)) {
    for (const [action, operation] of Object.entries(definition.operations)) {
      for (const [field, id] of Object.entries(ids)) {
        const schema = operation.fields[field] as any;
        if (!schema) continue;
        const options = (schema.kind === "optional" ? schema.value : schema).options;
        assert.ok(!options?.pattern || new RegExp(options.pattern).test(id), `${group}.${action}.${field} must accept ${id}`);
        assert.ok(id.length >= (options?.minLength ?? 0));
      }
    }
  }
  setInside(); const s = setup(() => ok());
  await invoke(s, "herdr_worktree", { action: "remove", workspace_id: ids.workspace_id });
  assert.deepEqual(s.calls[0][1], ["worktree", "remove", "--workspace", "wG"]);
});

test("tab creation resolves the live caller workspace rather than inherited stale IDs", async () => {
  setInside();
  const s = setup((_bin, args) => args[0] === "pane"
    ? ok(JSON.stringify({ result: { pane: { workspace_id: "w7" } } })) : ok());
  await invoke(s, "herdr_tab", { action: "create" });
  assert.deepEqual(s.calls.map(call => call[1]), [
    ["pane", "current", "--current"],
    ["tab", "create", "--workspace", "w7", "--cwd", s.ctx.cwd, "--no-focus"],
  ]);
});

test("propagates pre-cancellation and leaves native waits untimed", async () => {
  setInside(); const controller = new AbortController(); controller.abort();
  const cancelled = setup(() => ok());
  assert.equal((await invoke(cancelled, "herdr_pane", { action: "close", pane_id: "w1:p2" }, controller.signal)).details.error.code, "cancelled");
  assert.equal(cancelled.calls.length, 0);
  const wait = setup(() => ok());
  await invoke(wait, "herdr_agent", { action: "wait", target: "builder" });
  assert.deepEqual(wait.calls[0][1], ["agent", "wait", "builder"]);
  assert.equal(wait.calls[0][2].timeout, undefined);
});
