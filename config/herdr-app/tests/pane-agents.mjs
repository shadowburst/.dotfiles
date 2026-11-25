// Run: node --experimental-vm-modules config/herdr-app/tests/pane-agents.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = vm.createContext({ console, Date: { now: () => clock } });
const plain = (value) => JSON.parse(JSON.stringify(value));
let all = [], ps = [], focus = null, real = {}, clock = 0, shared = {}, calls = [], started = [], failStart = false, release = null;
const herdr = new vm.SyntheticModule(["exec", "focused", "hc", "panes", "run", "setShared", "shared", "terminals"], function () {
  this.setExport("exec", async () => ({ code: 0, stdout: "", stderr: "" }));
  this.setExport("focused", () => focus && { pane: focus, shown: real[focus] ?? null });
  this.setExport("hc", async (args) => {
    started.push(plain(args));
    if (release) await release;
    if (failStart) return { code: 1, stdout: "", stderr: "no such session" };
    const address = `v${started.length}`;
    const [key, value] = args[args.indexOf("--label") + 1].split("=");
    all = [...all, { address, state: "live", parent: null, labels: { [key]: value }, program: { key: "opencode", agent: true }, status: "working" }];
    return { code: 0, stdout: JSON.stringify({ address }), stderr: "" };
  });
  this.setExport("panes", () => ps);
  this.setExport("run", (command, args) => {
    calls.push(plain({ command, ...args }));
    // As Herdr does: pane.focus puts the pane's own terminal back.
    if (command === "pane.focus") { focus = args.pane; delete real[args.pane]; }
    if (command === "terminal.show") { if (args.terminal) real[args.pane] = args.terminal; else delete real[args.pane]; }
    if (command === "terminal.kill") all = all.filter((t) => t.address !== args.terminal);
  });
  this.setExport("setShared", (key, value) => { shared[key] = value; });
  this.setExport("shared", (key) => shared[key]);
  this.setExport("terminals", () => all);
}, { context });
const data = new vm.SourceTextModule(await readFile(new URL("../mods/pane-agents/data.js", import.meta.url), "utf8"), { context });
await data.link(() => herdr);
await data.evaluate();
const { subAgents, childSessions, show, shown, tidy, restore, focus: focusPane, reconcile } = data.namespace;

const term = (address, o = {}) => ({ address, state: "live", parent: null, labels: {}, program: { key: "codex", agent: true }, status: "working", ...o });
const reset = () => {
  all = [
    term("t1", { program: { key: "opencode", agent: true }, report: { title: "Lead" } }),
    term("t2", { parent: "t1", name: "worker" }),
    term("t3", { parent: "t2", name: "nested", status: "error" }),
    term("t4", { parent: "t1", name: "shell", status: null, program: { agent: false } }),
    term("t5", { parent: "t4", name: "through-shell", status: "done" }),
    term("t6", { parent: "t1", name: "ended", state: "finished" }),
    term("t7", { parent: "t1", name: "kept" }),
    term("t8", { parent: "t7", name: "of-kept" }),
  ];
  ps = [{ pane: "p1", terminal: "t1" }, { pane: "p2", terminal: "t7" }];
  shared = { "pane-agents.children": [{ id: "ses_a", name: "child", agent: "explore", status: "blocked", terminal: "t1", dir: "/repo" }] };
  calls = []; started = []; focus = null; real = {}; clock += 10000; failStart = false; release = null;
};

// The list: helpers at any depth and OpenCode children, the most urgent first. A shell, an ended
// helper, one with a pane, and what another pane's agent started are not this pane's.
reset();
assert.deepEqual(plain(subAgents("p1")).map((k) => [k.name, k.status]), [["child", "blocked"], ["nested", "blocked"], ["worker", "working"], ["through-shell", "done"]]);
assert.deepEqual(plain(subAgents("p2")).map((k) => k.name), ["of-kept"]);
assert.deepEqual(plain(subAgents("gone")), []);

// OpenCode children: by the terminal's session record, else its title; grandchildren go to the same terminal.
const now = 10_000_000;
const ses = (id, o = {}) => ({ id, title: id, agent: "general", time: { updated: now }, location: { directory: "/repo" }, ...o });
const sessions = [ses("ses_root", { title: "Lead" }), ses("ses_kid", { parentID: "ses_root" }), ses("ses_grandkid", { parentID: "ses_kid" }),
  ses("ses_old", { parentID: "ses_root", time: { updated: 0, idle: 1 } }), ses("ses_orphan", { parentID: "ses_missing" })];
const children = (list, keep = []) => plain(childSessions(sessions, { ses_kid: {}, ses_grandkid: {} }, new Set(["ses_grandkid"]), list, keep, now)).map((c) => [c.id, c.status, c.terminal]);
const oc = (address, o) => term(address, { program: { key: "opencode" }, ...o });
assert.deepEqual(children([oc("t1", { report: { title: "Lead" } })]), [["ses_kid", "working", "t1"], ["ses_grandkid", "blocked", "t1"]]);
assert.deepEqual(children([oc("t1", { report: { title: "Lead" } }), oc("t9", { records: { ses_root: {} } })])[0][2], "t9", "A record beats an equal title");
assert.deepEqual(children([oc("v1", { report: { title: "Lead" }, labels: { "pane-agents.session": "ses_kid" } })]), [], "A viewer reports its parent's session: it owns nothing");
assert.deepEqual(children([oc("box/t1", { report: { title: "Lead" } })]), [], "The local service knows nothing of another machine's sessions");
assert.deepEqual(children([oc("t1", { report: { title: "Lead" } })], ["ses_old"]).at(-1), ["ses_old", "done", "t1"], "One that is shown stays listed");

// A helper is shown in its own terminal and never ended.
reset();
await show("p1", "t2");
assert.deepEqual([focus, real.p1], ["p1", "t2"], "A tab gives its pane the keyboard and shows its sub-agent");
calls = [];
await show("p1", "t2");
assert.deepEqual(calls, [], "The tab in view isn't a toggle");
focus = "p2";
await show("p1", "t2");
assert.deepEqual([focus, real.p1], ["p1", "t2"], "From another pane it only focuses");
focus = "p2";
focusPane("p1");
assert.deepEqual([focus, real.p1], ["p1", "t2"], "So does the rest of the header");
// Another mod's pane.focus puts the pane's own terminal back, and the tabs follow.
reconcile();
assert.deepEqual(plain(shown()), { p1: "t2" });
delete real.p1;
reconcile();
assert.deepEqual(plain(shown()), { p1: "t2" }, "Herdr gets a moment to report a view");
clock += 1000;
reconcile();
assert.deepEqual(plain(shown()), {});
await show("p1", "t2");
await show("p1", null);
assert.deepEqual(calls.at(-1), { command: "terminal.show", pane: "p1" });
assert(!started.length && !calls.some((c) => c.command === "terminal.kill"));

// A child gets a viewer in its folder, which ends when the pane goes back.
reset();
await show("p1", "ses_a");
assert.deepEqual(started[0].slice(-3), ["opencode", "--session", "ses_a"]);
assert(started[0].includes("--no-parent") && started[0].includes("/repo"));
assert.deepEqual(calls.at(-1), { command: "terminal.show", pane: "p1", terminal: "v1" });
assert(!subAgents("p1").some((k) => k.key === "v1"), "A viewer is not a sub-agent");
await show("p1", null);
assert.deepEqual(calls.at(-1), { command: "terminal.kill", terminal: "v1" });

// Back to Main while the viewer starts: it is never shown, and ends.
reset();
let go;
release = new Promise((resolve) => { go = resolve; });
const pending = show("p1", "ses_a");
tidy();
assert.deepEqual(plain(shown()), { p1: "ses_a" }, "A viewer still starting keeps its tab");
await show("p1", null);
go();
await pending;
assert(!calls.some((c) => c.command === "terminal.show" && c.terminal), "The later click wins");
assert.deepEqual(calls.at(-1), { command: "terminal.kill", terminal: "v1" });

// A viewer that can't start leaves the pane as it was.
reset();
failStart = true;
await assert.rejects(show("p1", "ses_a"), /no such session/);
assert.deepEqual(plain(shown()), {});

// A helper that ends gives the pane back; a pane that closes ends its viewer; a start restores all.
reset();
await show("p1", "t2");
all = all.filter((t) => t.address !== "t2");
tidy();
assert.deepEqual(plain(shown()), {});
assert.deepEqual(calls.at(-1), { command: "terminal.show", pane: "p1" });
reset();
await show("p1", "ses_a");
ps = [];
tidy();
assert.deepEqual(calls.at(-1), { command: "terminal.kill", terminal: "v1" });
reset();
await show("p1", "ses_a");
restore();
assert.deepEqual(calls.slice(-2), [{ command: "terminal.show", pane: "p1" }, { command: "terminal.kill", terminal: "v1" }]);
assert.deepEqual(plain(shown()), {});

console.log("pane-agents: ok");
