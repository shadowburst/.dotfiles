// Run: node --experimental-vm-modules config/herdr-app/tests/automations.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

process.env.TZ = "Europe/Paris";
const source = (name) => readFile(new URL(`../mods/automations/${name}`, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
let clock = new Date(2026, 10, 25, 8, 59, 30).getTime();
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const context = vm.createContext({ console: { log() {} }, Date: Clock, localStorage: { getItem: () => null, setItem() {} } });
const module = (values) => new vm.SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value);
}, { context });

// ---- cron ----
const cron = new vm.SourceTextModule(await source("cron.js"), { context });
await cron.link(() => {});
await cron.evaluate();
const { parse, matches, upcoming, toForm, fromForm, describe, when } = cron.namespace;
const local = (...a) => new Clock(...a);
const text = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
const nexts = (expression, from, n = 1) => Array.from(upcoming(parse(expression), from, n), text);
const noon = local(2026, 10, 25, 12, 0); // a Wednesday
assert.deepEqual(nexts("*/15 * * * *", noon, 3), ["2026-11-25 12:15", "2026-11-25 12:30", "2026-11-25 12:45"]);
assert.equal(nexts("0 12 * * *", noon)[0], "2026-11-26 12:00", "The current minute is not a next run");
assert.equal(nexts("30 9 * * 1-5", local(2026, 10, 27, 10, 0))[0], "2026-11-30 9:30");
assert.equal(nexts("0 8 * * 7", noon)[0], "2026-11-29 8:00", "7 is Sunday");
assert.equal(nexts("0 8 * jan mon", noon)[0], "2027-1-4 8:00", "Names");
assert.equal(nexts("0 0 29 2 *", noon)[0], "2028-2-29 0:00");
assert.equal(nexts("0 0 29 2 *", local(2096, 2, 1))[0], "2104-2-29 0:00", "2100 has no 29 February");
assert.deepEqual(nexts("0 0 30 2 *", noon), []);
assert.deepEqual(nexts("0 0 1 * 5", noon, 2), ["2026-11-27 0:00", "2026-12-1 0:00"], "Two restricted day fields: one match is sufficient");
assert.deepEqual(nexts("5-10/5,50 6 * * *", noon, 3), ["2026-11-26 6:05", "2026-11-26 6:10", "2026-11-26 6:50"]);
assert.equal(nexts("30 2 * * *", local(2027, 2, 27, 12, 0))[0], "2027-3-29 2:30", "A time removed by the clock change does not exist");
assert(matches(parse("0 9 * * 3"), local(2026, 10, 25, 9, 0)) && !matches(parse("0 9 * * 4"), local(2026, 10, 25, 9, 0)));
for (const bad of ["", "* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "*/0 * * * *", "5-1 * * * *", "*-5 * * * *", "a * * * *", "1,,2 * * * *"]) {
  assert.throws(() => parse(bad), undefined, `Reject ${JSON.stringify(bad)}`);
}
for (const expression of ["", "*/15 * * * *", "7 * * * *", "30 9 * * *", "0 18 * * 1-5", "5 8 * * 0", "0 9 1 * *", "*/7 * * * *"]) {
  assert.equal(fromForm(toForm(expression)), expression, "The form keeps each schedule as it is");
}
assert.equal(toForm("*/7 * * * *").preset, "custom");
assert.equal(describe("0 18 * * 1-5"), "Monday to Friday at 18:00");
assert.equal(describe("5 8 * * 0"), "Every Sunday at 08:05");
const form = { ...toForm("0 9 * * *") };
assert.throws(() => fromForm({ ...form, time: "25:00" }), /HH:MM/);
assert.throws(() => fromForm({ ...form, preset: "hourly", minute: "60" }), /0 to 59/);
assert.throws(() => fromForm({ ...form, preset: "custom", cron: "0 0 30 2 *" }), /never/);
assert.equal(when(local(2026, 10, 25, 9, 0), noon), "Today 09:00");
assert.equal(when(local(2026, 10, 24, 9, 0), noon), "Yesterday 09:00");
assert.equal(when(local(2026, 11, 25, 9, 0), noon), "25 Dec 09:00");

// ---- the mod, with a fake Herdr ----
let files, runsList, terminalList, state, notices, calls, testProps, spaceList, outputs, sounds;
const reset = () => {
  files = new Map(); outputs = {}; sounds = []; runsList = {}; terminalList = []; state = {}; notices = []; calls = []; testProps = {};
  spaceList = [{ id: "s1", name: "Repo", folder: "/home/me/repo", machine: null, tabs: [] }, { id: "s2", name: "Remote", folder: "/srv", machine: "vps", tabs: [] }];
};
reset();
const dir = "/home/me/.local/state/herdr-automations";
let failWrite = 0;
const herdr = module({
  appHome: () => "/app", home: () => "/home/me", panes: () => [], spaces: () => spaceList, terminals: () => terminalList, focused: () => null,
  props: () => testProps, settings: () => ({}), theme: () => ({}), shared: (key) => state[key], setShared(key, value) { state[key] = value; },
  notify(n) { notices.push(plain(n)); }, playSound(name) { sounds.push(name); }, run(name, args) { calls.push(plain({ command: name, ...args })); }, nextCommand: () => new Promise(() => {}), pickFolder: async () => null,
  async readTextFile(path) { return files.get(path) ?? null; },
  async writeTextFile(path, body, expected) {
    if (failWrite-- > 0) throw new Error("stale");
    assert.equal(expected, files.get(path) ?? null);
    files.set(path, body);
  },
  async exec(command, args) {
    calls.push(plain({ command, args }));
    if (command === "python3" && args.at(-1) === "list") return { code: 0, stdout: JSON.stringify(runsList), stderr: "" };
    if (command === "python3" && args.includes("output")) return { code: 0, stdout: JSON.stringify(outputs[args.at(-1)] ?? { answer: "", log: "" }), stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  },
  async hc(args) {
    calls.push(plain({ command: "hc", args }));
    return { code: 0, stdout: JSON.stringify({ address: `t${calls.length}` }), stderr: "" };
  },
});
const elements = [];
const element = (...made) => {
  const record = { made };
  const el = new Proxy({}, { get: (_t, method) => (...args) => {
    (record[method] ??= []).push(args);
    if (method === "when" && args[0]) args[1](el);
    return el;
  } });
  elements.push(record);
  return el;
};
const input = (options = {}) => {
  let value = options.value ?? "";
  return { value: () => value, set_value(v) { value = v; }, on() {}, focus() {} };
};
const kit = module({ View: class {}, div: element, svg: element, image: element });
const base = module({ h_flex: element, v_flex: element, ...Object.fromEntries(["Button", "Combobox", "Input", "Popup", "Switch", "Textarea"].map((k) => [k, { new: element }])),
  TextView: { markdown: element }, InputState: { new: input }, TextareaState: { new: input }, ScrollHandle: { new: () => ({ scroll_to_item() {} }) } });
const modules = { "gpui-kit": kit, "gpui-base": base, herdr, "./cron.js": cron };
for (const name of ["data", "form", "main"]) modules[`./${name}.js`] = new vm.SourceTextModule(await source(`${name}.js`), { context });
const link = (name) => modules[name];
await modules["./main.js"].link(link);
await modules["./main.js"].evaluate();
const { default: Automations } = modules["./main.js"].namespace;
const data = modules["./data.js"].namespace;

const tasks = [];
const timers = [];
const cx = { notify() {}, bind_keys() {}, focus_handle: () => ({ focus() {}, is_focused: () => false }),
  spawn(fn) { const p = fn(cx); tasks.push(p); return p; }, timer: { every(_ms, fn) { timers.push(fn); } } };
// A spawned loop on nextCommand never ends: let the queue run instead of awaiting it.
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); await new Promise((r) => setImmediate(r)); };
const tree = () => { elements.length = 0; view.render(); return elements; };
const by = (id) => elements.find((el) => el.made[0] === id || el.id?.[0]?.[0] === id);
const click = async (id) => { tree(); const el = by(id); assert(el?.on_click, `No active control ${id}`); el.on_click[0][0]({}, cx); await flush(); };
// A Switch reports on_change with its new value, never on_click.
const toggle = async (id, value) => { tree(); const el = by(id); assert(!el.on_click); el.on_change[0][0](value, cx); await flush(); };
const texts = () => tree().flatMap((el) => (el.child ?? []).map(([c]) => c)).filter((c) => typeof c === "string");
const has = (pattern) => assert(texts().some((c) => pattern.test(c)), `No text ${pattern} in ${JSON.stringify(texts())}`);
const define = (...list) => files.set(`${dir}/automations.json`, JSON.stringify({ automations: list }));
const automation = (o = {}) => ({ id: "a1", name: "Nightly", kind: "script", text: "true", folder: "/home/me/repo", cron: "0 9 * * *", active: true, notify: "failure", limit: 60, ...o });
let view;
const open = async (props = {}) => { testProps = props; timers.length = 0; view = new Automations(); view.init({}, cx); await flush(); };
const tick = async () => { for (const fn of timers) fn(cx); await flush(); };
const hcRuns = () => calls.filter((c) => c.command === "hc" && c.args[0] === "run");

// The scheduler: due and active only, once per minute, never a missed minute.
define(automation(), automation({ id: "a2", active: false }), automation({ id: "a3", cron: "" }), automation({ id: "a4", cron: "broken" }), automation({ id: "a5", cron: "1 9 * * *" }));
await open({ poll: true });
await tick();
assert.equal(hcRuns().length, 0, "08:59 starts nothing");
clock += 30_000; // 09:00
await tick();
await tick();
assert.equal(hcRuns().length, 1, "Only the due, active automation starts, once; a broken schedule does not stop the others");
const argv = hcRuns()[0].args;
assert(argv.includes("automation.id=a1") && argv.includes("--outlive-parent") && argv.at(-1) === "schedule" && argv.at(-2) === `s${clock / 60_000}`);
assert(!argv.some((a) => String(a).startsWith("task.kind")), "Runs do not show in Tasks");
clock += 5 * 60_000; // asleep over 09:01
await tick();
assert.equal(hcRuns().length, 1, "A missed minute is skipped");

// Two automations in the same minute are two runs, and hc accepts both.
clock = new Date(2026, 10, 26, 8, 59).getTime();
reset();
define(automation({ notify: "always" }), automation({ id: "a2", name: "Other", notify: "always" }));
await open({ poll: true });
clock += 60_000;
await tick();
assert.equal(hcRuns().length, 2);
for (const { args } of hcRuns()) assert(!args.includes("--name"), "hc names have 32 characters at most and must be unique");
const same = `s${clock / 60_000}`;
assert.deepEqual(Object.keys(state["automations.pending"]), [`a1/${same}`, `a2/${same}`]);
terminalList = [{ address: "t1", state: "live", labels: { "automation.id": "a2", "automation.run": same } }, { address: "t2", state: "live", labels: { "automation.id": "a1", "automation.run": same } }];
await data.stop("a1", same);
assert.deepEqual(calls.at(-1).args, ["kill", "t2"], "Stop ends the run of its own automation");
terminalList = terminalList.slice(0, 1);
runsList = { a1: [{ id: same, state: "done", started: clock, finished: clock + 1000 }], a2: [{ id: same, state: "running", started: clock }] };
await tick();
assert.deepEqual(notices.map((n) => n.title), ["Nightly: Succeeded"]);
assert.deepEqual(Object.keys(state["automations.pending"]), [`a2/${same}`]);

// Notifications follow each automation's choice, once, after the run has a final state.
const settle = async (notifyWhen, runState, extra = {}) => {
  reset();
  define(automation({ notify: notifyWhen }));
  state["automations.pending"] = { "a1/m1": { at: clock, address: "t9" } };
  runsList = { a1: [{ id: "m1", state: runState, started: clock, finished: clock + 5000, kind: "script", ...extra }] };
  await open({ poll: true });
  await tick();
  return notices.length;
};
assert.equal(await settle("failure", "done"), 0);
assert.equal(await settle("failure", "failed", { exit_code: 3 }), 1);
assert.match(notices[0].title, /Nightly: Failed \(exit 3\)/);
assert.deepEqual(notices[0].action, { name: "automations.show" });
await tick();
assert.equal(notices.length, 1, "One notification for each run");
assert.deepEqual(calls.filter((c) => c.args?.[0] === "rm").map((c) => c.args), [["rm", "t9"]], "The finished terminal is removed, once");
assert.equal(await settle("failure", "interrupted"), 1);
assert.equal(await settle("always", "done"), 1);
assert.equal(await settle("never", "failed"), 0);
assert.equal(await settle("always", "stopped"), 0, "The person stopped it");
assert.equal(await settle("always", "skipped"), 0);
assert.equal(await settle("always", "running"), 0);
assert(state["automations.pending"]["a1/m1"], "A run without a final state stays pending");
assert(!calls.some((c) => c.args?.[0] === "rm"));

// The card: an empty list, then a new automation.
reset();
await open();
has(/No automations/);
await click("auto-new");
has(/Prompt/);
await click("auto-save");
has(/Write a name/);
assert.equal(files.size, 0);
view.form.inputs.name.set_value("Backup");
await click("auto-kind-script");
view.form.inputs.text.set_value("echo hi");
view.form.inputs.folder.set_value("repo");
await click("auto-save");
has(/must start with/);
view.form.inputs.folder.set_value("~/repo");
view.form.inputs.limit.set_value("0");
await click("auto-save");
has(/1 to 1440/);
view.form.inputs.limit.set_value("5");
failWrite = 1; // another writer was first
await click("auto-save");
let saved = JSON.parse(files.get(`${dir}/automations.json`)).automations;
assert.equal(saved.length, 1);
const id = saved[0].id;
assert.match(id, /^[a-z0-9]+$/, "The runner accepts this id");
assert.deepEqual(plain({ ...saved[0], id: 0 }), { id: 0, active: true, name: "Backup", kind: "script", text: "echo hi", folder: "/home/me/repo", cron: "0 9 * * *", notify: "failure", limit: 5 });
assert(calls.some((c) => c.command === "mkdir" && c.args.includes("700")));
has(/Every day at 09:00 · Next:/);

// Pause, resume and run while paused.
await toggle(`active-${id}`, false);
assert.equal(JSON.parse(files.get(`${dir}/automations.json`)).automations[0].active, false);
has(/Paused/);
await click(`run-${id}`);
assert.equal(hcRuns().at(-1).args.at(-1), "manual", "A paused automation runs on request");
assert.equal(Object.keys(state["automations.pending"]).length, 1);
await toggle(`active-${id}`, true);
assert.equal(JSON.parse(files.get(`${dir}/automations.json`)).automations[0].active, true);

// An active run: Stop replaces Run now, and the automation cannot be deleted.
terminalList = [{ address: "t5", state: "live", labels: { "automation.id": id, "automation.run": "m7" } }];
runsList = { [id]: [{ id: "m7", state: "running", started: clock, trigger: "manual", kind: "script" }] };
await tick();
tree();
assert(!by(`run-${id}`));
await click(`stop-${id}`);
assert.deepEqual(calls.filter((c) => c.args?.[0] === "kill").at(-1).args, ["kill", "t5"]);
await click(`edit-${id}`);
tree();
assert(!by("auto-delete").on_click, "No deletion during a run");
await click("auto-cancel");

// Editing keeps the id and the active state; results open; deletion asks first.
terminalList = [];
runsList = { [id]: [{ id: "m8", state: "done", started: clock, finished: clock + 65_000, trigger: "schedule", kind: "prompt", harness: "claude", folder: "/home/me/repo", session: "ses-1", exit_code: 0 },
  { id: "s1", state: "skipped", started: clock, trigger: "schedule" }] };
await tick();
await click(`edit-${id}`);
view.form.inputs.name.set_value("Renamed");
await click("auto-save");
saved = JSON.parse(files.get(`${dir}/automations.json`)).automations;
assert.deepEqual([saved.length, saved[0].id, saved[0].name, saved[0].active], [1, id, "Renamed", true]);
await click(`results-${id}`);
has(/Finished · Schedule · 1 min 5 s/);
has(/Skipped: a run was active/);
assert(!by("result-s1").on_click, "A skipped run has no output");
outputs.m8 = { answer: "# Answer", log: "→ Read" };
await click("result-m8");
assert(tree().some((el) => el.made[1] === "# Answer"), "A prompt shows its answer as Markdown");
await click("run-log");
assert(!tree().some((el) => el.made[1] === "# Answer"), "Log replaces the answer");
await click("run-open");
assert.deepEqual(calls.at(-1), { command: "tab.new", space: "s1", folder: "/home/me/repo", name: "Renamed", argv: ["claude", "--resume", "ses-1"] });
spaceList = [];
await click("run-open");
assert.equal(calls.at(-1).machine, "", "Without a space for the folder, a new local one");
await click("auto-back");
await click("auto-edit");
await click("auto-delete");
assert.equal(JSON.parse(files.get(`${dir}/automations.json`)).automations.length, 1, "The first click only asks");
await click("auto-delete");
assert.equal(JSON.parse(files.get(`${dir}/automations.json`)).automations.length, 0);
has(/No automations/);

// Prompts: the harness choices come from worktrees.json; a saved automation keeps its model.
reset();
files.set("/app/worktrees.json", JSON.stringify({ agents: { claude: { models: ["opus", "haiku"], efforts: ["high", "low"] }, codex: { models: ["gpt"], efforts: ["low"] } } }));
await open();
await click("auto-new");
assert.deepEqual(plain([view.form.value.model, view.form.value.effort]), ["opus", "high"]);
view.form.pick("model", view.form.options("model")[1], cx);
assert.deepEqual(plain([view.form.value.model, view.form.value.effort]), ["haiku", "high"], "The effort stays when the new model has it");
view.form.pick("harness", { value: "codex" }, cx);
assert.deepEqual(plain([view.form.value.model, view.form.value.effort]), ["gpt", "low"]);
view.form.inputs.name.set_value("P");
view.form.inputs.text.set_value("do");
assert.deepEqual(plain(view.form.options("folder").map((o) => o.value)), ["~/repo"], "Only folders of local spaces");
await click("auto-save");
saved = JSON.parse(files.get(`${dir}/automations.json`)).automations[0];
assert.deepEqual([saved.harness, saved.model, saved.effort, saved.provider], ["codex", "gpt", "low", undefined]);

await click("auto-new");
assert.equal(view.form.value.notify, "always", "A new agent notifies as other agents do");
await click("auto-kind-script");
assert.equal(view.form.value.notify, "failure");
await click("auto-kind-prompt");
view.form.inputs.name.set_value("Home");
view.form.inputs.text.set_value("do");
view.form.inputs.folder.set_value("~");
await click("auto-save");
has(/always asks to trust the home folder/);

// A prompt run is an agent: its live status, in the words of Spaces.
reset();
define(automation({ id: "a1", kind: "prompt", harness: "claude", notify: "failure" }));
const agent = (status, o = {}) => ({ address: "t4", state: "live", status, turn: 1, labels: { "automation.agent": "a1", "automation.run": "m1", ...o.labels }, report: o.report });
runsList = { a1: [{ id: "s9", state: "skipped", started: clock + 1, kind: "prompt" }, { id: "m1", state: "done", started: clock, finished: clock + 1000, kind: "prompt", harness: "claude", folder: "/home/me/repo", session: "ses-1" }] };
outputs.m1 = { answer: "First", log: "First" };
await open();
terminalList = [agent("working")];
has(/^Working · /);
assert(by("stop-a1"), "A continued agent can be stopped");
await click("stop-a1");
assert.deepEqual(calls.filter((c) => c.args?.[0] === "kill").map((c) => c.args), [["kill", "t4"]]);
terminalList = [agent("blocked", { report: { msg: "Red or blue?" } })];
has(/^Needs input · Red or blue\?$/);
await click("answer-a1");
assert.deepEqual(calls.at(-1), { command: "terminal.peek", terminal: "t4" }, "The answer is given to the agent itself");
terminalList = [agent("blocked", { labels: { "herdr.space": "s1" } })];
await click("answer-a1");
assert.deepEqual(calls.at(-1), { command: "agent.focus", terminal: "t4" }, "One kept as a tab is shown there");
tree();
assert(by("run-a1"), "A kept tab does not count as a run");
terminalList = [agent(null, {})];
await click("results-a1");
has(/^Starting · /);
for (const word of ["idle", "done"]) {
  terminalList = [agent(word)];
  has(/^Finished · /);
  terminalList = [agent(word, { labels: { "herdr.seen": "1" } })];
  has(/^Idle · /);
}
terminalList = [agent("idle")];
await click("result-m1");
assert(calls.some((c) => c.command === "hc" && c.args.join(" ") === "label t4 herdr.seen=1"), "Reading the result is a look at the agent");
assert(tree().some((el) => el.made[1] === "First"));
outputs.m1 = { answer: "Second", log: "Second" };
terminalList = [{ ...agent("idle"), turn: 2, labels: { ...agent("idle").labels, "herdr.seen": "2" } }];
await tick();
assert(tree().some((el) => el.made[1] === "Second"), "A continued agent's new answer shows");
terminalList = [];
spaceList = [{ id: "s1", name: "Repo", folder: "/home/me/repo", machine: null, tabs: [] }];
await click("run-open");
assert.deepEqual(calls.at(-1).argv, ["claude", "--resume", "ses-1"], "One that ended resumes its session");

// An agent that needs the person notifies once for each question, unless never.
for (const [choice, count] of [["failure", 1], ["always", 1], ["never", 0]]) {
  reset();
  define(automation({ kind: "prompt", harness: "claude", notify: choice, active: false }));
  await open({ poll: true });
  terminalList = [agent("blocked", { report: { msg: "Red or blue?" } })];
  await tick();
  await tick();
  assert.equal(notices.length, count, choice);
}
reset();
define(automation({ kind: "prompt", harness: "claude", active: false }));
await open({ poll: true });
terminalList = [agent("blocked", { report: { msg: "Red or blue?" } })];
await tick();
assert.deepEqual(notices[0], { title: "Nightly: Needs input", body: "Red or blue?", level: "warning", action: { name: "terminal.peek", args: { terminal: "t4" } } });
assert.deepEqual(sounds, ["blocked"]);
terminalList = [agent("working")];
await tick();
terminalList = [agent("blocked")];
await tick();
assert.equal(notices.length, 2, "A second question notifies again");
terminalList = [agent("blocked", { labels: { "herdr.space": "s1" } })];
await tick();
assert.equal(notices.length, 2, "Herdr itself notifies for a tab");

// An unreadable file is reported and never overwritten.
reset();
files.set(`${dir}/automations.json`, "{ broken");
await open();
has(/not valid JSON/);
await assert.rejects(data.changeAutomations((list) => list), /not valid JSON/);
assert.equal(files.get(`${dir}/automations.json`), "{ broken");
console.log("Automations: cron, presets, scheduler, notifications, form, pause, run, stop, results, open and delete pass.");
