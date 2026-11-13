// Worktrees: the Herdr TUI worktree plugin as a native popup. The list of
// worktrees and branches is the home view; n, m and x open the New, Merge and
// Remove views for the selected row. Every view has its buttons at the bottom.
//
// New runs `wt switch` (with the repo's hooks), then opens a space in the checkout.
// Merge and remove run `wt` in a hidden herdr-core terminal; its output shows here.
//
// In the New form, Tab and Shift+Tab go to the next or previous control.
// Choices open with Enter, Space or an arrow; Up/Down select, Enter confirms.

import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex, Button, Combobox, Input, InputState, Popup, Scrollbar, Textarea, TextareaState, VirtualListScrollHandle, v_virtual_list } from "gpui-base";
import { closeOverlay, focused, panes, props, run, settings, shared, spaces, theme } from "herdr";
import {
  AGENT_KINDS, PREVIEW_MODES, agentArgv, attach, branchSlug, detectRepo, generateBranch, git, loadBranches,
  loadConfig, loadOpencodeModels, loadPreview, loadRows, mergeBase, promptCommand, uniqueName,
} from "./data.js";
import { Job } from "./job.js";

const CHOICES = ["workspace", "agent", "model", "effort", "branch", "base"];
const CHOICE_KEYS = ["up", "down", "enter", "escape", "tab", "shift-tab"];
const LABELS = { workspace: "Workspace", prompt: "Task", agent: "Harness", model: "Model", effort: "Effort", branch: "Branch", base: "Base" };
const AGENT_NAMES = { claude: "Claude Code", codex: "Codex", opencode: "OpenCode" };
const ICON = (name) => `mods/workspace-chrome/${name}.svg`;

const store = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};

// A theme color with an alpha (0..1); theme colors are #rrggbb.
function alpha(color, a) {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? "")) return color;
  return color + Math.round(a * 255).toString(16).padStart(2, "0");
}

// Where the popup was asked from: the focused terminal's folder, else the shown space's.
function callerFolder(space) {
  if (!space && props()?.folder) return props().folder;
  const f = focused();
  const s = spaces().find((s) => space ? s.id === space : s.active);
  if (s?.machine) return null;
  if ((!space || f?.space === space) && f?.cwd) return f.cwd;
  const tabs = new Set((s?.tabs ?? []).map((t) => t.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s?.folder || null;
}

// Fuzzy: the query's letters in order.
function fuzzy(s, q) {
  s = s.toLowerCase();
  let i = 0;
  for (const c of s) if (i < q.length && q[i] === c) i++;
  return i === q.length;
}

const rowName = (r) => r.branch || "(detached)";

// Why the row cannot be merged or removed, or "".
function refusal(r, view) {
  if (r.main) return "This is the main checkout.";
  if (r.remote) return `This branch is only on ${r.remote}.`;
  if (view === "merge" && !r.path) return "This branch has no worktree.";
  if (!r.branch) return "This worktree has no branch.";
  if (r.busy) return "An agent is working here.";
  return "";
}

export default class Worktrees extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.view = "list";
    this.rows = [];
    this.def = "";
    this.cursor = 0;
    this.preview = 0;
    this.scroll = 0;
    this.previews = {};
    this.message = "";
    this.ok = false;
    this.cfg = { naming_command: [], agents: {}, opencodeProviders: [] };
    this.names = { local: new Set(), remote: new Set(), names: [] };
    this.repo = undefined; // undefined: looking; null: not a repo
    this.workspace = props()?.space ?? focused()?.space ?? spaces().find((s) => s.active)?.id;
    // OpenCode's providers and models: the last list at once, then the service's.
    this.opencode = store("opencode-models", null);
    this.opencodeError = "";
    this.listScroll = VirtualListScrollHandle.new();
    this.previewScroll = VirtualListScrollHandle.new();
    this.choiceScroll = VirtualListScrollHandle.new();
    this.choiceHandles = Object.fromEntries([...CHOICES, "launch", "back"].map((f) => [f, cx.focus_handle()]));
    this.choiceSearch = InputState.new({ placeholder: "Type to search…" });
    this.choiceSearch.on("change", (_e, cx) => this.filterChoices(cx));
    this.choiceQuery = "";
    this.choiceWidths = {};
    this.dropdown = null;

    this.filter = InputState.new({ placeholder: "Filter branches" });
    this.filter.on("change", (_e, cx) => {
      this.cursor = 0;
      this.loadPreview(cx);
      cx.notify();
    });
    this.filter.on("focus", (_e, cx) => {
      this.filtering = true;
      cx.notify();
    });
    this.filtering = false;

    this.prompt = TextareaState.new({ placeholder: "What should the agent do?" });
    this.promptEmpty = true;
    this.prompt.on("change", (_e, cx) => {
      this.draftSave?.cancel();
      this.draftSave = cx.timer.after(200, () => this.saveDraft());
      const empty = !this.prompt.value().trim();
      if (empty === this.promptEmpty) return;
      this.promptEmpty = empty;
      cx.notify();
    });
    this.branch = InputState.new({ placeholder: "Generated from the task" });
    this.base = InputState.new({});
    this.target = InputState.new({});
    this.base.on("change", (_e, cx) => { this.saveDraft(); cx.notify(); });
    this.branch.on("change", (_e, cx) => {
      this.saveDraft();
      if (this.view === "new" && !this.busy && this.fields()[this.field] === "branch" && this.branch.value() !== this.branchPicked) {
        return this.showChoice("branch", true, cx);
      }
      cx.notify();
    });
    // A click in a text field selects its row in the form.
    for (const [name, s] of [["prompt", this.prompt], ["branch", this.branch]]) {
      s.on("focus", (_e, cx) => {
        if (this.view !== "new") return;
        const i = this.fields().indexOf(name);
        if (i >= 0 && i !== this.field) { this.field = i; cx.notify(); }
      });
    }
    this.field = 0;

    // The text fields keep tab, enter and escape for themselves; these win inside this popup.
    // Tab is also bound outside the text fields, so that GPUI does not move the focus by itself.
    cx.bind_keys([
      ...["tab", "shift-tab", "enter", "escape"].map((keystroke) => ({
        keystroke, action: `wt_${keystroke.replace("-", "_")}`, context: "Worktrees > Input",
      })),
      ...["tab", "shift-tab", "escape"].map((keystroke) => ({
        keystroke, action: `wt_${keystroke.replace("-", "_")}`, context: "Worktrees",
      })),
      { keystroke: "ctrl-enter", action: "wt_launch", context: "Worktrees" },
      ...["enter", "shift-enter"].map((keystroke) => ({ keystroke, action: "wt_newline", context: "WtPrompt > Input" })),
      ...["up", "down", "enter"].map((keystroke) => ({
        keystroke, action: `wt_branch_${keystroke}`, context: "WtBranch > Input",
      })),
      ...["down", "ctrl-n", "ctrl-j"].map((keystroke) => ({ keystroke, action: "wt_down", context: "WtFilter > Input" })),
      ...["up", "ctrl-p", "ctrl-k"].map((keystroke) => ({ keystroke, action: "wt_up", context: "WtFilter > Input" })),
      ...CHOICE_KEYS.map((keystroke) => ({
        keystroke, action: `wt_choice_${keystroke.replace("-", "_")}`, context: "WtChoice > Input",
      })),
    ]);

    this.handle.focus();
    cx.timer.after(600, () => this.view === "list" && !this.filtering && this.handle.focus());
    cx.spawn(async (cx) => {
      this.cfg = await loadConfig();
      this.repo = await detectRepo(props()?.folder ?? callerFolder(this.workspace));
      if (!this.repo) return cx.notify();
      this.names = await loadBranches(this.repo.root);
      this.restoreForm();
      this.refreshOpencode(cx);
      await this.reload(cx);
      // PR numbers need the network: after the first draw.
      const full = await loadRows(this.repo.root, true);
      for (const r of full.rows ?? []) {
        const mine = this.rows.find((m) => m.branch === r.branch && !m.remote && !r.remote);
        if (mine) mine.pr = r.pr;
      }
      cx.notify();
    });
  }

  refreshOpencode(cx) {
    const repo = this.repo;
    cx.spawn(async (cx) => {
      try {
        const models = await loadOpencodeModels(repo.root, this.cfg.opencodeProviders);
        if (this.repo !== repo) return;
        this.opencode = models;
        this.opencodeError = "";
        localStorage.setItem("opencode-models", JSON.stringify(this.opencode));
      } catch (e) {
        if (this.repo !== repo) return;
        this.opencodeError = String(e.message ?? e);
      }
      // The saved choice wins: it may name a model that the cached list did not have.
      if (this.selections) this.selections.opencode = this.validSelection(store("prefs", {}).agents?.opencode ?? this.selections.opencode, "opencode");
      cx.notify();
    });
  }

  async reload(cx) {
    const r = await loadRows(this.repo.root, false);
    if (r.error) this.setMessage(r.error, false);
    else this.setRows(r.def, attach(r.rows));
    this.loadPreview(cx);
    cx.notify();
  }

  // Keeps the selected row when it is still there, else selects the caller's checkout.
  setRows(def, rows) {
    const current = this.current();
    this.def = def;
    this.rows = rows;
    const at = this.visible().findIndex((r) =>
      current ? r.branch === current.branch && r.remote === current.remote : r.path && r.path === this.repo.top);
    this.cursor = Math.max(at, 0);
  }

  setMessage(text, ok) {
    this.message = text;
    this.ok = ok;
  }

  visible() {
    const q = this.filter.value().trim().toLowerCase();
    return q ? this.rows.filter((r) => fuzzy(rowName(r), q)) : this.rows;
  }

  current() {
    const v = this.visible();
    return v.length ? v[Math.min(this.cursor, v.length - 1)] : null;
  }

  close() {
    this.saveDraft();
    closeOverlay(props().overlay);
  }

  // ---------------------------------------------------------------- list

  move(d, cx) {
    const n = this.visible().length;
    this.cursor = Math.min(Math.max(this.cursor + d, 0), Math.max(n - 1, 0));
    this.listScroll.scroll_to_item(this.cursor);
    this.scrollPreview(-Infinity);
    this.loadPreview(cx);
    cx.notify();
  }

  scrollPreview(d) {
    this.scroll = Math.max(this.scroll + d, 0);
    this.previewScroll.scroll_to_item(this.scroll, "top");
  }

  setPreview(mode, cx) {
    this.preview = (mode + PREVIEW_MODES.length) % PREVIEW_MODES.length;
    this.scrollPreview(-Infinity);
    this.loadPreview(cx);
    cx.notify();
  }

  previewKey(r) {
    return JSON.stringify([this.preview, r.path, r.remote, r.branch]);
  }

  loadPreview(cx) {
    const r = this.current();
    if (!r || this.previewKey(r) in this.previews) return;
    const key = this.previewKey(r);
    this.previews[key] = null;
    cx.spawn(async (cx) => {
      this.previews[key] = await loadPreview(this.repo.root, this.def, r, this.preview);
      cx.notify();
    });
  }

  startFilter(cx) {
    this.filtering = true;
    this.filter.focus();
    cx.notify();
  }

  stopFilter(clear, cx) {
    this.filtering = false;
    if (clear) this.filter.set_value("");
    this.handle.focus();
    cx.notify();
  }

  listKey(key, cx) {
    if (!this.repo) return ["escape", "q"].includes(key) && this.close();
    const page = 10;
    switch (key) {
      case "j": case "down": return this.move(1, cx);
      case "k": case "up": return this.move(-1, cx);
      case "g": case "home": return this.move(-this.rows.length, cx);
      case "G": case "end": return this.move(this.rows.length, cx);
      case "ctrl-d": this.scrollPreview(page); return cx.notify();
      case "ctrl-u": this.scrollPreview(-page); return cx.notify();
      case "p": return this.setPreview(this.preview + 1, cx);
      case "/": return this.startFilter(cx);
      case "enter": return this.open(cx);
      case "n": return this.openNew(cx);
      case "m": return this.openAction("merge", cx);
      case "x": case "d": case "X":
        this.removeBranch = key === "X";
        return this.openAction("remove", cx);
      case "q": return this.close();
    }
  }

  open(cx) {
    const r = this.current();
    if (!r) return;
    if (r.path) {
      this.showCheckout(r);
      return this.close();
    }
    this.launch({ branch: r.branch, base: this.def, prompt: "" }, cx);
  }

  // Shows the space of a checkout, or opens one.
  showCheckout(r) {
    if (r.spaces.length) run("space.select", { id: r.spaces[0] });
    else run("space.new", { folder: r.path, machine: "" });
  }

  // ---------------------------------------------------------------- new

  restoreForm() {
    const prefs = store("prefs", { agent: "", agents: {} });
    this.agent = AGENT_KINDS.includes(prefs.agent) ? prefs.agent : AGENT_KINDS[0];
    this.selections = Object.fromEntries(AGENT_KINDS.map((k) => [k, this.validSelection(prefs.agents?.[k] ?? {}, k)]));
    this.base.set_value(this.names.names.includes(this.repo.base) ? this.repo.base : this.names.names[0] ?? "");
    const d = store("draft", null);
    if (!d?.prompt) return;
    this.prompt.set_value(d.prompt);
    this.branch.set_value(d.branch ?? "");
    if (AGENT_KINDS.includes(d.agent)) {
      this.agent = d.agent;
      this.selections[d.agent] = this.validSelection(d, d.agent);
    }
    if (d.base && d.repo === this.repo.root && this.names.names.includes(d.base)) this.base.set_value(d.base);
  }

  // Model option keys include the provider; saved selections keep the native IDs.
  options(field, kind = this.agent, sel = this.selections?.[kind] ?? {}) {
    if (field === "base" || field === "branch") return this.names.names.map((name) => ({ value: name, label: name }));
    if (field === "workspace") {
      const marks = shared("spaces-pr.marks") ?? {};
      return spaces().filter((s) => !s.machine).map((s) => ({ value: s.id, label: s.name, mark: marks[s.id] }));
    }
    if (field === "agent") return AGENT_KINDS.map((k) => ({ value: k, label: AGENT_NAMES[k] ?? k }));
    if (kind === "opencode") {
      const providers = this.opencode ?? [];
      if (field === "model") return providers.flatMap((p) => p.models.map((m) => ({
        value: JSON.stringify([p.id, m.id]), label: m.name, provider: p.id, model: m.id,
        group: providers.length > 1 ? p.name : "",
      })));
      const models = providers.find((p) => p.id === sel.provider)?.models ?? [];
      const variants = models.find((m) => m.id === sel.model)?.variants ?? [];
      return field === "effort" && variants.length ? [{ value: "", label: "Default" }, ...variants.map((v) => ({ value: v, label: v }))] : [];
    }
    const opts = this.cfg.agents[kind] ?? {};
    const list = field === "model" ? opts.models : field === "effort" ? opts.efforts : null;
    return (list ?? []).map((v) => ({ value: v, label: v }));
  }

  choiceValue(field) {
    if (field === "base") return this.base.value().trim();
    if (field === "branch") return this.branch.value().trim();
    if (field === "workspace") return this.workspace;
    if (field === "agent") return this.agent;
    const sel = this.selections[this.agent];
    return field === "model" && this.agent === "opencode" ? JSON.stringify([sel.provider, sel.model]) : sel[field];
  }

  choiceRows(field) {
    const opts = this.choiceOptions(field);
    return opts.flatMap((o, n) => o.group && o.provider !== opts[n - 1]?.provider
      ? [{ value: `group:${o.provider}`, label: o.group, heading: true }, o] : [o]);
  }

  scrollChoice(field) {
    const value = this.choiceOptions(field)[this.choiceAt]?.value;
    this.choiceScroll.scroll_to_item(Math.max(0, this.choiceRows(field).findIndex((o) => !o.heading && o.value === value)));
  }

  choiceOptions(field) {
    const query = this.dropdown === field ? (field === "branch" ? this.branch.value().trim().toLowerCase() : this.choiceQuery) : "";
    return this.options(field).filter((o) => !query || fuzzy(`${o.label} ${o.group ?? ""} ${o.value}`, query));
  }

  filterChoices(cx) {
    this.choiceQuery = this.choiceSearch.value().trim().toLowerCase();
    this.choiceAt = 0;
    if (this.dropdown) this.scrollChoice(this.dropdown);
    cx.notify();
  }

  // Keep a valid provider/model pair and reset effort only if it is not offered.
  validSelection(s, kind) {
    const out = { provider: "" };
    if (kind === "opencode") {
      const models = this.options("model", kind);
      const model = models.find((m) => m.provider === s?.provider && m.model === s?.model)
        ?? models.find((m) => m.provider === s?.provider) ?? models[0];
      out.provider = model?.provider ?? "";
      out.model = model?.model ?? "";
    }
    for (const f of kind === "opencode" ? ["effort"] : ["model", "effort"]) {
      const values = this.options(f, kind, out).map((o) => o.value);
      out[f] = values.includes(s?.[f]) ? s[f] : values[0] ?? "";
    }
    return out;
  }

  // The last agent, and each agent's provider, model and effort: the next form starts there.
  savePrefs() {
    if (!this.selections) return;
    const agents = { ...this.selections };
    // Before OpenCode's list loads, its choice is not known yet: keep the saved one.
    if (!this.opencode) agents.opencode = store("prefs", {}).agents?.opencode ?? agents.opencode;
    localStorage.setItem("prefs", JSON.stringify({ agent: this.agent, agents }));
  }

  saveDraft() {
    if (!this.repo || !this.selections) return;
    const prompt = this.prompt.value();
    if (!prompt.trim()) return localStorage.removeItem("draft");
    const base = this.base.value().trim();
    localStorage.setItem("draft", JSON.stringify({
      agent: this.agent, ...this.selections[this.agent], prompt, branch: this.branch.value().trim(),
      base: base !== this.repo.base ? base : "", repo: this.repo.root,
    }));
  }

  openNew(cx) {
    if (!this.selections) return;
    const r = this.current();
    if (r?.branch && !this.prompt.value().trim()) this.base.set_value(r.branch);
    this.view = "new";
    this.setMessage("", false);
    this.setField(this.fields().indexOf("prompt"));
    cx.notify();
  }

  // Tab follows the composer, then the branch settings below it.
  fields() {
    const shown = (f) => f === "agent" || (this.agent === "opencode" && f === "model") || this.options(f).length > 0;
    return ["workspace", "prompt", ...CHOICES.filter((f) => !["workspace", "branch", "base"].includes(f) && shown(f)), ...(!this.promptEmpty ? ["launch"] : []), "branch", "base", "back"];
  }

  setField(i) {
    this.dropdown = null;
    const fields = this.fields();
    this.field = (i + fields.length) % fields.length;
    const f = fields[this.field];
    if (f === "prompt") this.prompt.focus();
    else if (f === "branch") this.branch.focus();
    else this.choiceHandles[f].focus();
  }

  selectWorkspace(value, cx) {
    if (this.busy) return;
    if (value === this.workspace) return this.showChoice("workspace", false, cx);
    this.dropdown = null;
    this.busy = "Loading workspace…";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const repo = await detectRepo(callerFolder(value));
        if (!repo) throw new Error("This workspace is not a local Git repository.");
        const [names, list] = await Promise.all([loadBranches(repo.root), loadRows(repo.root, false)]);
        if (list.error) throw new Error(list.error);
        this.repo = repo;
        this.names = names;
        this.workspace = value;
        if (!this.selections) this.restoreForm();
        this.view = "new";
        this.rows = [];
        this.previews = {};
        this.filter.set_value("");
        this.setRows(list.def, attach(list.rows));
        this.base.set_value(names.names.includes(repo.base) ? repo.base : names.names[0] ?? "");
        this.saveDraft();
        this.setMessage("", false);
        this.setField(this.fields().indexOf("workspace"));
        this.refreshOpencode(cx);
      } catch (e) {
        this.setMessage(String(e.message ?? e), false);
      }
      this.busy = null;
      cx.notify();
    });
  }

  pickChoice(field, value, cx) {
    if (this.busy) return;
    const option = this.options(field).find((o) => o.value === value);
    if (!option) return;
    if (field === "workspace") return this.selectWorkspace(value, cx);
    if (field === "agent") this.agent = value;
    else if (field === "base") this.base.set_value(value);
    else if (field === "branch") {
      this.branchPicked = value;
      this.branch.set_value(value);
    } else {
      const sel = this.selections[this.agent];
      if (field === "model" && this.agent === "opencode") Object.assign(sel, { provider: option.provider, model: option.model });
      else sel[field] = value;
      this.selections[this.agent] = this.validSelection(sel, this.agent);
    }
    // The fields may change with the agent: keep the cursor on this one.
    this.field = Math.max(this.fields().indexOf(field), 0);
    this.savePrefs();
    this.saveDraft();
    this.dropdown = null;
    (field === "branch" ? this.branch : this.choiceHandles[field]).focus();
  }

  showChoice(field, open, cx) {
    this.field = this.fields().indexOf(field);
    if (field === "branch") {
      this.dropdown = open ? field : null;
      this.choiceAt = -1;
      if (open) this.choiceScroll.scroll_to_item(0);
      this.branch.focus();
      return cx.notify();
    }
    this.dropdown = open && this.options(field).length ? field : null;
    this.choiceQuery = "";
    this.choiceSearch.set_value("");
    const value = this.choiceValue(field);
    this.choiceAt = Math.max(0, this.options(field).findIndex((o) => o.value === value));
    if (this.dropdown) this.scrollChoice(field);
    (this.dropdown ? this.choiceSearch : this.choiceHandles[field]).focus();
    cx.notify();
  }

  choiceKey(key, cx) {
    const field = this.dropdown;
    if (!field) return;
    const opts = this.choiceOptions(field);
    if (key === "escape") this.showChoice(field, false, cx);
    else if (key === "tab" || key === "shift-tab") this.tab(key === "tab" ? 1 : -1, cx);
    else if (key === "enter" || key === "space") this.pickChoice(field, opts[this.choiceAt]?.value, cx);
    else {
      this.choiceAt = key === "home" ? 0 : key === "end" || (key === "up" && this.choiceAt < 0) ? opts.length - 1
        : Math.max(0, Math.min(opts.length - 1, this.choiceAt + (key === "down" ? 1 : -1)));
      this.scrollChoice(field);
    }
    cx.notify();
  }

  tab(step, cx) {
    const focused = this.fields().findIndex((f) => this.choiceHandles[f]?.is_focused());
    this.setField((focused >= 0 ? focused : this.field) + step);
    cx.notify();
  }

  branchKey(key, cx) {
    if (this.busy) return;
    if (this.dropdown !== "branch") {
      if (key === "enter") return;
      this.showChoice("branch", true, cx);
    }
    this.choiceKey(key, cx);
  }

  newKey(key, cx) {
    const f = this.fields()[this.field];
    const choice = CHOICES.includes(f);
    switch (key) {
      case "down": case "up": case "space": case "enter":
        if (choice) return this.showChoice(f, true, cx);
    }
  }

  submitNew(cx) {
    if (this.busy) return;
    const prompt = this.prompt.value();
    const base = this.base.value().trim();
    if (!prompt.trim()) return this.fail("The task is empty.", cx);
    if (!base) return this.fail("The base is empty.", cx);
    if (!this.names.names.includes(base)) return this.fail("Select an existing base branch.", cx);
    const sel = this.selections[this.agent];
    this.savePrefs();
    this.launch({ prompt, base, branch: this.branch.value().trim(), agent: this.agent, sel }, cx);
  }

  fail(text, cx) {
    this.setMessage(text, false);
    cx.notify();
  }

  // Opens the worktree of spec.branch (a new one from spec.base if the branch
  // does not exist; a name from the prompt if it is empty) and starts the agent.
  launch(spec, cx) {
    if (this.busy) return;
    this.busy = spec.prompt && !spec.branch ? "Naming the branch…" : "Starting…";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const taken = (n) => this.names.local.has(n) || this.names.remote.has(n);
        const branch = spec.branch || uniqueName(await generateBranch(this.cfg, spec.prompt), taken);
        const slug = branchSlug(branch);
        const checkout = async () => {
          const list = await git(this.repo.root, ["worktree", "list", "--porcelain"]);
          if (!list.ok) throw new Error(list.err);
          return list.out.split("\n\n").find((b) => b.split("\n").includes(`branch refs/heads/${branch}`))?.match(/^worktree (.*)$/m)?.[1];
        };
        let path = await checkout();
        if (!path) {
          const exists = taken(branch);
          if (!exists) {
            const config = await git(this.repo.root, ["config", `branch.${branch}.gh-merge-base`, spec.base]);
            if (!config.ok) throw new Error(config.err);
          }
          this.busy = "Setting up the worktree…";
          cx.notify();
          const argv = ["wt", "switch", ...(exists ? [branch] : ["--create", branch, "--base", spec.base]), "--yes", "--no-cd"];
          let output = [];
          const code = await Job.run(this.repo.root, argv, (lines) => {
            output = lines;
            this.busy = lines.filter((l) => l.trim()).at(-1) || "Setting up the worktree…";
            cx.notify();
          });
          if (code !== 0) throw new Error(`Worktree setup failed with exit code ${code}. ${output.slice(-10).join("\n")}`);
          path = await checkout();
          if (!path) throw new Error(`No worktree found for ${branch}.`);
        }
        // Start directly in the checkout: a long-lived `wt -x` hides the agent's
        // cwd behind wt's foreground process, so Herdr cannot nest its space.
        const row = this.rows.find((r) => r.path === path) ?? { path, spaces: [] };
        if (!spec.prompt) this.showCheckout(row);
        else {
          const command = await promptCommand(agentArgv(spec.agent, spec.sel), spec.prompt);
          if (row.spaces.length) run("tab.new", { space: row.spaces[0], folder: path, name: slug, argv: command });
          else run("space.new", { folder: path, tab: slug, argv: command, machine: "" });
        }
        if (spec.prompt) {
          localStorage.removeItem("draft");
          this.prompt.set_value("");
          this.branch.set_value("");
        }
        this.busy = null;
        this.close();
      } catch (e) {
        this.busy = null;
        this.fail(String(e.message ?? e), cx);
      }
    });
  }

  // ---------------------------------------------------------------- merge, remove

  openAction(view, cx) {
    const r = this.current();
    if (!r) return;
    Object.assign(this, { view, sel: r, out: [], running: false, failed: false });
    this.setMessage("", false);
    if (view === "merge" && !refusal(r, view)) {
      this.target.set_value("");
      cx.spawn(async (cx) => {
        this.target.set_value((await mergeBase(this.repo.root, r.branch)) || this.def);
        this.target.focus();
        cx.notify();
      });
    } else this.handle.focus();
    cx.notify();
  }

  confirm(cx) {
    const r = this.sel;
    if (this.running || refusal(r, this.view)) return;
    let argv, cwd;
    if (this.view === "merge") {
      const target = this.target.value().trim();
      if (!target) return this.fail("The target is empty.", cx);
      [argv, cwd] = [["wt", "-C", r.path, "merge", target, "--yes"], r.path];
    } else {
      argv = ["wt", "-C", this.repo.root, "remove", r.branch, "--yes", "--foreground"];
      if (r.dirty) argv.push("--force");
      if (this.removeBranch || (!r.path && !r.remote && !r.merged)) argv.push("--force-delete");
      cwd = this.repo.root;
    }
    this.running = true;
    this.handle.focus();
    cx.notify();
    cx.spawn(async (cx) => {
      let code = 1;
      try {
        code = await Job.run(cwd, argv, (lines) => { this.out = lines; cx.notify(); });
      } catch (e) {
        this.out.push(String(e.message ?? e));
      }
      this.running = false;
      if (code !== 0) {
        this.failed = true;
        return this.fail(`wt failed with exit code ${code}.`, cx);
      }
      this.finished(cx);
    });
  }

  // After a merge, and after the removal of the caller's checkout, the main
  // checkout is shown and the popup closes. Another removal goes back to the list.
  finished(cx) {
    const r = this.sel;
    const focusMain = this.view === "merge" || (r.path && r.path === this.repo.top);
    if (focusMain) this.showCheckout(this.rows.find((m) => m.main) ?? { path: this.repo.root, spaces: [] });
    for (const id of r.spaces) run("space.close", { id, confirmed: true });
    if (focusMain) return this.close();
    this.back(cx);
    this.setMessage(`Removed ${rowName(r)}`, true);
  }

  back(cx) {
    if (this.busy || this.running) return;
    if (this.view === "new") this.saveDraft();
    this.view = "list";
    this.failed = false;
    this.setMessage("", false);
    this.handle.focus();
    cx.spawn(async (cx) => this.reload(cx));
    cx.notify();
  }

  // ---------------------------------------------------------------- keys

  // Keys while no text field has the keyboard. Tab comes as an action.
  key(e, cx) {
    if (!this.handle.is_focused() && !Object.values(this.choiceHandles).some((h) => h.is_focused())) return;
    // A printable key by its character, so G, X and / work on every keyboard layout.
    const m = e.modifiers;
    const typed = e.key_char?.length === 1 && e.key_char > " " && !m.control && !m.alt && !m.platform;
    const key = typed ? e.key_char : e.keystroke;
    if (this.busy || key === "tab" || key === "shift-tab" || key === "escape") return;
    if (this.message && !this.failed) this.message = "";
    const field = this.fields()[this.field];
    if (this.view === "new" && CHOICES.includes(field) && typed && !this.dropdown) {
      this.showChoice(field, true, cx);
      this.choiceSearch.set_value(e.key_char);
      return this.filterChoices(cx);
    }
    if (!this.repo && this.choiceHandles.workspace.is_focused()) return this.newKey(key, cx);
    if (this.view === "list") this.listKey(key, cx);
    else if (this.view === "new") this.newKey(key, cx);
    else if (this.failed) { if (key === "enter") this.back(cx); }
    else if (this.running) return;
    else if (this.view === "remove" && ["enter", "y", "x", "d", "X"].includes(key)) this.confirm(cx);
    else if (this.view === "remove" && key === "n") this.back(cx);
    cx.notify();
  }

  tabKey(step, cx) {
    if (this.busy) return;
    if (this.view === "new") return this.tab(step, cx);
    if (this.view === "list" && !this.filtering) this.setPreview(this.preview + step, cx);
  }

  escape(cx) {
    if (this.busy || this.running) return;
    if (this.dropdown) return this.showChoice(this.dropdown, false, cx);
    if (this.view === "list" && this.filtering) return this.stopFilter(true, cx);
    if (this.view === "list") return this.close();
    this.back(cx);
  }

  enter(cx) {
    if (this.view === "list" && this.filtering) return this.stopFilter(false, cx);
    if (this.view === "merge") return this.failed ? this.back(cx) : this.confirm(cx);
  }

  // ---------------------------------------------------------------- view

  render() {
    const t = theme();
    const ui = this.ui(t);
    let body, actions;
    if (this.repo === undefined) [body, actions] = [this.emptyView(t, "Looking for the repository…", true), [ui.button("close", "Close", "Esc", (cx) => this.close())]];
    else if (!this.repo) [body, actions] = [v_flex().size_full().gap(16)
      .child(div().w(240).child(this.choiceView("workspace", true, t)))
      .child(this.emptyView(t, `Not a Git repository: ${callerFolder(this.workspace) ?? "no folder"}`)),
      [ui.button("close", "Close", "Esc", () => this.close())]];
    else if (this.view === "new") [body, actions] = [this.formView(t, ui), this.formActions(ui)];
    else if (this.view !== "list") [body, actions] = [this.actionView(t, ui), this.actionActions(ui)];
    else [body, actions] = [this.listView(t, ui), this.listActions(ui)];

    return v_flex()
      .id("worktrees")
      .key_context("Worktrees")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .on_action("wt_escape", (_e, cx) => this.escape(cx))
      .on_action("wt_enter", (_e, cx) => this.enter(cx))
      .on_action("wt_launch", (_e, cx) => { if (this.view === "new") this.submitNew(cx); })
      .on_action("wt_newline", () => this.prompt.replace("\n"))
      .on_action("wt_tab", (_e, cx) => this.tabKey(1, cx))
      .on_action("wt_shift_tab", (_e, cx) => this.tabKey(-1, cx))
      .on_action("wt_down", (_e, cx) => this.move(1, cx))
      .on_action("wt_up", (_e, cx) => this.move(-1, cx))
      .when(true, (el) => {
        for (const key of ["up", "down", "enter"]) {
          el = el.on_action(`wt_branch_${key}`, (_e, cx) => this.branchKey(key, cx));
        }
        for (const key of CHOICE_KEYS) {
          el = el.on_action(`wt_choice_${key.replace("-", "_")}`, (_e, cx) => this.choiceKey(key, cx));
        }
        return el;
      })
      .size_full()
      .bg(t.popover)
      .text_size(13)
      .text_color(t.foreground)
      .child(this.header(t, ui))
      .child(v_flex().flex_1().min_h(0).px(20).py(16).child(body))
      .child(this.footer(t, actions));
  }

  // Small parts that every view draws the same way.
  ui(t) {
    const kbd = (text, color = t.dim, bg = alpha(t.foreground, 0.07)) =>
      h_flex().flex_none().px(5).h(18).min_w(18).items_center().justify_center().rounded(4).bg(bg).text_size(10.5).text_color(color).child(text);
    // kind: "primary", "danger" or "" (a plain button).
    const button = (id, label, key, click, kind = "", disabled = false) => {
      const [bg, fg, border] = kind === "primary" ? [t.solid, t.solid_foreground, t.solid]
        : kind === "danger" ? [t.blocked, t.background, t.blocked] : [t.raised, t.foreground, t.border];
      const action = this.view === "new" && ["launch", "back"].includes(id);
      return (action ? Button.new(`btn-${id}`).track_focus(this.choiceHandles[id]).disabled(disabled) : h_flex().id(`btn-${id}`))
        .flex().flex_none().h(32).px(12).gap(8).items_center().rounded(8)
        .border(1).border_color(border).bg(bg).text_color(fg).font_medium().text_size(12.5)
        .when(action && this.choiceHandles[id].is_focused(), (el) => el.border_color(t.accent))
        .when(disabled, (el) => el.opacity(0.45))
        .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => click(cx)))
        .child(label)
        .when(Boolean(key), (el) => el.child(kbd(key, kind ? fg : t.dim, kind ? alpha(t.background, 0.18) : alpha(t.foreground, 0.07))));
    };
    const badge = (text, color, icon) => h_flex().flex_none().h(20).px(7).gap(4).items_center().rounded_full()
      .bg(alpha(color, 0.14)).text_color(color).text_size(11).font_medium()
      .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(11)))
      .child(text);
    return { kbd, button, badge };
  }

  header(t, ui) {
    const title = { list: "Worktrees", new: "New worktree", merge: "Merge worktree", remove: "Remove worktree" }[this.view] ?? "Worktrees";
    const icon = { new: "plus", merge: "git-compare", remove: "archive" }[this.view] ?? "git-branch";
    return h_flex().flex_none().h(60).px(20).gap(12).items_center().border_b(1).border_color(t.border)
      .child(div().flex_none().size(34).rounded(9).bg(alpha(t.accent, 0.16)).flex().items_center().justify_center()
        .child(svg(ICON(icon)).size(17).text_color(t.accent)))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().font_semibold().text_size(14.5).child(title))
        .child(h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
          .when(Boolean(this.repo), (el) => el
            .child(svg(ICON("folder")).size(12))
            .child(div().truncate().child(this.repo.name))
            .child(div().text_color(t.dim).child("·"))
            .child(svg(ICON("branch")).size(12))
            .child(div().truncate().child(this.repo.base)))))
      .when(this.view === "list" && Boolean(this.repo), (el) => el.child(ui.badge(`${this.visible().length} of ${this.rows.length}`, t.muted)))
      .child(div().id("wt-close").flex_none().size(28).rounded(7).flex().items_center().justify_center().cursor_pointer()
        .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => this.close())
        .child(svg(ICON("x")).size(15)));
  }

  footer(t, actions) {
    const text = this.busy || this.message;
    const color = this.busy ? t.muted : this.ok ? t.ansi2 : t.blocked;
    return h_flex().flex_none().h(60).px(20).gap(8).items_center().border_t(1).border_color(t.border).bg(alpha(t.background, 0.35))
      .child(h_flex().flex_1().min_w(0).gap(8).items_center().text_size(12.5).text_color(color)
        .when(Boolean(this.busy), (el) => el.child(svg(ICON("spinner")).size(14).spin(900)))
        .when(Boolean(text) && !this.busy, (el) => el.child(svg(ICON(this.ok ? "circle-check" : "x")).size(14)))
        .child(div().truncate().when(Boolean(text), (el) => el.tooltip(text)).child(text || "")))
      .children(actions);
  }

  emptyView(t, text, loading = false) {
    return v_flex().size_full().items_center().justify_center().gap(10).text_color(loading ? t.muted : t.blocked)
      .child(svg(ICON(loading ? "spinner" : "git-branch")).size(22).when(loading, (el) => el.spin(900)))
      .child(div().child(text));
  }

  // ---------------------------------------------------------------- list view

  listActions(ui) {
    const r = this.current();
    const none = !r;
    return [
      ui.button("remove", "Remove", "x", (cx) => this.openAction("remove", cx), "", none),
      ui.button("merge", "Merge", "m", (cx) => this.openAction("merge", cx), "", none),
      ui.button("new", "New", "n", (cx) => this.openNew(cx)),
      ui.button("open", r && !r.path ? "Check out" : "Open", "↵", (cx) => this.open(cx), "primary", none),
    ];
  }

  listView(t, ui) {
    const rows = this.visible();
    const mono = settings().font_family ?? "JetBrains Mono";
    const search = h_flex().key_context("WtFilter").flex_none().h(34).px(10).gap(8).items_center().rounded(8)
      .border(1).border_color(this.filtering ? t.accent : t.input).bg(t.background)
      .child(svg(ICON("search")).size(14).text_color(t.dim))
      .child(Input.new(this.filter).flex_1().h(30).text_color(t.foreground))
      .when(!this.filtering, (el) => el.child(ui.kbd("/")));
    const list = v_flex().flex_1().min_h(0).relative()
      .child(v_virtual_list("wt-rows", rows.length, 40, (i) => JSON.stringify([rows[i].branch, rows[i].remote]),
        (range) => rows.slice(range.start, range.end).map((r, i) => this.rowView(r, range.start + i === this.cursor, t, ui)))
        .track_scroll(this.listScroll)
        .on_item_click((key, cx) => {
          const i = rows.findIndex((r) => JSON.stringify([r.branch, r.remote]) === key);
          if (this.filtering) this.stopFilter(false, cx);
          if (i === this.cursor) return this.open(cx);
          this.move(i - this.cursor, cx);
        })
        .size_full())
      .child(Scrollbar.vertical("wt-rows").absolute().inset_0());
    const left = v_flex().w("42%").min_w(320).h_full().gap(10).child(search)
      .child(rows.length ? list : v_flex().flex_1().items_center().justify_center().text_color(t.dim)
        .child(this.rows.length ? "No branch matches." : "Loading…"));

    const r = this.current();
    const lines = (r && this.previews[this.previewKey(r)]) ?? null;
    const tabs = h_flex().flex_none().p(3).gap(2).rounded(8).bg(alpha(t.foreground, 0.05)).children(PREVIEW_MODES.map((m, i) =>
      h_flex().id(`wt-mode-${m}`).px(12).h(24).items_center().rounded(6).text_size(12).cursor_pointer()
        .text_color(i === this.preview ? t.foreground : t.muted)
        .when(i === this.preview, (el) => el.bg(t.raised).font_medium())
        .when(i !== this.preview, (el) => el.hover((s) => s.text_color(t.foreground)))
        .on_click((_e, cx) => this.setPreview(i, cx))
        .child(m[0].toUpperCase() + m.slice(1))));
    const code = lines === null
      ? v_flex().flex_1().items_center().justify_center().text_color(t.dim).child(svg(ICON("spinner")).size(18).spin(900))
      : !lines.length
        ? v_flex().flex_1().items_center().justify_center().text_color(t.dim).child(r ? "Nothing to show." : "")
        : div().flex_1().min_h(0).relative().font_family(mono).text_size(11.5)
          .child(v_virtual_list("wt-preview", lines.length, 18, (i) => String(i), (range) => lines.slice(range.start, range.end).map(({ kind, text }) =>
            div().h(18).w_full().px(12).truncate()
              .when(kind === "+", (el) => el.bg(alpha(t.ansi2, 0.08)))
              .when(kind === "-", (el) => el.bg(alpha(t.ansi1, 0.08)))
              .text_color(kind === "+" ? t.ansi2 : kind === "-" ? t.ansi1 : kind === "@" ? t.ansi4 : t.foreground)
              .child(text || " "))).track_scroll(this.previewScroll).size_full())
          .child(Scrollbar.vertical("wt-preview").absolute().inset_0());
    const preview = v_flex().flex_1().min_w(0).h_full().rounded(10).border(1).border_color(t.border).bg(t.background).overflow_hidden()
      .child(h_flex().flex_none().h(44).px(10).gap(10).items_center().border_b(1).border_color(t.border)
        .child(tabs)
        .child(div().flex_1())
        .child(h_flex().gap(6).text_size(11).text_color(t.dim).child(ui.kbd("p")).child("next view")))
      .child(v_flex().flex_1().min_h(0).py(6).child(code));
    return h_flex().size_full().gap(16).child(left).child(preview);
  }

  rowView(r, selected, t, ui) {
    const [icon, tone] = r.main ? ["monitor", t.accent] : r.remote ? ["server", t.dim] : !r.path ? ["branch", t.dim] : ["git-branch", t.accent];
    const sub = r.main ? "main checkout" : r.remote ? `only on ${r.remote}` : !r.path ? "branch, no worktree" : r.spaces.length ? "worktree · open" : "worktree";
    return h_flex().h(40).px(10).gap(10).items_center().rounded(8)
      .when(selected, (el) => el.bg(t.selected))
      .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
      .child(div().flex_none().size(26).rounded(7).bg(alpha(tone, 0.14)).flex().items_center().justify_center()
        .child(svg(ICON(icon)).size(14).text_color(tone)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(13).text_color(r.path || selected ? t.foreground : t.muted).when(selected, (el) => el.font_medium()).child(rowName(r)))
        .child(div().truncate().text_size(11).text_color(t.dim).child(sub)))
      .when(r.ahead > 0, (el) => el.child(ui.badge(`↑${r.ahead}`, t.ansi2)))
      .when(r.behind > 0, (el) => el.child(ui.badge(`↓${r.behind}`, t.ansi1)))
      .when(r.dirty, (el) => el.child(ui.badge("edited", t.ansi3, "square-pen")))
      .when(r.pr > 0, (el) => el.child(ui.badge(`#${r.pr}`, t.ansi5, "git-compare")))
      .when(Boolean(r.agent), (el) => el.child(ui.badge(r.agent, r.busy ? t.working : t.muted, r.busy ? "spinner" : "terminal")));
  }

  // ---------------------------------------------------------------- new view

  formActions(ui) {
    return [ui.button("back", "Back", "Esc", (cx) => this.back(cx))];
  }

  // The kit owns dropdown semantics and focus; the list owns its highlight.
  choiceView(f, on, t) {
    const editable = f === "branch";
    const opts = this.options(f);
    const matches = this.dropdown === f ? this.choiceOptions(f) : [];
    const value = this.choiceValue(f);
    const i = opts.findIndex((o) => o.value === value);
    const loading = this.agent === "opencode" && ["model", "effort"].includes(f) && !this.opencode;
    const label = opts[i]?.label ?? (loading ? (this.opencodeError ? "Unavailable" : "Loading…") : "Default");
    const rows = this.dropdown === f ? this.choiceRows(f) : [];
    const sizes = rows.map((o) => o.heading ? 24 : 32);
    const height = Math.max(32, Math.min(sizes.reduce((sum, h) => sum + h, 0), 256));
    const harnessIcon = (kind) => (kind === "opencode" ? svg(`icons/${kind}.svg`) : image(`icons/${kind}.svg`)).size(15).flex_none();
    const workspaceIcon = (option) => {
      const mark = option?.mark;
      return mark?.color
        ? h_flex().size(18).flex_none().rounded(5).bg(mark.color).items_center().justify_center()
          .text_size(10.5).font_bold().text_color("#ffffff").child(mark.text)
        : svg(mark?.icon ?? ICON("folder")).size(14).flex_none().text_color(t.dim);
    };
    const trigger = h_flex().id(`wt-${f}-value`).w_full().h(32).px(8).gap(6).items_center().rounded(7).border(1)
      .when(editable, (el) => el.key_context("WtBranch"))
      .when(!editable && this.dropdown === f, (el) => el.key_context("WtChoice"))
      .border_color(on ? t.accent : t.border).bg(on ? t.raised : t.background)
      .when(f === "workspace" && !on, (el) => el.border_color("#00000000").bg("#00000000"))
      .on_size_change((size) => { this.choiceWidths[f] = size.width / (settings().zoom || 1); })
      .on_hover((hovered) => { this.choiceOver = hovered ? f : null; })
      .cursor_pointer().hover((s) => s.border_color(t.accent))
      .on_click((_e, cx) => { if (this.dropdown !== f) this.showChoice(f, true, cx); })
      .accessibility_label(`${LABELS[f]}: ${label}`)
      .tooltip(`${LABELS[f]}: ${label}${opts[i]?.group ? ` · ${opts[i].group}` : ""}`)
      .when(f === "agent", (el) => el.child(harnessIcon(value)))
      .when(f === "workspace", (el) => el.child(workspaceIcon(opts[i])))
      .when(editable || this.dropdown === f, (el) => el.child(Input.new(editable ? this.branch : this.choiceSearch).flex_1().min_w(0).h(28).accessibility_label(LABELS[f]).text_color(t.foreground)))
      .when(!editable && this.dropdown !== f, (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(label)))
      .when(editable && i >= 0, (el) => el.child(div().text_size(11).text_color(t.ansi3).child("exists")))
      .when(this.dropdown !== f && Boolean(opts[i]?.group), (el) => el.child(div().max_w(100).truncate().text_size(11).text_color(t.muted).child(opts[i].group)))
      .child(svg(ICON("chevron-down")).size(14).flex_none().text_color(t.muted));
    const list = v_flex().id(`wt-${f}-options`)
      .w(Math.max(this.choiceWidths[f] ?? 300, f === "model" ? 320 : 180)).h(height + 8).mt(4).p(4).rounded(8)
      .bg(t.popover).border(1).border_color(t.border).shadow_lg().role("list_box")
      .on_mouse_down_out((_e, cx) => { if (this.choiceOver !== f) this.showChoice(f, false, cx); })
      .when(!rows.length, (el) => el.child(div().h(32).px(8).py(7).text_color(t.muted).child(editable ? "New branch name" : "No matches")))
      .when(Boolean(rows.length), (el) => el.child(v_virtual_list(`wt-${f}-list`, rows.length, sizes, (n) => rows[n].value, (range) => rows.slice(range.start, range.end).map((o, n) => {
        const at = range.start + n;
        if (o.heading) return div().h(24).px(8).pt(5).text_size(11).font_medium().text_color(t.muted).child(o.label);
        return h_flex().id(`wt-${f}-option-${at}`).h(32).px(8).gap(8).items_center().rounded(4).cursor_pointer()
          .role("list_box_option").aria_selected(o.value === value).accessibility_label(o.group ? `${o.group}: ${o.label}` : o.label)
          .when(o.value === matches[this.choiceAt]?.value, (el) => el.bg(t.selected).aria_active_descendant())
          .hover((s) => s.bg(t.hover))
          .when(f === "agent", (el) => el.child(harnessIcon(o.value)))
          .when(f === "workspace", (el) => el.child(workspaceIcon(o)))
          .child(div().flex_1().truncate().child(o.label))
          .when(o.value === value, (el) => el.child(svg(ICON("check")).size(14).text_color(t.accent)));
      })).on_item_click((value, cx) => { this.pickChoice(f, value, cx); cx.notify(); })
        .track_scroll(this.choiceScroll).w_full().h(height)));
    return Combobox.new(`wt-${f}`).flex_1().min_w(0)
      .open(this.dropdown === f).track_focus(this.choiceHandles[f])
      .on_open_change((open, cx) => this.showChoice(f, open, cx))
      .child(Popup.new(`wt-${f}-popup`, trigger).w_full().when(this.dropdown === f, (el) => el.content(list)));
  }

  formView(t, ui) {
    this.promptEmpty = !this.prompt.value().trim();
    const fields = this.fields();
    const on = (f) => fields[this.field] === f;
    const row = (f, control) => v_flex().flex_1().min_w(0).gap(6)
      .child(div().text_size(11.5).text_color(on(f) ? t.foreground : t.muted).child(LABELS[f]))
      .child(control);
    const choices = fields.filter((f) => CHOICES.includes(f) && !["workspace", "branch", "base"].includes(f));
    const opencodeNote = this.agent === "opencode" && this.opencodeError ? this.opencodeError : "";
    return v_flex().size_full().max_w(900).mx_auto().justify_center().gap(16)
      .child(v_flex().flex_1().min_h(160).max_h(320).rounded(14).border(1).border_color(on("prompt") ? t.accent : t.input).bg(t.background)
        .child(h_flex().flex_none().px(10).pt(10)
          .child(div().w(240).child(this.choiceView("workspace", on("workspace"), t))))
        .child(div().key_context("WtPrompt").flex_1().min_h(0).px(16).py(14)
          .child(Textarea.new(this.prompt).size_full().accessibility_label(LABELS.prompt).text_color(t.foreground)))
        .child(h_flex().flex_none().p(10).gap(8).items_center().children(choices.map((f) =>
          div().flex_1().min_w(0).when(f !== "model", (el) => el.flex_none().w(f === "agent" ? 160 : 120))
            .child(this.choiceView(f, on(f), t))))
          .child(ui.button("launch", "Start", "Ctrl ↵", (cx) => this.submitNew(cx), "primary", Boolean(this.busy) || this.promptEmpty))))
      .when(Boolean(opencodeNote), (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(opencodeNote)))
      .child(h_flex().flex_none().gap(16)
        .child(row("branch", this.choiceView("branch", on("branch"), t)))
        .child(row("base", this.choiceView("base", on("base"), t))));
  }

  // ---------------------------------------------------------------- merge, remove view

  actionActions(ui) {
    if (this.failed) return [ui.button("back", "Back", "↵", (cx) => this.back(cx), "primary")];
    if (this.running) return [];
    if (refusal(this.sel, this.view)) return [ui.button("back", "Back", "Esc", (cx) => this.back(cx))];
    return this.view === "merge"
      ? [ui.button("back", "Cancel", "Esc", (cx) => this.back(cx)), ui.button("merge", "Merge", "↵", (cx) => this.confirm(cx), "primary")]
      : [ui.button("back", "Cancel", "n", (cx) => this.back(cx)), ui.button("remove", this.removeBranch ? "Remove with branch" : "Remove", "↵", (cx) => this.confirm(cx), "danger")];
  }

  actionView(t, ui) {
    const r = this.sel;
    const why = refusal(r, this.view);
    const card = h_flex().flex_none().gap(12).items_center().p(14).rounded(10).border(1).border_color(t.border).bg(t.background)
      .child(div().flex_none().size(34).rounded(9).bg(alpha(t.accent, 0.14)).flex().items_center().justify_center()
        .child(svg(ICON(r.path ? "git-branch" : "branch")).size(17).text_color(t.accent)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_semibold().child(rowName(r)))
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(r.path || (r.remote ? `on ${r.remote}` : "no worktree"))))
      .when(r.ahead > 0, (el) => el.child(ui.badge(`↑${r.ahead}`, t.ansi2)))
      .when(r.behind > 0, (el) => el.child(ui.badge(`↓${r.behind}`, t.ansi1)))
      .when(r.dirty, (el) => el.child(ui.badge("uncommitted", t.ansi3, "square-pen")))
      .when(r.pr > 0, (el) => el.child(ui.badge(`#${r.pr}`, t.ansi5, "git-compare")));
    const notes = [];
    if (why) notes.push([why, t.blocked]);
    else if (this.view === "remove") {
      notes.push([this.removeBranch ? "The worktree and the branch will be removed." : "The worktree will be removed. The branch stays.", t.muted]);
      if (r.dirty) notes.push(["Uncommitted changes will be lost.", t.blocked]);
      if ((!r.path && !r.remote && !r.merged) || (this.removeBranch && !r.merged)) notes.push(["Unmerged commits will be lost.", t.blocked]);
    }
    const note = ([text, color]) => h_flex().flex_none().gap(10).items_center().px(12).py(9).rounded(8).bg(alpha(color, 0.1)).text_color(color)
      .child(svg(ICON(color === t.blocked ? "x" : "circle-check")).size(14).flex_none())
      .child(div().flex_1().child(text));
    return v_flex().size_full().gap(12)
      .child(card)
      .children(notes.map(note))
      .when(this.view === "merge" && !why, (el) => el.child(h_flex().flex_none().gap(14).items_center()
        .child(div().flex_none().w(76).text_size(12.5).text_color(t.muted).child("Into"))
        .child(h_flex().flex_1().h(36).px(10).items_center().rounded(8).border(1).border_color(t.accent).bg(t.background)
          .child(Input.new(this.target).flex_1().h(32).text_color(t.foreground)))))
      .when(this.out.length > 0, (el) => el.child(v_flex().id("wt-out").flex_1().min_h(0).p(12).rounded(10).border(1).border_color(t.border)
        .bg(t.background).overflow_y_scroll()
        .font_family(settings().font_family ?? "JetBrains Mono").text_size(11.5).text_color(t.muted)
        .children(this.out.slice(-300).map((l) => div().truncate().child(l || " ")))));
  }
}
