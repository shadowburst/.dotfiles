// Run: node --experimental-vm-modules config/herdr-app/tests/worktrees.mjs
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root = "/repo", checkout = "/worktrees/fix-test";
let created, failSetup, calls, jobs;
let testSpaces = [], testPanes = [], testFocus = null;
let testAgents = [], fixtureRoot, fixtureItems, historyGate;
const gitCalls = [];
const execCalls = [];
const hcCalls = [];
const testShared = {};
let draftWrites = 0;
const context = vm.createContext({ console, localStorage: { getItem() { return null; }, setItem(key) { if (key === "draft") draftWrites++; }, removeItem() {} } });
const module = (values) => new vm.SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value);
}, { context });
let virtualLists = 0;
const actions = new Map();
const buttons = new Map();
const lists = new Map();
const text = [], icons = [];
let deferred = false;
const element = (record) => new Proxy({}, { get: (_target, method) => (...args) => {
  assert(!(deferred && method.startsWith("on_")), "Virtual rows must not install handlers during native layout");
  if (record && typeof record === "object") record[method] = args;
  if (method === "child" && typeof args[0] === "string") text.push(args[0]);
  if (method === "on_action") actions.set(args[0], args[1]);
  if (method === "when" && args[0]) return args[1](element(record));
  return element(record);
} });
context.window = { paint_path: element };
const kit = module({ View: class {}, div: element, image: element, svg(path) { icons.push(path); return element(); }, PathBuilder: { stroke: element } });
const state = (opts = {}) => {
  const handlers = {};
  return { on(event, fn) { (handlers[event] ??= []).push(fn); }, emit(event, cx) { for (const fn of handlers[event] ?? []) fn({}, cx); },
    focus() {}, value() { return opts.value ?? ""; }, set_value(v) { opts.value = v; }, replace(v) { opts.value = (opts.value ?? "") + v; } };
};
const base = module({ ...Object.fromEntries([
  "h_flex", "v_flex", "Button", "Input", "InputState", "Scrollbar", "Textarea", "TextareaState", "VirtualListScrollHandle", "v_virtual_list", "Combobox", "Popup",
].map((key) => [key, { new: element }])), h_flex: element, v_flex: element, h_resizable: element, resizable_panel: element,
  Button: { new(id) { const record = { button: true }; buttons.set(id, record); return element(record); } },
  Scrollbar: { vertical: element },
  v_virtual_list(id, count, sizes, key, render) { virtualLists++; const record = { count, sizes, key, render }; lists.set(id, record); return element(record); },
  InputState: { new: state }, TextareaState: { new: state }, VirtualListScrollHandle: { new: () => ({ scroll_to_item() {} }) } });
const herdr = module({
  agents() { return testAgents; }, appHome() {}, home() { return "/home/test"; }, panes() { return testPanes; }, readTextFile() {}, spaces() { return testSpaces; },
  closeOverlay() {}, focused() { return testFocus; }, props() {}, settings() { return {}; }, theme() { return {}; },
  shared(key) { return testShared[key]; }, setShared(key, value) { testShared[key] = value; },
  machines() { return []; }, openOverlay() {}, async hc(args) {
    hcCalls.push(Array.from(args));
    if (args[0] === "run") return { stdout: JSON.stringify({ address: "t99" }) };
    if (args[0] === "get") return { stdout: JSON.stringify({ state: "finished", exit_code: 0 }) };
    return { stdout: "done\n" };
  }, watchFolder() {}, window() {}, layout() {},
  run(command, args) { calls.push({ command, args }); },
  async exec(command, args, { cwd, on } = {}) {
    execCalls.push({ command, args, cwd, on });
    if (command === "git") gitCalls.push({ cwd, args, on });
    if (fixtureRoot && cwd?.startsWith(fixtureRoot)) {
      if (command === "wt") return { code: 0, stdout: JSON.stringify({ repo: { default_branch: "main" }, items: fixtureItems }) };
      if (command === "git" && args[0] === "log" && historyGate) await historyGate;
      const r = spawnSync(command, args, { cwd, encoding: "utf8", env: gitEnv });
      return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? String(r.error ?? "") };
    }
    if (command === "python3") return { code: 1, stdout: "", stderr: "no fetch yet" };
    if (command === "sh") return { code: 0, stdout: args.includes("/api/model") || args.includes("/api/provider") ? '{"data":[]}' : "/target-home/.cache/herdr-worktrees/prompt-abc", stderr: "" };
    if (command === "wt") return { code: 0, stdout: JSON.stringify({ repo: { default_branch: "develop" }, items: [{ branch: "develop", worktree: { path: cwd, main: true } }] }) };
    assert.equal(command, "git");
    if (cwd === "/not-a-repo") return { code: 1, stdout: "", stderr: "not a repository" };
    if (args[0] === "rev-parse") return { code: 0, stdout: args.includes("--git-common-dir") ? `${cwd}/.git` : cwd };
    if (args[0] === "branch") return { code: 0, stdout: "develop" };
    if (args[0] === "for-each-ref") return { code: 0, stdout: "refs/heads/develop\n" };
    return { code: 0, stdout: args[0] === "worktree" && created ? `worktree ${checkout}\nbranch refs/heads/fix/test\n\n` : "", stderr: "" };
  },
});
const job = module({ Job: { async run(cwd, argv, onLines, on) {
  jobs.push({ cwd, argv, on });
  onLines(["Setting up…"]);
  if (failSetup) return 1;
  created = true;
  return 0;
} } });
const data = new vm.SourceTextModule(await readFile(new URL("../mods/worktrees/data.js", import.meta.url), "utf8"), { context });
await data.link(() => herdr);
const history = new vm.SourceTextModule(await readFile(new URL("../mods/worktrees/history.js", import.meta.url), "utf8"), { context });
await history.link(() => data);
const graph = new vm.SourceTextModule(await readFile(new URL("../mods/worktrees/graph.js", import.meta.url), "utf8"), { context });
await graph.link((name) => ({ "gpui-kit": kit, "gpui-base": base, herdr, "./data.js": data, "./history.js": history })[name]);
const main = new vm.SourceTextModule(await readFile(new URL("../mods/worktrees/main.js", import.meta.url), "utf8"), { context });
await main.link((name) => ({ "gpui-kit": kit, "gpui-base": base, herdr, "./data.js": data, "./job.js": job, "./graph.js": graph })[name]);
await main.evaluate();

async function launch(existing = false, failure = false, prompt = "", remote = "", machine = null) {
  created = existing;
  failSetup = failure;
  calls = [];
  jobs = [];
  const view = new main.namespace.default();
  Object.assign(view, {
    repo: { root, machine }, names: { local: new Set(), remote: new Set() }, rows: remote ? [{ branch: "fix/test", remote }] : [],
    close() {}, prompt: { set_value() {} }, branch: { set_value() {} },
  });
  let task;
  const cx = { notify() {}, spawn(fn) { task = fn(cx); } };
  view.launch({ branch: "fix/test", base: remote ? `refs/remotes/${remote}/fix/test` : "main", remote, prompt, agent: "codex", sel: {} }, cx);
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
view.graph = { enabled: false };
const handle = { focus() {}, is_focused: () => false };
const cx = { notify() {} };
let scrolledTo;
Object.assign(view, {
  agent: "opencode", selections: { opencode: { provider: "a", model: "one", effort: "high" } },
  opencode: [
    { id: "a", name: "A", models: [{ id: "one", name: "One", variants: ["high"] }] },
    { id: "b", name: "B", models: [{ id: "one", name: "One via B", variants: ["low"] }, { id: "two", name: "Two", variants: ["low"] }] },
  ],
  cfg: { agents: { claude: { models: ["sonnet", "opus"], efforts: ["high", "low"] }, codex: {} } },
  choiceHandles: Object.fromEntries(["workspace", "agent", "model", "effort", "branch", "base", "launch", "back"].map((f) => [f, handle])),
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
const initCx = { focus_handle() { return handle; }, bind_keys() {}, timer: { after() {}, every() {} }, spawn() {} };
workspaceView.init({}, initCx);
assert.equal(workspaceView.workspace, "current", "Preselect the current space, not the last used workspace");
assert.deepEqual(Array.from(workspaceView.options("workspace"), (o) => o.value), ["current", "other", "invalid", "remote"], "Offer spaces from every machine");
assert.equal(workspaceView.options("workspace").at(-1).label, "Remote project · server");
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
assert.match(workspaceView.message, /Git repository/);
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

execCalls.length = 0;
workspaceView.pickChoice("workspace", "remote", workspaceCx);
await workspaceTask;
assert.equal(workspaceView.repo.machine, "server");
assert.equal(workspaceView.repo.root, "/remote");
assert(execCalls.length && execCalls.every((c) => c.on === "server"), "Repository detection, branches and rows run on the selected machine");
assert(workspaceView.rows[0].spaces.includes("remote"));
assert.equal(workspaceView.modelCacheKey(), "opencode-models:server");
execCalls.length = 0;
await launch(false, false, "Remote task", "", "server");
assert.equal(jobs[0].on, "server", "Setup runs on the target machine");
assert.equal(calls[0].args.machine, "server", "The new agent space stays on the target machine");
assert(execCalls.every((c) => c.on === "server"), "Git and the private prompt file stay on the target machine");
assert(calls[0].args.argv.includes("/target-home/.cache/herdr-worktrees/prompt-abc"));

const realJob = new vm.SourceTextModule(await readFile(new URL("../mods/worktrees/job.js", import.meta.url), "utf8"), { context });
await realJob.link(() => herdr); await realJob.evaluate();
assert.equal(await realJob.namespace.Job.run("/repo", ["wt", "switch", "topic"], () => {}, "server"), 0);
assert.deepEqual(hcCalls[0].slice(0, 3), ["run", "--on", "server"]);
assert(hcCalls.slice(1).every((args) => args[1] === "server/t99"), "Wait, get, read and cleanup use the qualified remote terminal address");

testSpaces.push({ id: "remote-same-path", machine: "server", tabs: [{ id: "server/tab" }], folder: "/repo" });
testPanes.push({ pane: "server/pane", tab: "server/tab", cwd: "/repo" });
testAgents = [{ pane: "server/pane", status: "working" }];
const localRows = data.namespace.attach([{ path: "/repo", spaces: [], busy: false }]);
assert(!localRows[0].busy && !localRows[0].spaces.includes("remote-same-path"), "A remote agent at the same path must not block local work");
const remoteRows = data.namespace.attach([{ path: "/repo", spaces: [], busy: false }], "server");
assert(remoteRows[0].busy && remoteRows[0].spaces.includes("remote-same-path"));
testAgents = [];
execCalls.length = 0;
await data.namespace.loadOpencodeModels("/repo", [], "server");
await data.namespace.generateBranch({ naming_command: ["/nix/store/local-only/bin/textgen"] }, "Fix remote test", "server");
assert(execCalls.every((c) => c.on === "server"));
assert(!execCalls.some((c) => c.args.includes("/nix/store/local-only/bin/textgen")), "Do not send a local Nix store path to another machine");
for (const action of ["merge", "remove"]) {
  Object.assign(workspaceView, { view: action, sel: { path: "/worktree", branch: "topic", spaces: [] }, target: state({ value: "main" }), handle, finished() {} });
  workspaceView.confirm(workspaceCx); await workspaceTask;
  assert.equal(jobs.at(-1).on, "server", `${action} runs on the target machine`);
}
console.log("Machines: workspace switching, setup, prompt files, agent launch, terminal cleanup and busy detection passed.");

const promptHome = await mkdtemp("/tmp/opencode/herdr-prompt-");
try {
  const prompt = 'Quotes " and \' ; $(exit 7)\n{{ task }}';
  const argv = await data.namespace.promptCommand(["printf", "%s"], prompt, "server");
  const save = execCalls.at(-1);
  const saved = spawnSync(save.command, Array.from(save.args), { encoding: "utf8", env: { ...process.env, HOME: promptHome } });
  assert.equal(saved.status, 0, saved.stderr);
  const path = saved.stdout;
  assert(path.startsWith(`${promptHome}/.cache/herdr-worktrees/`));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal(await readFile(path, "utf8"), prompt, "The task is data, not shell code");
  const command = Array.from(argv, (a) => a === "/target-home/.cache/herdr-worktrees/prompt-abc" ? path : a);
  const result = spawnSync(command[0], command.slice(1), { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, prompt);
  await assert.rejects(stat(path), { code: "ENOENT" }, "Remove the prompt file after reading it");
} finally {
  await rm(promptHome, { recursive: true, force: true });
}

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
view.names = { names: ["develop", "feat/search", "main"], local: new Set(["develop", "feat/search", "main"]), remote: new Set() };
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
assert.equal(view.fields()[view.field], "back", "Tab reaches Back after Base");
view.tab(1, cx);
assert.equal(view.fields()[view.field], "workspace", "Tab wraps after Back");
view.handle = { is_focused: () => false };
view.view = "new";
view.choiceHandles = Object.fromEntries(["workspace", "agent", "model", "effort", "branch", "base", "launch", "back"].map((field) => [field, { focus() {}, is_focused: () => field === "base" }]));
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
const inputCx = { ...initCx, notify() { notifications++; }, bind_keys(keys) { bindings.push(...keys); }, timer: { every() {}, after(ms, fn) {
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

let focusedField;
const branchView = new main.namespace.default();
const branchCx = { ...initCx, notify() {} };
branchView.init({}, branchCx);
Object.assign(branchView, {
  repo: { root, base: "main" }, selections: { claude: {} }, agent: "claude", view: "new",
  names: { names: ["develop", "feat/search", "feat/settings", "main"], local: new Set(["develop", "feat/search", "feat/settings", "main"]), remote: new Set() },
  saveDraft() {}, savePrefs() {},
});
assert(!branchView.fields().includes("launch"), "Skip disabled Start when the task is empty");
branchView.prompt.set_value("Fix this");
branchView.prompt.emit("change", branchCx);
branchView.choiceHandles = Object.fromEntries(["workspace", "agent", "model", "effort", "branch", "base", "launch", "back"].map((f) => [f, {
  focus() { focusedField = f; }, is_focused: () => focusedField === f,
}]));
branchView.branch.focus = () => { focusedField = "branch-input"; };
branchView.prompt.focus = () => { focusedField = "prompt-input"; };
branchView.setField(branchView.fields().indexOf("branch"));
branchView.branch.set_value("FEAT/S");
branchView.branch.emit("change", branchCx);
assert.equal(branchView.dropdown, "branch", "Typing opens the existing-branch list");
assert.equal(focusedField, "branch-input", "Typing keeps focus in the editable input");
assert.deepEqual(Array.from(branchView.choiceOptions("branch"), (o) => o.value), ["feat/search", "feat/settings"]);
assert.equal(branchView.choiceAt, -1, "Do not select a suggestion merely because it matches");
branchView.branchKey("enter", branchCx);
assert.equal(branchView.branch.value(), "FEAT/S", "Enter without a highlight keeps the typed name");
branchView.branchKey("down", branchCx);
assert.equal(branchView.choiceAt, 0);
assert.equal(branchView.branch.value(), "FEAT/S", "Browsing does not replace the typed name");
branchView.branchKey("down", branchCx);
branchView.branchKey("enter", branchCx);
assert.equal(branchView.branch.value(), "feat/settings", "Enter accepts the highlighted branch");
assert.equal(branchView.dropdown, null);
assert.equal(focusedField, "branch-input", "Selection returns to the same editable input");
branchView.branch.emit("change", branchCx);
assert.equal(branchView.dropdown, null, "A selected value's change event must not reopen its popup");
branchView.pickChoice("branch", "develop", branchCx);
assert.equal(branchView.branch.value(), "develop", "Pointer selection uses the same existing-branch selection path");
branchView.showChoice("branch", true, branchCx);
assert.equal(branchView.branch.value(), "develop", "Reopening must not clear the input");
branchView.branch.set_value("fix/new-name");
branchView.branch.emit("change", branchCx);
assert.equal(branchView.choiceOptions("branch").length, 0);
branchView.branchKey("down", branchCx);
branchView.branchKey("enter", branchCx);
assert.equal(branchView.branch.value(), "fix/new-name", "A new name remains valid with no matching suggestions");
branchView.escape(branchCx);
assert.equal(branchView.dropdown, null);
assert.equal(branchView.view, "new", "Escape dismisses the branch popup before leaving the form");
assert.equal(branchView.branch.value(), "fix/new-name", "Escape preserves free input");
branchView.branchKey("enter", branchCx);
assert.equal(branchView.dropdown, null, "Enter on a closed branch input does not open or launch anything");
branchView.branch.set_value("feat/s");
branchView.branch.emit("change", branchCx);
branchView.branchKey("down", branchCx);
branchView.tab(1, branchCx);
assert.equal(branchView.branch.value(), "feat/s", "Tab must not accept the highlighted branch");
assert.equal(branchView.dropdown, null);
assert.equal(focusedField, "base");
branchView.tab(1, branchCx);
assert.equal(focusedField, "back");
branchView.tab(-1, branchCx);
assert.equal(focusedField, "base");
branchView.setField(branchView.fields().indexOf("launch"));
assert.equal(focusedField, "launch", "Start is a keyboard stop");
branchView.tab(1, branchCx);
assert.equal(focusedField, "branch-input", "Tab follows the visible order from Start to Branch");
branchView.branch.set_value("");
branchView.branch.emit("change", branchCx);
assert.equal(branchView.choiceOptions("branch").length, 4, "An empty input shows all existing branches");
branchView.branchKey("up", branchCx);
assert.equal(branchView.choiceAt, 3, "Up from the input starts at the last suggestion");
branchView.tab(1, branchCx);
assert.equal(branchView.branch.value(), "", "Leaving Branch empty preserves automatic naming");
assert(!bindings.some((b) => b.keystroke === "end"), "End retains its native cursor behavior");
let launchSpec;
branchView.prompt.set_value("Fix this");
branchView.base.set_value("main");
branchView.launch = (spec) => { launchSpec = spec; };
branchView.submitNew(branchCx);
assert.equal(launchSpec.branch, "", "Submit keeps the automatic-naming path");
branchView.branch.set_value("fix/custom");
branchView.submitNew(branchCx);
assert.equal(launchSpec.branch, "fix/custom", "Submit accepts a new branch name without selecting an option");
branchView.ui({}).button("launch", "Start", "Ctrl ↵", (cx) => branchView.submitNew(cx), "primary");
assert.equal(buttons.get("btn-launch").track_focus[0], branchView.choiceHandles.launch, "Start uses a native button with the form's focus handle");
assert.equal(buttons.get("btn-launch").disabled[0], false);
launchSpec = null;
buttons.get("btn-launch").on_click[0]({}, branchCx);
assert.equal(launchSpec.branch, "fix/custom", "The native Start button keeps the existing submit path");
branchView.formActions(branchView.ui({}));
assert.equal(buttons.get("btn-back").track_focus[0], branchView.choiceHandles.back, "Back uses a native keyboard-operable button too");
branchView.base.set_value("missing");
launchSpec = null;
branchView.submitNew(branchCx);
assert.equal(launchSpec, null, "Base must still be an existing branch");
assert.match(branchView.message, /existing base branch/);
console.log("Editable branch: matching, free input, explicit selection, cancellation, automatic naming, and action-button Tab stops passed.");

await launch(false, false, "", "origin");
assert.deepEqual(Array.from(jobs[0].argv), ["wt", "switch", "--create", "fix/test", "--base", "refs/remotes/origin/fix/test", "--yes", "--no-cd"]);
assert(gitCalls.some((c) => c.args.includes("--set-upstream-to=refs/remotes/origin/fix/test")), "Set the upstream to the selected remote, not Git's guessed remote");
assert(gitCalls.some((c) => c.args[0] === "config" && c.args[1] === "branch.fix/test.gh-merge-base" && c.args[2] === "fix/test"), "Keep forge branch names separate from exact Git base refs");
console.log("Remote checkout: explicit creation, exact remote base, and explicit upstream passed.");

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Graph Test", GIT_AUTHOR_EMAIL: "graph@example.invalid", GIT_COMMITTER_NAME: "Graph Test", GIT_COMMITTER_EMAIL: "graph@example.invalid" };
fixtureRoot = await mkdtemp("/tmp/opencode/herdr-graph-");
const fixtureGit = (...args) => {
  const r = spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8", env: gitEnv });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
try {
  fixtureGit("init", "--initial-branch=main");
  await writeFile(`${fixtureRoot}/readme.txt`, "root\n");
  fixtureGit("add", "."); fixtureGit("commit", "-m", "root");
  const a = fixtureGit("rev-parse", "HEAD");
  fixtureGit("checkout", "-b", "topic");
  await writeFile(`${fixtureRoot}/feature.txt`, "feature\n");
  fixtureGit("add", "."); fixtureGit("commit", "-m", "feature");
  const b = fixtureGit("rev-parse", "HEAD");
  fixtureGit("checkout", "main");
  await writeFile(`${fixtureRoot}/main.txt`, "main\n");
  fixtureGit("add", "."); fixtureGit("commit", "-m", "main work");
  const c = fixtureGit("rev-parse", "HEAD");
  fixtureGit("merge", "--no-ff", "topic", "-m", "merge topic");
  const m = fixtureGit("rev-parse", "HEAD");
  fixtureGit("branch", "feature", b);
  fixtureGit("update-ref", "refs/remotes/origin/feature", c);
  fixtureGit("update-ref", "refs/remotes/backup/feature", a);
  fixtureGit("update-ref", "refs/remotes/origin/main", m);
  fixtureGit("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  fixtureGit("config", "remote.origin.url", "https://example.invalid/repo");
  fixtureGit("config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
  fixtureGit("branch", "--set-upstream-to=refs/remotes/origin/main", "main");
  const tree = fixtureGit("rev-parse", "HEAD^{tree}");
  const detached = fixtureGit("commit-tree", tree, "-m", "detached checkout");
  fixtureItems = [
    { branch: "main", head: { sha: m }, upstream: { remote: "origin", branch: "main" }, worktree: { path: fixtureRoot, main: true, changes: { modified: true } } },
    { branch: "feature", head: { sha: b } },
    { head: { sha: detached }, worktree: { path: `${fixtureRoot}/detached`, detached: true } },
  ];
  const { rowKey, rowName, rowRef, loadRows, loadBranches } = data.namespace;
  const refs = await loadRows(fixtureRoot, false);
  assert(!refs.error);
  assert.equal(refs.rows.length, 7, "Supplement wt's omitted local and remote refs, while keeping detached worktrees");
  assert.equal(refs.rows.find((r) => r.remote === "origin" && r.branch === "feature").sha, c);
  assert.equal(refs.rows.find((r) => r.remote === "backup").sha, a);
  assert(!refs.rows.some((r) => r.branch === "HEAD"), "The symbolic remote HEAD is not an extra branch");
  assert.equal(new Set(refs.rows.map(rowKey)).size, refs.rows.length);
  const names = await loadBranches(fixtureRoot);
  assert(names.names.includes("refs/remotes/origin/feature"));
  assert(names.names.includes("refs/remotes/backup/feature"));
  assert(names.names.includes("feature"));
  fixtureGit("remote", "add", "team/upstream", "https://example.invalid/other");
  fixtureGit("update-ref", "refs/remotes/team/upstream/main", m);
  const slashRemote = await loadRows(fixtureRoot, false);
  assert(slashRemote.rows.some((r) => r.remote === "team/upstream" && r.branch === "main"), "Remote names containing slashes retain their exact identity");
  assert(!(await loadBranches(fixtureRoot)).remote.has("upstream/main"));
  assert.equal(rowName(refs.rows.find((r) => r.remote === "origin" && r.branch === "feature")), "origin/feature");
  assert.notEqual(rowKey({ branch: "main", path: "/one" }), rowKey({ branch: "main", path: "/two" }), "Multiple worktrees on one branch have distinct list keys");

  const full = await history.namespace.history(fixtureRoot, [m], 0, 100);
  assert.equal(full.commits.length, 4);
  const page1 = await history.namespace.history(fixtureRoot, [m], 0, 2);
  const page2 = await history.namespace.history(fixtureRoot, [m], 2, 2);
  assert(page1.more); assert(!page2.more);
  assert.deepEqual(Array.from([...page1.commits, ...page2.commits], (x) => x.sha), Array.from(full.commits, (x) => x.sha), "Snapshot pagination has no duplicates or gaps");
  const chain = history.namespace.firstParents(full.commits, m);
  assert(chain.has(m) && chain.has(c) && chain.has(a));
  assert(!chain.has(b), "First-parent highlighting excludes merged-in side history");
  const geometry = history.namespace.layout(full.commits);
  assert(!geometry.rows[0].edges.some((e) => e.start === 0), "A branch tip has no invented incoming edge");
  for (const [index, row] of geometry.rows.entries()) {
    const outgoing = row.edges.filter((e) => e.source);
    assert.equal(outgoing.length, row.parents.length, "Draw every merge parent");
    for (const edge of outgoing) {
      const end = geometry.rows.findIndex((r) => r.sha === edge.target);
      assert(end > index);
      assert.equal(geometry.rows[end].lane, edge.to, "Edges reach their real parent node");
      for (const passing of geometry.rows.slice(index + 1, end)) assert(passing.edges.some((e) => !e.source && e.from === edge.to && e.to === edge.to && e.target === edge.target), "A continuing lane stays connected through intervening rows");
    }
  }
  const octopus = history.namespace.layout([{ sha: "f".repeat(40), parents: [m, b, detached] }, ...full.commits, { sha: detached, parents: [] }]);
  assert.equal(octopus.rows[0].edges.filter((e) => e.source).length, 3, "Octopus merges draw all parents");
  const rootDetails = await history.namespace.commitDetails(fixtureRoot, a);
  assert.match(rootDetails.files, /readme\.txt/);
  const mergeDetails = await history.namespace.commitDetails(fixtureRoot, m);
  assert.match(mergeDetails.files, /feature\.txt/);
  assert.equal(mergeDetails.message, "merge topic");
  await assert.rejects(history.namespace.history(fixtureRoot, ["--all"]), /valid commit ID/);
  await writeFile(`${fixtureRoot}/.git/shallow`, `${m}\n`);
  const shallow = await history.namespace.history(fixtureRoot, [m]);
  assert.equal(shallow.commits.length, 1);
  assert.equal(shallow.commits[0].parents.length, 0, "Shallow boundaries do not invent unavailable parents");
  await rm(`${fixtureRoot}/.git/shallow`);

  const tasks = [], polling = [];
  let focusedHandle, scrollTarget;
  const graphCx = {
    notify() {}, bind_keys() {},
    focus_handle() { const h = { focus() { focusedHandle = h; }, is_focused() { return focusedHandle === h; } }; return h; },
    timer: { every(_ms, fn) { polling.push(fn); }, after(_ms, fn) { return { cancel() {}, fn }; } },
    spawn(fn) { const task = Promise.resolve().then(() => fn(graphCx)); tasks.push(task); return task; },
  };
  const settle = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  let selectedRef;
  const g = new graph.namespace.Graph(graphCx, (key) => { selectedRef = key; });
  g.scroll = { scroll_to_item(index, strategy) { scrollTarget = [index, strategy]; } };
  const mainRef = refs.rows.find((r) => r.branch === "main" && !r.remote);
  g.configure(fixtureRoot, refs.rows, mainRef, graphCx, true);
  await settle();
  assert.equal(g.rows.length, 5, "Unreferenced detached worktree HEADs are graph roots too");
  assert.equal(g.rows[scrollTarget[0]].sha, m);
  assert.equal(scrollTarget[1], "center");
  assert.equal(g.labels(m).filter((l) => l.ref).length, 2, "Combine the local label and matching upstream only at the same commit");
  assert(g.labels(m)[0].width < 100, "Short branch badges do not stretch to fill the label column");
  const oldScroll = scrollTarget;
  g.configure(fixtureRoot, refs.rows, mainRef, graphCx, false);
  assert.equal(scrollTarget, oldScroll, "A badge refresh does not reset manual scrolling");
  g.pressRefs = g.refs; g.pressSelected = g.selected;
  g.pressX = g.width + g.labels(m)[0].width + 1;
  g.click(m, graphCx);
  assert.equal(selectedRef, rowKey(refs.rows.find((r) => rowRef(r) === "refs/remotes/origin/main")), "Clicking the remote label selects that exact remote row");
  const remote = refs.rows.find((r) => rowRef(r) === "refs/remotes/origin/feature");
  g.configure(fixtureRoot, [remote], remote, graphCx, true);
  await settle();
  assert.deepEqual(new Set(g.rows.map((r) => r.sha)), new Set([c, a]), "Search retains matching-ref ancestry but excludes unrelated history");
  assert.equal(g.refsAt(m).length, 0, "Excluded ref labels stay hidden");
  g.inspect(c, graphCx); await settle();
  assert.equal(g.details.message, "main work");
  g.handle.focus();
  calls = [];
  g.key("j", graphCx); g.key("enter", graphCx); await settle();
  assert.equal(calls.length, 0, "Graph keyboard navigation and inspection never run a checkout or space command");

  const t = Object.fromEntries(["background", "accent", "border", "selected", "hover", "foreground", "muted", "dim", "raised", "ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6"].map((key) => [key, "#abcdef"]));
  g.configure(fixtureRoot, refs.rows, mainRef, graphCx, true); await settle();
  text.length = 0; icons.length = 0;
  g.render(t);
  deferred = true;
  lists.get("wt-graph-rows").render({ start: 0, end: g.rows.length });
  deferred = false;
  assert(icons.includes("mods/worktrees/pencil.svg"));
  assert(icons.includes("mods/workspace-chrome/branch.svg"));
  assert(icons.includes("mods/workspace-chrome/server.svg"), "Local and remote labels have distinct icons");
  assert(!text.some((s) => /edited|opencode|claude|▣/.test(s)), "The graph uses a pencil, not edited text, agent status or a square marker");
  assert(!text.some((s) => /Selected:|Reveal selected|More history below|Load more|^\d+ commits/.test(s)), "Do not render permanent graph header or pagination information");
  assert(!buttons.has("wt-reveal") && !buttons.has("wt-graph-more"), "No reveal or manual load-more buttons");

  const popup = new main.namespace.default();
  popup.init({}, { ...graphCx, spawn() {} });
  Object.assign(popup, { repo: { root: fixtureRoot, top: fixtureRoot }, rows: refs.rows, names, def: "main", view: "list", preview: 0, loadPreview() {} });
  popup.cursor = refs.rows.indexOf(remote);
  let opened, launched;
  popup.openNew = (_cx, fromRemote) => { opened = fromRemote; };
  popup.launch = (spec) => { launched = spec; };
  popup.open(graphCx);
  assert.equal(opened, true, "A colliding remote ref opens New from remote instead of opening the local branch");
  assert(!launched);
  const onlyRemote = refs.rows.find((r) => r.remote === "backup");
  popup.names = { ...names, local: new Set() };
  popup.cursor = refs.rows.indexOf(onlyRemote);
  popup.open(graphCx);
  assert.equal(launched.base, "refs/remotes/backup/feature");
  assert.equal(launched.remote, "backup", "Same-named refs on different remotes remain exact targets");
  popup.names = names;
  text.length = 0; icons.length = 0;
  popup.header(t, popup.ui(t));
  assert(text.includes("Esc"), "Use the same Esc close indicator as the other dialogs");
  assert(!text.some((s) => /^\d+ of \d+$/.test(s)), "Do not show the branch counter beside the close control");
  assert(!icons.includes("mods/workspace-chrome/x.svg"));
  let escaped = 0;
  const escape = popup.escape;
  popup.escape = () => escaped++;
  buttons.get("wt-close").on_click[0]({}, graphCx);
  assert.equal(escaped, 1, "Clicking Esc uses the same action as the Escape key");
  popup.escape = escape;
  Object.assign(popup, { selections: { claude: {} }, agent: "claude", saveDraft() {} });
  popup.cursor = refs.rows.indexOf(remote);
  main.namespace.default.prototype.openNew.call(popup, graphCx, true);
  assert.equal(popup.base.value(), "refs/remotes/origin/feature");
  assert.equal(popup.branch.value(), "feature-2");
  popup.prompt.set_value("Work from the remote tip");
  popup.submitNew(graphCx);
  assert.equal(launched.createFromBase, true, "A New from remote form cannot silently reuse a newly colliding local worktree");
  popup.branch.set_value("feature");
  launched = null;
  popup.submitNew(graphCx);
  assert(!launched);
  assert.match(popup.message, /unused local branch/);
  popup.view = "list";
  popup.filter.set_value("origin/feature");
  assert.deepEqual(Array.from(popup.visible(), rowName), ["origin/feature"], "Search includes the remote prefix");
  popup.filter.set_value(""); popup.cursor = 0;
  let openedOnClick = 0;
  popup.open = () => openedOnClick++;
  popup.listView(t, popup.ui(t));
  const click = lists.get("wt-rows").on_item_click[0];
  click(rowKey(refs.rows[0]), graphCx); click(rowKey(refs.rows[0]), graphCx);
  assert.equal(openedOnClick, 0, "Repeated single clicks only select");
  popup.graph.handle.focus(); popup.tabKey(1, graphCx);
  assert(popup.handle.is_focused(), "Tab wraps from graph to list when details are closed");
  popup.graph.details = { sha: m }; popup.graph.handle.focus(); popup.tabKey(1, graphCx);
  assert(popup.graph.detailsHandle.is_focused(), "Tab reaches open commit details");
  popup.graph.detailsHandle.focus(); popup.tabKey(-1, graphCx);
  assert(popup.graph.handle.is_focused());
  popup.rows[0].pr = 123;
  popup.setRows("main", popup.rows.map((r) => ({ ...r, pr: 0 })));
  assert.equal(popup.rows[0].pr, 123, "Local-only polling keeps forge metadata already loaded");
  g.inspect(m, graphCx); await settle();
  g.detailsHandle.focus();
  let detailAt;
  g.detailsScroll = { scroll_to_item(index) { detailAt = index; } };
  g.key("end", graphCx);
  assert.equal(detailAt, g.detailLines().length - 1, "Commit details can be scrolled with the keyboard");
  testPanes = [{ pane: "busy-pane", tab: "busy-tab", cwd: fixtureRoot }];
  testSpaces = [{ id: "busy-space", tabs: [{ id: "busy-tab" }] }]; testAgents = [{ pane: "busy-pane", status: "working", app: "opencode" }];
  const attached = data.namespace.attach(refs.rows.map((r) => ({ ...r, spaces: [] })));
  assert(attached.find((r) => r.path === fixtureRoot).busy, "Hiding agent badges does not remove busy-agent safety checks");
  testAgents = [];

  let longTip = m;
  for (let i = 0; i < 310; i++) longTip = fixtureGit("commit-tree", tree, "-p", longTip, "-m", `history ${i}`);
  const longRefs = [{ branch: "long", sha: longTip }, { branch: "old", sha: a }];
  const autoPoll = polling.length;
  const automatic = new graph.namespace.Graph(graphCx, () => {});
  automatic.configure(fixtureRoot, [longRefs[0]], longRefs[0], graphCx, true);
  await settle();
  assert.equal(automatic.rows.length, history.namespace.PAGE);
  automatic.render(t);
  lists.get("wt-graph-rows").render({ start: 0, end: 20 });
  polling[autoPoll](graphCx); await settle();
  assert.equal(automatic.rows.length, history.namespace.PAGE, "Do not load older history before scrolling near the bottom");
  lists.get("wt-graph-rows").render({ start: history.namespace.PAGE - 10, end: history.namespace.PAGE });
  polling[autoPoll](graphCx); await settle();
  assert(automatic.rows.length > history.namespace.PAGE, "Scrolling to the bottom loads the next page without a button");
  g.configure(fixtureRoot, longRefs, longRefs[1], graphCx, true);
  await settle();
  assert(g.rows.length > history.namespace.PAGE, "Selecting an old tip automatically loads beyond the first page");
  assert.equal(g.rows[scrollTarget[0]].sha, a);
  let release;
  historyGate = new Promise((resolve) => { release = resolve; });
  g.configure(fixtureRoot, [longRefs[0]], longRefs[0], graphCx, true);
  g.cancel(graphCx);
  release(); await settle(); historyGate = null;
  assert.equal(g.rows.length, 0, "Cancelled responses cannot replace the graph");
  assert(!g.loading);
  g.reveal(graphCx); await settle();
  assert(g.rows.length > 0, "Reveal can resume after cancellation");
  g.configure(fixtureRoot, [], null, graphCx, true); await settle();
  assert.equal(g.rows.length, 0); assert(!g.more); assert(!g.loading);
  assert.equal(g.refs.length, 0, "A no-match search empties both graph roots and labels");
  const fetchPopup = new main.namespace.default();
  fetchPopup.repo = { root };
  fetchPopup.reload = async () => {};
  const beforeFetch = gitCalls.filter((call) => call.args[0] === "fetch").length;
  fetchPopup.fetchAll(graphCx); fetchPopup.fetchAll(graphCx); await settle();
  const fetches = gitCalls.filter((call) => call.args[0] === "fetch");
  assert.equal(fetches.length, beforeFetch + 1, "Ignore repeated Fetch presses while one fetch runs");
  assert.deepEqual(Array.from(fetches.at(-1).args), ["fetch", "--all", "--no-prune", "--no-prune-tags"]);
  gitCalls.length = 0;
  g.configure(fixtureRoot, refs.rows, mainRef, graphCx, true, "server"); await settle();
  g.inspect(m, graphCx); await settle();
  await data.namespace.loadPreview(fixtureRoot, "main", refs.rows.find((r) => r.branch === "feature" && !r.remote), 1, "server");
  await data.namespace.loadPreview(fixtureRoot, "main", mainRef, 2, "server");
  await data.namespace.lastFetch(fixtureRoot, "server");
  assert(gitCalls.length && gitCalls.every((c) => c.on === "server"), "History, commit details, both previews and fetch time stay on the target machine");
  assert.equal(g.details.message, "merge topic");
  await assert.rejects(history.namespace.commitDetails(fixtureRoot, "not-a-sha"), /Invalid commit ID/);
  console.log("Graph: real Git refs, merges, first-parent lanes, pagination, detached and shallow history, details, filtering, reverse selection, cancellation, keyboard focus, clean badges, and busy protection passed.");
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
  fixtureRoot = null;
}
