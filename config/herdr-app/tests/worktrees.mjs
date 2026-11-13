// Run: node --experimental-vm-modules config/herdr-app/tests/worktrees.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = "/repo", checkout = "/worktrees/fix-test";
let created, failSetup, calls, jobs;
let testSpaces = [], testPanes = [], testFocus = null;
const testShared = {};
let draftWrites = 0;
const context = vm.createContext({ console, localStorage: { getItem() { return null; }, setItem(key) { if (key === "draft") draftWrites++; }, removeItem() {} } });
const module = (values) => new vm.SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value);
}, { context });
let virtualLists = 0;
const actions = new Map();
const element = () => new Proxy({}, { get: (_target, method) => (...args) => {
  if (method === "on_action") actions.set(args[0], args[1]);
  if (method === "when" && args[0]) return args[1](element());
  return element();
} });
const kit = module({ View: class {}, div: element, image: element, svg: element });
const state = (opts = {}) => {
  const handlers = {};
  return { on(event, fn) { (handlers[event] ??= []).push(fn); }, emit(event, cx) { for (const fn of handlers[event] ?? []) fn({}, cx); },
    focus() {}, value() { return opts.value ?? ""; }, set_value(v) { opts.value = v; }, replace(v) { opts.value = (opts.value ?? "") + v; } };
};
const base = module({ ...Object.fromEntries([
  "h_flex", "v_flex", "Input", "InputState", "Scrollbar", "Textarea", "TextareaState", "VirtualListScrollHandle", "v_virtual_list", "Combobox", "Popup",
].map((key) => [key, { new: element }])), h_flex: element, v_flex: element,
  v_virtual_list() { virtualLists++; return element(); },
  InputState: { new: state }, TextareaState: { new: state }, VirtualListScrollHandle: { new: () => ({ scroll_to_item() {} }) } });
const herdr = module({
  agents() { return []; }, appHome() {}, home() { return "/home/test"; }, panes() { return testPanes; }, readTextFile() {}, spaces() { return testSpaces; },
  closeOverlay() {}, focused() { return testFocus; }, props() {}, settings() { return {}; }, theme() { return {}; },
  shared(key) { return testShared[key]; }, setShared(key, value) { testShared[key] = value; },
  machines() { return []; }, openOverlay() {}, hc() {}, watchFolder() {}, window() {}, layout() {},
  run(command, args) { calls.push({ command, args }); },
  async exec(command, args, { cwd } = {}) {
    if (command === "sh") return { code: 0, stdout: "", stderr: "" };
    if (command === "wt") return { code: 0, stdout: JSON.stringify({ repo: { default_branch: "develop" }, items: [{ branch: "develop", worktree: { path: cwd, main: true } }] }) };
    assert.equal(command, "git");
    if (cwd === "/not-a-repo") return { code: 1, stdout: "", stderr: "not a repository" };
    if (args[0] === "rev-parse") return { code: 0, stdout: args.includes("--git-common-dir") ? `${cwd}/.git` : cwd };
    if (args[0] === "branch") return { code: 0, stdout: "develop" };
    if (args[0] === "for-each-ref") return { code: 0, stdout: "refs/heads/develop\n" };
    return { code: 0, stdout: args[0] === "worktree" && created ? `worktree ${checkout}\nbranch refs/heads/fix/test\n\n` : "", stderr: "" };
  },
});
const job = module({ Job: { async run(cwd, argv, onLines) {
  jobs.push({ cwd, argv });
  onLines(["Setting up…"]);
  if (failSetup) return 1;
  created = true;
  return 0;
} } });
const data = new vm.SourceTextModule(await readFile(new URL("../mods/worktrees/data.js", import.meta.url), "utf8"), { context });
await data.link(() => herdr);
const main = new vm.SourceTextModule(await readFile(new URL("../mods/worktrees/main.js", import.meta.url), "utf8"), { context });
await main.link((name) => ({ "gpui-kit": kit, "gpui-base": base, herdr, "./data.js": data, "./job.js": job })[name]);
await main.evaluate();

async function launch(existing = false, failure = false, prompt = "") {
  created = existing;
  failSetup = failure;
  calls = [];
  jobs = [];
  const view = new main.namespace.default();
  Object.assign(view, {
    repo: { root }, names: { local: new Set(), remote: new Set() }, rows: [],
    close() {}, prompt: { set_value() {} }, branch: { set_value() {} },
  });
  let task;
  const cx = { notify() {}, spawn(fn) { task = fn(cx); } };
  view.launch({ branch: "fix/test", base: "main", prompt, agent: "codex", sel: {} }, cx);
  await task;
  return view;
}

await launch();
assert.equal(calls[0]?.command, "space.new");
assert.equal(calls[0]?.args.folder, checkout, "Start the space in the worktree, not in wt's original folder");
assert.equal(jobs.length, 1);
assert(!jobs[0].argv.includes("-x"), "wt must finish before the agent starts");
await launch(true);
assert.equal(jobs.length, 0, "Reuse an existing worktree");
assert.equal(calls[0]?.args.folder, checkout);
const failed = await launch(false, true);
assert.equal(calls.length, 0, "Do not open a space when setup fails");
assert.match(failed.message, /failed/i);
await launch(false, false, "Fix this");
assert.equal(calls[0]?.args.folder, checkout);
assert.equal(calls[0]?.args.argv[0], "sh");
assert(!calls[0]?.args.argv.includes("wt"));
console.log("Worktree launch: new, existing, and failed setup passed.");

const view = new main.namespace.default();
const handle = { focus() {} };
const cx = { notify() {} };
let scrolledTo;
Object.assign(view, {
  agent: "opencode", selections: { opencode: { provider: "a", model: "one", effort: "high" } },
  opencode: [
    { id: "a", name: "A", models: [{ id: "one", name: "One", variants: ["high"] }] },
    { id: "b", name: "B", models: [{ id: "one", name: "One via B", variants: ["low"] }, { id: "two", name: "Two", variants: ["low"] }] },
  ],
  cfg: { agents: { claude: { models: ["sonnet", "opus"], efforts: ["high", "low"] }, codex: {} } },
  choiceHandles: { workspace: handle, agent: handle, model: handle, effort: handle, base: handle },
  choiceSearch: state(), choiceQuery: "", choiceScroll: { scroll_to_item(i) { scrolledTo = i; } },
  prompt: handle, branch: handle, base: state({ value: "main" }), savePrefs() {}, saveDraft() {},
});
assert(!view.fields().includes("provider"), "The provider is not a separate field");
assert.deepEqual(Array.from(view.options("model"), (o) => [o.provider, o.model, o.group]), [
  ["a", "one", "A"], ["b", "one", "B"], ["b", "two", "B"],
]);
assert.equal(new Set(view.options("model").map((o) => o.value)).size, 3, "Identical model IDs from different providers stay distinct");
assert.deepEqual(Array.from(view.choiceRows("model"), (o) => o.heading ? o.label : o.model), ["A", "one", "B", "one", "two"]);
view.showChoice("model", true, cx);
assert.equal(scrolledTo, 1, "Scroll to the model, not its provider heading");
view.choiceKey("down", cx);
assert.equal(view.choiceAt, 1);
assert.equal(scrolledTo, 3, "Keyboard navigation skips provider headings");
assert.equal(view.selections.opencode.provider, "a", "Browsing must not change the saved value");
view.choiceKey("end", cx);
view.choiceKey("down", cx);
assert.equal(view.choiceAt, 2, "Stop at the end of the list");
view.choiceKey("escape", cx);
assert.equal(view.dropdown, null);
assert.equal(view.selections.opencode.provider, "a");
view.pickChoice("model", "group:b");
assert.equal(view.selections.opencode.provider, "a", "Provider headings cannot be selected");
view.showChoice("model", true, cx);
view.choiceKey("down", cx);
view.choiceKey("enter", cx);
assert.equal(view.dropdown, null);
assert.equal(view.selections.opencode.provider, "b");
assert.equal(view.selections.opencode.model, "one", "Pick the provider even when its model ID is identical");
assert.equal(view.selections.opencode.effort, "", "A new model resets invalid effort");
assert.equal(JSON.parse(data.namespace.agentArgv("opencode", view.selections.opencode).at(-1)).providerID, "b", "Launch with the selected provider");
view.showChoice("model", true, cx);
assert.equal(view.choiceAt, 1, "Reopen on the selected provider/model pair");
view.choiceKey("end", cx);
view.choiceKey("enter", cx);
assert.equal(view.selections.opencode.model, "two");
view.showChoice("model", true, cx);
view.choiceKey("tab", cx);
assert.equal(view.dropdown, null);
assert.equal(view.fields()[view.field], "effort");
view.showChoice("model", true, cx);
view.choiceKey("shift-tab", cx);
assert.equal(view.fields()[view.field], "agent");
const restored = view.validSelection({ provider: "b", model: "one", effort: "low" }, "opencode");
assert.equal(restored.provider, "b");
assert.equal(restored.model, "one");
assert.equal(restored.effort, "low", "Keep saved native provider/model/effort IDs");
assert.equal(view.validSelection({ provider: "b", model: "gone" }, "opencode").model, "one", "Use a model from the saved provider if its previous model is gone");
assert.equal(view.validSelection({ provider: "gone", model: "gone" }, "opencode").provider, "a");
view.opencode = view.opencode.slice(0, 1);
assert.equal(view.options("model")[0].group, "", "Do not add a provider heading for a single provider");
view.opencode = null;
assert(view.fields().includes("model"), "Keep the model control while loading");
assert(!view.fields().includes("effort"));
view.agent = "claude";
view.selections.claude = view.validSelection({ model: "opus", effort: "low" }, "claude");
view.pickChoice("model", "sonnet");
assert.equal(view.selections.claude.model, "sonnet");
assert.equal(view.selections.claude.effort, "low");
assert.equal(view.choiceValue("model"), "sonnet", "Other harnesses keep their plain model IDs");
console.log("Dropdowns: grouped providers, duplicate models, saved choices, launch IDs, keyboard navigation, and loading passed.");

testSpaces = [
  { id: "current", name: "Current project", tabs: [{ id: "current-tab" }], folder: "/repo", active: true },
  { id: "other", name: "Other project", tabs: [{ id: "other-tab" }], folder: "/stale" },
  { id: "invalid", name: "Not a repository", tabs: [], folder: "/not-a-repo" },
  { id: "remote", name: "Remote project", machine: "server", tabs: [], folder: "/remote" },
];
testPanes = [{ tab: "other-tab", cwd: "/other" }];
testFocus = { space: "current", cwd: "/repo" };
const workspaceView = new main.namespace.default();
const initCx = { focus_handle() { return handle; }, bind_keys() {}, timer: { after() {} }, spawn() {} };
workspaceView.init({}, initCx);
assert.equal(workspaceView.workspace, "current", "Preselect the current space, not the last used workspace");
assert.deepEqual(Array.from(workspaceView.options("workspace"), (o) => o.value), ["current", "other", "invalid"], "The local launcher must not offer remote spaces");
Object.assign(workspaceView, {
  repo: { root, base: "main" }, selections: { claude: {} }, agent: "claude", view: "new",
  saveDraft() {}, refreshOpencode() {},
});
workspaceView.prompt.set_value("Keep this task");
workspaceView.branch.set_value("fix/task");
let workspaceTask;
const workspaceCx = { notify() {}, spawn(fn) { workspaceTask = fn(workspaceCx); } };
workspaceView.pickChoice("workspace", "other", workspaceCx);
assert(workspaceView.busy, "Block launch until the new repository is ready");
await workspaceTask;
assert.equal(workspaceView.workspace, "other");
assert.equal(workspaceView.repo.root, "/other", "Resolve the selected space's live terminal folder, not the focused space or stale saved folder");
assert.equal(workspaceView.base.value(), "develop");
assert(workspaceView.names.local.has("develop"));
assert(workspaceView.rows[0].spaces.includes("other"), "Load the selected repository's existing worktrees so an open space can be reused");
assert.equal(workspaceView.prompt.value(), "Keep this task");
assert.equal(workspaceView.branch.value(), "fix/task");
assert.equal(workspaceView.busy, null);
workspaceView.showChoice("workspace", true, workspaceCx);
workspaceView.pickChoice("workspace", "other", workspaceCx);
assert.equal(workspaceView.dropdown, null, "Selecting the current workspace closes the menu");
workspaceView.pickChoice("workspace", "invalid", workspaceCx);
await workspaceTask;
assert.equal(workspaceView.workspace, "other", "Reject a non-repository without changing the launch target");
assert.equal(workspaceView.repo.root, "/other");
assert.match(workspaceView.message, /not a local Git repository/);
const noRepoView = new main.namespace.default();
noRepoView.init({}, initCx);
noRepoView.repo = null;
noRepoView.refreshOpencode = () => {};
noRepoView.pickChoice("workspace", "other", workspaceCx);
await workspaceTask;
assert.equal(noRepoView.view, "new", "Allow a new worktree for another workspace when the current space is not a repository");
assert.equal(noRepoView.repo.root, "/other");
assert.equal(noRepoView.agent, "claude");
console.log("Workspaces: current default, target repository, base branch, preserved task, and invalid selection passed.");

const spaceMarks = new vm.SourceTextModule(await readFile(new URL("../mods/spaces-pr/main.js", import.meta.url), "utf8"), { context });
const pr = module({ PullRequests: class {} });
await spaceMarks.link((name) => ({ "gpui-kit": kit, "gpui-base": base, herdr, "./pr.js": pr })[name]);
await spaceMarks.evaluate();
testShared["space.colors"] = { current: "#123456", other: "ansi3" };
const mark = spaceMarks.namespace.spaceMark;
testShared["spaces-pr.marks"] = {
  current: mark(testSpaces[0], false, {}),
  other: mark(testSpaces[1], false, {}),
  invalid: mark(testSpaces[2], true, {}),
};
assert.equal(testShared["spaces-pr.marks"].current.color, "#123456", "Keep custom workspace colors");
assert.equal(testShared["spaces-pr.marks"].other.color, "#e3814f", "Keep the Spaces view's palette");
assert.equal(testShared["spaces-pr.marks"].other.text, "O");
assert.equal(testShared["spaces-pr.marks"].invalid.icon, "mods/workspace-chrome/branch.svg", "Keep the worktree branch icon");
assert.equal(workspaceView.options("workspace")[1].mark, testShared["spaces-pr.marks"].other, "Use the exact mark from the Spaces view");
console.log("Workspace marks: shared palette, custom colors, initials, and worktree icons passed.");

function search(view, field, query) {
  view.showChoice(field, true, cx);
  view.choiceSearch.set_value(query);
  view.filterChoices(cx);
  return Array.from(view.choiceOptions(field), (o) => o.value);
}
view.names = { names: ["develop", "feat/search", "main"] };
assert.deepEqual(search(view, "base", "FEAT/"), ["feat/search"]);
assert.equal(view.base.value(), "main", "Typing only filters; it must not commit an incomplete branch name");
view.choiceKey("enter", cx);
assert.equal(view.base.value(), "feat/search");
view.pickChoice("base", "not-a-branch", cx);
assert.equal(view.base.value(), "feat/search", "Only existing branches can be selected");
assert.deepEqual(search(view, "base", "missing"), []);
view.choiceKey("enter", cx);
assert.equal(view.dropdown, "base", "Enter with no matches must not launch or select anything");
view.choiceKey("escape", cx);
assert.equal(view.base.value(), "feat/search");
assert.deepEqual(search(view, "agent", "Claude Code"), ["claude"], "Spaces must be allowed in search queries");
assert.deepEqual(search(view, "workspace", "other"), ["other"]);
assert.deepEqual(search(view, "model", "son"), ["sonnet"]);
assert.deepEqual(search(view, "effort", "lo"), ["low"]);
view.agent = "opencode";
view.opencode = [
  { id: "a", name: "Provider A", models: [{ id: "one", name: "One", variants: [] }] },
  { id: "b", name: "Provider B", models: [{ id: "one", name: "One", variants: [] }] },
];
assert.deepEqual(search(view, "model", "provider b"), [JSON.stringify(["b", "one"])]);
assert.equal(view.choiceRows("model")[0].label, "Provider B", "Keep only the matching provider's heading");
view.choiceKey("enter", cx);
assert.equal(view.selections.opencode.provider, "b");
view.showChoice("base", true, cx);
assert.equal(view.choiceQuery, "", "Clear the previous field's query on open");
assert.equal(view.options("base").length, 3, "Searching must not alter the available branch catalog");
view.choiceKey("tab", cx);
assert.equal(view.fields()[view.field], "workspace", "Base remains the last field in Tab order");
view.handle = { is_focused: () => false };
view.view = "new";
view.choiceHandles = Object.fromEntries(["workspace", "agent", "model", "effort", "base"].map((field) => [field, { focus() {}, is_focused: () => field === "base" }]));
view.field = view.fields().indexOf("base");
view.key({ key_char: "f", keystroke: "f", modifiers: {} }, cx);
assert.equal(view.dropdown, "base", "Typing on a focused selector opens autocomplete without an extra click");
assert.equal(view.choiceQuery, "f", "Keep the first typed character");
workspaceView.repo.base = "detached-sha";
workspaceView.restoreForm();
assert.equal(workspaceView.base.value(), "develop", "A detached checkout defaults to an existing branch");
console.log("Autocomplete: all selectors, branch validation, cancellation, empty results, provider groups, and Tab passed.");

let notifications = 0;
const timers = [], bindings = [];
const inputCx = { ...initCx, notify() { notifications++; }, bind_keys(keys) { bindings.push(...keys); }, timer: { after(ms, fn) {
  const timer = { ms, fn, cancelled: false, cancel() { this.cancelled = true; } };
  timers.push(timer);
  return timer;
} } };
const inputView = new main.namespace.default();
inputView.init({}, inputCx);
Object.assign(inputView, { repo: { root, base: "main" }, selections: { claude: {} }, agent: "claude", view: "new" });
for (const text of ["F", "Fi", "Fix"]) {
  inputView.prompt.set_value(text);
  inputView.prompt.emit("change", inputCx);
}
assert.equal(notifications, 1, "Only redraw the form when the Start button changes between enabled and disabled");
assert.equal(draftWrites, 0, "Do not save a draft on every keystroke");
for (const timer of timers.filter((t) => !t.cancelled && t.ms < 600)) timer.fn(inputCx);
assert.equal(draftWrites, 1, "Save the latest draft after typing stops");
inputView.prompt.set_value("");
inputView.prompt.emit("change", inputCx);
assert.equal(notifications, 2, "Disable Start when the task becomes empty");
inputView.prompt.set_value("Restored task");
inputView.formView({}, inputView.ui({}));
inputView.prompt.set_value("");
inputView.prompt.emit("change", inputCx);
assert.equal(notifications, 3, "Clearing a restored draft also disables Start");
console.log("Task edits: native text updates, only button-state redraws, and one deferred draft save passed.");

// Closed selectors must not rebuild their option lists while the task is edited.
view.dropdown = null;
view.choiceWidths = {};
view.names = { names: Array.from({ length: 10000 }, (_, i) => `branch-${i}`), local: new Set(), remote: new Set() };
view.prompt = state({ value: "A task" });
view.branch = state();
const start = performance.now();
for (let i = 0; i < 100; i++) view.formView({}, view.ui({}));
console.log(`Task form: 100 renders in ${(performance.now() - start).toFixed(1)} ms; ${virtualLists} option lists built.`);
assert.equal(virtualLists, 0, "Typing with all selectors closed must not build any dropdown lists");
view.showChoice("base", true, cx);
view.formView({}, view.ui({}));
assert.equal(virtualLists, 1, "Build the dropdown list when its selector is open");
view.dropdown = null;

let submitted = 0;
view.submitNew = () => submitted++;
view.field = view.fields().indexOf("prompt");
view.enter(cx);
assert.equal(submitted, 0, "Plain Enter in the task must not launch the agent");
view.newKey("enter", cx);
assert.equal(submitted, 0, "Plain Enter must not launch through the form's fallback key handler");
view.repo = { root, base: "main" };
view.render();
for (const key of ["enter", "shift-enter"]) {
  const binding = bindings.find((b) => b.keystroke === key && b.context === "WtPrompt > Input");
  assert(binding, `${key} must override the legacy Input binding inside the task`);
  const before = view.prompt.value();
  actions.get(binding.action)({}, cx);
  assert.equal(view.prompt.value(), before + "\n", `${key} inserts a new line`);
}
assert.equal(submitted, 0, "New lines never submit the task");
const launchBinding = bindings.find((b) => b.keystroke === "ctrl-enter");
actions.get(launchBinding.action)({}, cx);
assert.equal(submitted, 1, "Ctrl+Enter still launches the task");
console.log("Task input: closed dropdowns skip list construction; plain Enter does not submit.");
