// Run: node --experimental-vm-modules config/herdr-app/tests/spaces.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Keep the element tree so tests exercise row rendering and event handlers too.
function element(kind) {
  const node = { kind, children: [], attrs: {}, handlers: {} };
  const proxy = new Proxy(node, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === "child") node.children.push(args[0]);
      else if (key === "children") node.children.push(...args[0]);
      else if (key === "when") { if (args[0]) args[1](proxy); }
      else if (key.startsWith("on_")) node.handlers[`${key}:${typeof args[0] === "string" ? args[0] : ""}`] = args.at(-1);
      else node.attrs[key] = args[0];
      return proxy;
    };
  } });
  return proxy;
}
const text = node => typeof node === "string" ? node : (node?.children ?? []).map(text).join(" | ");
const nodes = node => typeof node === "object" && node ? [node, ...node.children.flatMap(nodes)] : [];
const context = vm.createContext({ console });
const module = values => new vm.SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value);
}, { context });
let sp = [], allAgents = [], calls = [];
const shared = {};
const t = { foreground: "#eeeeee", muted: "#aaaaaa", dim: "#777777", selected: "#333333", hover: "#222222", accent: "#abcdef", blocked: "#ffaaaa", done: "#aaffaa", working: "#aaaaff", idle: "#aaaaaa", unknown: "#777777" };
const kit = module({ View: class {}, div: () => element("div"), svg: path => element(path), image: path => element(path) });
const base = module({ v_flex: () => element("column"), h_flex: () => element("row") });
const herdr = module({
  spaces: () => sp, panes: () => [], agents: () => allAgents, machines: () => [], theme: () => t,
  shared: key => shared[key], setShared: (key, value) => { shared[key] = value; },
  run: (command, args) => calls.push({ command, args }),
  layout: () => ({ id: "sidebar", size: { px: 340 } }),
  openOverlay() {}, exec() {}, hc() {}, watchFolder() {}, window() {},
});
const pr = module({ PullRequests: class {} });
const main = new vm.SourceTextModule(await readFile(new URL("../mods/spaces-pr/main.js", import.meta.url), "utf8"), { context });
await main.link(name => ({ "gpui-kit": kit, "gpui-base": base, herdr, "./pr.js": pr })[name]);
await main.evaluate();
const { activity, default: Spaces } = main.namespace;
const agent = (status, title = status, space = "root") => ({ status, title, space, program: { name: "OpenCode", icon: "icons/opencode.svg", tint: true } });

assert.equal(activity([]).label, "No agents");
for (const [status, label] of [["blocked", "Needs input"], ["done", "Finished"], ["working", "Working"], ["idle", "Idle"], ["unexpected", "Unknown"], ["constructor", "Unknown"]]) {
  assert.equal(activity([agent(status)]).label, label);
}
const list = [agent("working"), agent("idle"), agent("done"), agent("blocked", "Approve database change"), agent("working")];
const mixed = activity(list);
assert.equal(mixed.status, "blocked");
assert.equal(mixed.label, "1 needs input · 1 finished · 2 working · 1 idle");
assert.equal(mixed.agent, list[3]);
assert.equal(list[0].status, "working", "Do not reorder live agent data");
assert.equal(activity(list.filter(a => a.status !== "blocked")).status, "done");
assert.equal(activity(list.filter(a => ["idle", "working"].includes(a.status))).status, "working");
assert.equal(activity([agent("working", "First"), agent("working", "Second")]).agent.title, "First", "Keep equal-priority titles stable");

const view = new Spaces();
Object.assign(view, { pressed: null, over: null, git: {}, unsure: new Set(), prs: { badge: () => element("pr").child("#42") }, shown: new Set(), born: {}, machines: [], reconnecting: {}, folded: new Set() });
const root = { id: "root", name: "Project", folder: "/repo", tabs: [], active: true };
const child = { id: "child", name: "feature/a-very-long-branch-name", folder: "/worktrees/feature", tabs: [], active: false };
const row = (w, g, tree = null) => ({ w, i: w === root ? 0 : 1, g, tree, key: JSON.stringify([null, w.folder]) });
const git = { name: "Project", branch: "main", ahead: 2, behind: 1, repo: "repo", linked: false };
for (const branch of ["main", "master", child.name, "(detached)", null]) {
  const line = view.gitTail({ ...git, branch }, null, child.name, t, element("pr").child("#42"));
  assert(text(line).includes(branch === "(detached)" ? "Detached HEAD" : branch ?? "Branch unknown"));
  assert(text(line).includes("#42"));
  assert(text(line).includes("↑2"));
  assert(text(line).includes("↓1"));
  assert(nodes(line).some(n => "text_ellipsis_middle" in n.attrs), "Keep both ends of long branches");
}
sp = [root, child];
allAgents = list;
let rendered = view.row(row(root, git), t, mixed);
assert(text(rendered).includes("Approve database change"));
assert(text(rendered).includes(mixed.label));
assert(text(rendered).includes("main"));
assert(rendered.attrs.accessibility_label.includes("main"), "Include the branch in the accessible row label");
assert(nodes(rendered).some(n => n.attrs.tooltip === mixed.label), "Full counts stay available on hover");
assert.equal(rendered.attrs.py, 8);
assert(!("h" in rendered.attrs), "Let extra lines set the row height");
const cx = { notify() {} };
rendered.handlers["on_mouse_down:left"]();
rendered.handlers["on_mouse_up:left"]({}, cx);
assert.equal(calls.at(-1).command, "space.select");
assert.equal(calls.at(-1).args.id, root.id);
view.pressed = root.id;
view.over = child.id;
rendered = view.row(row(child, { ...git, branch: child.name }, "└─"), t, activity([]));
rendered.handlers["on_mouse_up:left"]({}, cx);
assert.equal(calls.at(-1).command, "space.move");
assert.equal(calls.at(-1).args.index, 2);
assert(!text(rendered).includes("Untitled agent"), "No task line without an agent");

const missing = row(root, null);
assert(text(view.row(missing, t, activity([]))).includes("Checking Git…"));
view.git[missing.key] = null;
assert(text(view.row(missing, t, activity([]))).includes("No Git repository"));
view.unsure.add(missing.key);
assert(text(view.row(missing, t, activity([]))).includes("Git unavailable"));
assert(text(view.row({ ...missing, w: { ...root, branch: "develop" } }, t, activity([]))).includes("develop"), "Use a known branch before Git details arrive");
assert(text(view.row(row(root, git), t, activity([agent("idle", " ")]))).includes("OpenCode"));
assert.equal(view.compact(row(root, git), t).attrs.h, 26, "Preserve the compact rail");

view.shown = new Set(sp.map(s => s.id));
view.git = { [missing.key]: git, [row(child).key]: { ...git, linked: true, branch: child.name } };
assert.deepEqual(Array.from(view.ordered(), r => [r.w.id, Boolean(r.tree)]), [["root", false], ["child", true]]);
calls = [];
const grouped = view.grouped(t, false);
assert.equal(grouped[0].attrs.id, "space-root");
assert.equal(grouped[1].attrs.id, "space-child");
assert(text(grouped[0]).includes("Approve database change"));
assert(text(grouped[1]).includes("No agents"), "Do not mix agents from different spaces");
allAgents = [agent("done", "Finished task", "child")];
const updated = view.grouped(t, false);
assert.equal(updated[0].attrs.id, "space-root");
assert(text(updated[1]).includes("Finished task"));
assert.equal(calls.length, 0, "Status changes must not move spaces");
const layout = JSON.parse(await readFile(new URL("../layouts/inbox.json", import.meta.url), "utf8"));
assert.equal(layout.children.find(n => n.id === "sidebar").size.px, 340);
console.log("Spaces: status priority/counts, task titles, branches, missing Git, grouping, updates, compact mode, selection and drag passed.");
