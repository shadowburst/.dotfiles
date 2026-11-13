import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("selection, fork and home use one ordered capture path", async () => {
  const writes = [];
  const effects = [];
  const context = vm.createContext({
    process: { env: { HC_TERMINAL_ID: "t1", HC_TERMINAL_SOCKET: "/core" }, argv: ["opencode"], cwd: () => "/project" },
    console,
  });
  const child = new vm.SyntheticModule(["execFile"], function () {
    this.setExport("execFile", (_cmd, args, _options, callback) => ({
      stdin: { on() {}, end(value) { writes.push([args, JSON.parse(value)]); callback(null, "", ""); } },
    }));
  }, { context });
  const solid = new vm.SyntheticModule(["createEffect"], function () {
    this.setExport("createEffect", (effect) => { effects.push(effect); effect(); });
  }, { context });
  const mod = new vm.SourceTextModule(await readFile(new URL("./tui.js", import.meta.url), "utf8"), { context });
  await mod.link((specifier) => specifier === "solid-js" ? solid : child);
  await mod.evaluate();
  let route = { type: "session", sessionID: "original" };
  let removed = false;
  const cleanup = mod.namespace.default.setup({ ui: {
    router: { current: () => route },
    slot: ({ render }) => { render(); return () => { removed = true; }; },
  } });
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  await flush();
  route = { type: "session", sessionID: "fork" };
  effects[0]();
  await flush();
  route = { type: "home" };
  effects[0]();
  await flush();
  route = { type: "session", sessionID: "active" };
  effects[0]();
  await cleanup();
  assert.deepEqual(JSON.parse(JSON.stringify(writes.map(([, event]) => [event.session_id, event.hook_event_name]))), [
    ["original", "SessionStart"], ["fork", "SessionStart"], ["fork", "SessionEnd"],
    ["active", "SessionStart"], ["active", "SessionEnd"],
  ]);
  assert(writes.every(([, event]) => event.cwd === "/project"));
  assert(removed);
});
