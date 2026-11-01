import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../mods/auto-tabs/names.js", import.meta.url), "utf8")
  .replace(/^import .* from "herdr";\s*/m, "")
  .replace("export function syncNames", "function syncNames");

function setup(tabs, panes, saved = {}) {
  const calls = [];
  const state = new Map([["tab-titles.set", saved]]);
  const context = vm.createContext({
    spaces: () => [{ tabs }], panes: () => panes,
    shared: key => state.get(key), setShared: (key, value) => state.set(key, value),
    run: (command, args) => {
      assert.equal(command, "tab.rename");
      calls.push(args);
      Object.assign(tabs.find(tab => tab.id === args.id), { name: args.name, named: true });
    },
  });
  vm.runInContext(source, context);
  return { sync: () => context.syncNames(), calls, state };
}

for (const [app, initial, title, expected] of [
  ["claude-code", "Claude Code", "✳ Fix tests", "Fix tests"],
  ["codex", "Codex", "Fix tests", "Fix tests"],
  ["pi", "Pi", "Restore and Update OpenCode", "Restore and Update OpenCode"],
  ["opencode", "OpenCode", "OC | Rename Codex and OpenCode tabs", "Rename Codex and OpenCode tabs"],
]) {
  // Program detection must also work before an agent sends a status report.
  for (const reported of [true, false]) {
    const tab = { id: "tab", name: initial, named: true };
    const pane = { terminal: "t1", tab: "tab", app: reported ? app : null,
      program: { key: app === "claude-code" ? "claude" : app }, title };
    const test = setup([tab], [pane]);
    test.sync();
    assert.equal(tab.name, expected, `${app}: session title`);
    test.sync();
    assert.equal(test.calls.length, 1, "unchanged titles must not cause more renames");
    pane.title = "Next task";
    test.sync();
    assert.equal(tab.name, "Next task", "owned names must follow title changes");
    tab.name = "My manual name";
    test.sync();
    assert.equal(tab.name, "My manual name", "manual names must be kept");
  }
}

for (const app of ["claude-code", "codex", "pi", "opencode"]) {
  const tab = { id: "tab", name: "Terminal", named: false };
  const shell = { terminal: "t1", tab: "tab", program: { shell: true }, cwd: "/home/user/repo" };
  const agent = { terminal: "t2", tab: "tab", app, title: "Agent task" };
  const test = setup([tab], [{ tab: "tab", terminal: null }, shell, agent]);
  test.sync();
  assert.equal(tab.name, "Agent task", `${app}: prefer the agent over the shell`);
}

for (const title of [undefined, "", "   ", "OC | "]) {
  const tab = { id: "tab", name: "OpenCode", named: true };
  const test = setup([tab], [{ terminal: "t1", tab: "tab", app: "opencode", title }]);
  test.sync();
  assert.equal(test.calls.length, 0, "empty titles must not rename tabs");
}

const tabs = [
  { id: "shell", name: "Terminal", named: false },
  { id: "program", name: "Terminal", named: false },
  { id: "manual", name: "Keep me", named: true },
];
const test = setup(tabs, [
  { terminal: "t1", tab: "shell", cwd: "/home/user/repo", program: { shell: true } },
  { terminal: "t2", tab: "program", program: { name: "Neovim" } },
  { terminal: "t3", tab: "manual", app: "pi", title: "Agent task" },
], { closed: "Old task" });
test.sync();
assert.deepEqual(tabs.map(tab => tab.name), ["repo", "Neovim", "Keep me"]);
assert.equal("closed" in test.state.get("tab-titles.set"), false, "remove closed tab records");
console.log("Auto-tab titles, pane selection, manual names, and cleanup passed.");
