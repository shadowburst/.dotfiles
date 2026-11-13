// Worktrees: the Herdr TUI worktree plugin as a native popup. The list of
// worktrees and branches is the home view; n, m and x open the New, Merge and
// Remove views for the selected row. Every view has one key line at the bottom.
//
// New launches the agent in a space: `wt switch` (with the repo's hooks) runs
// in the space's terminal and then starts the agent there with the prompt.
// Merge and remove run `wt` in a hidden herdr-core terminal; its output shows here.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, Scrollbar, Textarea, TextareaState, VirtualListScrollHandle, v_virtual_list } from "gpui-base";
import { closeOverlay, focused, panes, props, run, settings, spaces, theme } from "herdr";
import {
  AGENT_KINDS, PREVIEW_MODES, agentArgv, attach, branchSlug, detectRepo, generateBranch, git, loadBranches,
  loadConfig, loadPreview, loadRows, mergeBase, promptCommand, uniqueName,
} from "./data.js";
import { Job } from "./job.js";

const FIELDS = ["prompt", "agent", "model", "effort", "branch", "base"];
const hasModel = (kind) => kind !== "opencode";
const store = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};

// Where the popup was asked from: the focused terminal's folder, else the shown space's.
function callerFolder() {
  if (props()?.folder) return props().folder;
  const f = focused();
  if (f?.cwd) return f.cwd;
  const s = spaces().find((s) => s.active);
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
    this.cfg = { naming_command: [], agents: {} };
    this.names = { local: new Set(), remote: new Set(), names: [] };
    this.repo = undefined; // undefined: looking; null: not a repo
    this.listScroll = VirtualListScrollHandle.new();
    this.previewScroll = VirtualListScrollHandle.new();

    this.filter = InputState.new({ placeholder: "filter" });
    this.filter.on("change", (_e, cx) => {
      this.cursor = 0;
      this.loadPreview(cx);
      cx.notify();
    });
    this.filtering = false;

    this.prompt = TextareaState.new({ placeholder: "Prompt" });
    this.branch = InputState.new({ placeholder: "generated from the prompt" });
    this.base = InputState.new({});
    this.target = InputState.new({});
    for (const s of [this.prompt, this.branch, this.base]) s.on("change", (_e, cx) => { this.saveDraft(); cx.notify(); });
    this.field = 0;

    // The text fields keep tab, enter and escape for themselves; these win inside this popup.
    cx.bind_keys([
      ...["tab", "shift-tab", "enter", "escape"].map((keystroke) => ({
        keystroke, action: `wt_${keystroke.replace("-", "_")}`, context: "Worktrees > Input",
      })),
      { keystroke: "escape", action: "wt_escape", context: "Worktrees" },
      ...["down", "ctrl-n", "ctrl-j"].map((keystroke) => ({ keystroke, action: "wt_down", context: "WtFilter > Input" })),
      ...["up", "ctrl-p", "ctrl-k"].map((keystroke) => ({ keystroke, action: "wt_up", context: "WtFilter > Input" })),
    ]);

    this.handle.focus();
    cx.timer.after(600, () => this.view === "list" && !this.filtering && this.handle.focus());
    cx.spawn(async (cx) => {
      this.cfg = await loadConfig();
      this.repo = await detectRepo(callerFolder());
      if (!this.repo) return cx.notify();
      this.names = await loadBranches(this.repo.root);
      this.restoreForm();
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
      case "p": case "tab":
        this.preview = (this.preview + 1) % PREVIEW_MODES.length;
        this.scrollPreview(-Infinity);
        this.loadPreview(cx);
        return cx.notify();
      case "/":
        this.filtering = true;
        this.filter.focus();
        return cx.notify();
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
    else run("space.new", { folder: r.path });
  }

  // ---------------------------------------------------------------- new

  restoreForm() {
    const prefs = store("prefs", { agent: "", agents: {} });
    this.agent = AGENT_KINDS.includes(prefs.agent) ? prefs.agent : AGENT_KINDS[0];
    this.selections = Object.fromEntries(AGENT_KINDS.map((k) => [k, this.validSelection(prefs.agents?.[k] ?? {}, k)]));
    this.base.set_value(this.repo.base);
    const d = store("draft", null);
    if (!d?.prompt) return;
    this.prompt.set_value(d.prompt);
    this.branch.set_value(d.branch ?? "");
    if (AGENT_KINDS.includes(d.agent)) {
      this.agent = d.agent;
      this.selections[d.agent] = this.validSelection(d, d.agent);
    }
    if (d.base && d.repo === this.repo.root) this.base.set_value(d.base);
  }

  // Replaces values that the config no longer lists.
  validSelection(s, kind) {
    if (!hasModel(kind)) return { model: "", effort: "" };
    const opts = this.cfg.agents[kind] ?? {};
    const pick = (v, list = []) => (list.includes(v) ? v : list[0] ?? "");
    return { model: pick(s.model, opts.models), effort: pick(s.effort, opts.efforts) };
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
    const r = this.current();
    if (r?.branch && !this.prompt.value().trim()) this.base.set_value(r.branch);
    this.view = "new";
    this.setField(0);
    cx.notify();
  }

  fields() {
    return FIELDS.filter((f) => hasModel(this.agent) || (f !== "model" && f !== "effort"));
  }

  setField(i) {
    const fields = this.fields();
    this.field = (i + fields.length) % fields.length;
    const f = fields[this.field];
    if (f === "prompt") this.prompt.focus();
    else if (f === "branch") this.branch.focus();
    else if (f === "base") this.base.focus();
    else this.handle.focus();
  }

  // The first branch that completes a text field, or "".
  completion(state) {
    const v = state.value().trim();
    if (!v) return "";
    return this.names.names.find((n) => n.startsWith(v) && n !== v) ?? "";
  }

  cycle(step) {
    const f = this.fields()[this.field];
    const turn = (v, list = []) => list.length ? list[(list.indexOf(v) + step + list.length) % list.length] : v;
    if (f === "agent") this.agent = turn(this.agent, AGENT_KINDS);
    else if (f === "model" || f === "effort") {
      const opts = this.cfg.agents[this.agent] ?? {};
      const sel = this.selections[this.agent];
      sel[f] = turn(sel[f], f === "model" ? opts.models : opts.efforts);
    }
    this.saveDraft();
  }

  tab(step, cx) {
    const f = this.fields()[this.field];
    const state = f === "branch" ? this.branch : f === "base" ? this.base : null;
    const done = state && step > 0 && this.completion(state);
    if (done) state.set_value(done);
    else this.setField(this.field + step);
    cx.notify();
  }

  newKey(key, cx) {
    switch (key) {
      case "j": case "down": return this.tab(1, cx);
      case "k": case "up": return this.tab(-1, cx);
      case "h": case "left": this.cycle(-1); return cx.notify();
      case "l": case "right": case "space": this.cycle(1); return cx.notify();
      case "tab": return this.tab(1, cx);
      case "shift-tab": return this.tab(-1, cx);
      case "enter": return this.submitNew(cx);
    }
  }

  submitNew(cx) {
    const prompt = this.prompt.value();
    const base = this.base.value().trim();
    if (!prompt.trim()) return this.fail("The prompt is empty.", cx);
    if (!base) return this.fail("The base is empty.", cx);
    const sel = this.selections[this.agent];
    const prefs = store("prefs", { agents: {} });
    localStorage.setItem("prefs", JSON.stringify({ agent: this.agent, agents: { ...prefs.agents, [this.agent]: sel } }));
    this.launch({ prompt, base, branch: this.branch.value().trim(), agent: this.agent, ...sel }, cx);
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
        const command = spec.prompt
          ? await promptCommand(agentArgv(spec.agent, spec.model, spec.effort), spec.prompt)
          : ["sh", "-c", 'exec "${SHELL:-sh}"'];
        const path = (await git(this.repo.root, ["worktree", "list", "--porcelain"])).out.split("\n\n")
          .find((b) => b.split("\n").includes(`branch refs/heads/${branch}`))?.match(/^worktree (.*)$/m)?.[1];
        if (path) {
          // Git permits one worktree per branch: use the one that has it.
          const row = this.rows.find((r) => r.path === path) ?? { path, spaces: [] };
          if (!spec.prompt) this.showCheckout(row);
          else if (row.spaces.length) run("tab.new", { space: row.spaces[0], folder: path, name: slug, argv: command });
          else run("space.new", { folder: path, tab: slug, argv: command });
        } else {
          const exists = taken(branch);
          if (!exists) await git(this.repo.root, ["config", `branch.${branch}.gh-merge-base`, spec.base]);
          const wt = ["wt", "switch", ...(exists ? [branch] : ["--create", branch, "--base", spec.base]), "--yes", "-x", command[0], "--", ...command.slice(1)];
          run("space.new", { folder: this.repo.root, tab: slug, argv: wt });
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
    if (this.view === "new") this.saveDraft();
    this.view = "list";
    this.running = false;
    this.handle.focus();
    cx.spawn(async (cx) => this.reload(cx));
    cx.notify();
  }

  // ---------------------------------------------------------------- keys

  // Keys while no text field has the keyboard.
  key(e, cx) {
    // A printable key by its character, so G, X and / work on every keyboard layout.
    const m = e.modifiers;
    const typed = e.key_char?.length === 1 && e.key_char > " " && !m.control && !m.alt && !m.platform;
    const key = typed ? e.key_char : e.keystroke;
    if (this.busy) return;
    if (this.message && !this.failed) this.message = "";
    if (this.view === "list") this.listKey(key, cx);
    else if (this.view === "new") this.newKey(key, cx);
    else if (this.failed) { if (key === "enter") this.back(cx); }
    else if (this.running) return;
    else if (this.view === "remove" && ["enter", "y", "x", "d", "X"].includes(key)) this.confirm(cx);
    else if (this.view === "remove" && key === "n") this.back(cx);
    cx.notify();
  }

  escape(cx) {
    if (this.busy || this.running) return;
    if (this.view === "list" && this.filtering) {
      this.filtering = false;
      this.filter.set_value("");
      this.handle.focus();
      return cx.notify();
    }
    if (this.view === "list") return this.close();
    this.back(cx);
  }

  enter(cx) {
    if (this.view === "list" && this.filtering) {
      this.filtering = false;
      this.handle.focus();
      return cx.notify();
    }
    if (this.view === "new") return this.submitNew(cx);
    if (this.view === "merge") return this.failed ? this.back(cx) : this.confirm(cx);
  }

  // ---------------------------------------------------------------- view

  render() {
    const t = theme();
    let body, help;
    if (this.repo === undefined) [body, help] = [div().text_color(t.dim).child("…"), [["esc", "close"]]];
    else if (!this.repo) [body, help] = [div().text_color(t.blocked).child(`Not a Git repository: ${callerFolder() ?? "no folder"}`), [["esc", "close"]]];
    else if (this.view === "new") [body, help] = [this.formView(t), [["⏎", "launch"], ["⇧⏎", "new line"], ["⇥", "next"], ["esc", "back"]]];
    else if (this.view !== "list") [body, help] = [this.actionView(t), this.actionHelp()];
    else {
      body = this.listView(t);
      help = this.filtering ? [["⏎", "keep"], ["esc", "clear"]]
        : [["⏎", "open"], ["n", "new"], ["m", "merge"], ["x", "remove"], ["X", "remove both"], ["/", "filter"], ["p", "preview"]];
    }
    return v_flex()
      .id("worktrees")
      .key_context("Worktrees")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .on_action("wt_escape", (_e, cx) => this.escape(cx))
      .on_action("wt_enter", (_e, cx) => this.enter(cx))
      .on_action("wt_tab", (_e, cx) => this.view === "new" && this.tab(1, cx))
      .on_action("wt_shift_tab", (_e, cx) => this.view === "new" && this.tab(-1, cx))
      .on_action("wt_down", (_e, cx) => this.move(1, cx))
      .on_action("wt_up", (_e, cx) => this.move(-1, cx))
      .size_full()
      .p(14)
      .gap(8)
      .bg(t.popover)
      .text_size(13)
      .text_color(t.foreground)
      .child(h_flex().gap(8).items_center()
        .child(svg("mods/workspace-chrome/git-branch.svg").size(15).text_color(t.accent))
        .child(div().font_semibold().child(this.repo ? `Worktrees of ${this.repo.name}` : "Worktrees"))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child(this.repo ? `${this.visible().length}/${this.rows.length}` : "")))
      .child(v_flex().flex_1().min_h(0).child(body))
      .child(div().h(18).truncate().text_size(12).text_color(this.ok ? t.ansi2 : t.blocked).child(this.busy || this.message))
      .child(h_flex().gap(14).text_size(11.5).children(help.map(([k, label]) =>
        h_flex().gap(5).child(div().text_color(t.accent).child(k)).child(div().text_color(t.dim).child(label)))));
  }

  listView(t) {
    const rows = this.visible();
    const mono = settings().font_family ?? "JetBrains Mono";
    const list = v_flex().w("45%").min_w(320).h_full().relative()
      .child(v_virtual_list("wt-rows", rows.length, 28, (i) => JSON.stringify([rows[i].branch, rows[i].remote]),
        (range) => rows.slice(range.start, range.end).map((r, i) => this.rowView(r, range.start + i === this.cursor, t)))
        .track_scroll(this.listScroll)
        .on_item_click((key, cx) => {
          const i = rows.findIndex((r) => JSON.stringify([r.branch, r.remote]) === key);
          if (i === this.cursor) return this.open(cx);
          this.move(i - this.cursor, cx);
        })
        .size_full())
      .child(Scrollbar.vertical("wt-rows").absolute().inset_0());
    const r = this.current();
    const lines = (r && this.previews[this.previewKey(r)]) ?? [];
    const preview = v_flex().flex_1().min_w(0).h_full().pl(10).border_l(1).border_color(t.border)
      .child(h_flex().h(22).gap(6).text_size(11.5).children(PREVIEW_MODES.flatMap((m, i) => [
        ...(i ? [div().text_color(t.dim).child("│")] : []),
        div().text_color(i === this.preview ? t.accent : t.dim).child(m),
      ])))
      .child(div().flex_1().min_h(0).relative().font_family(mono).text_size(11.5)
        .child(v_virtual_list("wt-preview", lines.length, 18, (i) => String(i), (range) => lines.slice(range.start, range.end).map(({ kind, text }) =>
          div().h(18).w_full().truncate()
            .text_color(kind === "+" ? t.ansi2 : kind === "-" ? t.ansi1 : kind === "@" ? t.ansi4 : t.foreground)
            .child(text || " "))).track_scroll(this.previewScroll).size_full())
        .child(Scrollbar.vertical("wt-preview").absolute().inset_0()));
    return v_flex().size_full().gap(6)
      .when(this.filtering || Boolean(this.filter.value()), (el) => el.child(h_flex().key_context("WtFilter").gap(6).items_center()
        .child(div().text_color(t.accent).child("/"))
        .child(Input.new(this.filter).flex_1().h(26).px(8).rounded(6).border(1).border_color(this.filtering ? t.accent : t.input).bg(t.background))))
      .child(h_flex().flex_1().min_h(0).gap(10).child(list).child(preview));
  }

  rowView(r, selected, t) {
    const icon = r.main ? ["⌂", t.accent] : r.remote ? ["☁", t.dim] : !r.path ? ["⎇", t.dim] : ["◆", t.accent];
    return h_flex().h(28).px(8).gap(8).items_center().rounded(6)
      .when(selected, (el) => el.bg(t.selected))
      .child(div().w(12).flex_none().text_color(icon[1]).child(icon[0]))
      .child(div().flex_1().min_w(0).truncate()
        .text_color(selected ? t.foreground : r.path ? t.foreground : t.dim)
        .when(selected, (el) => el.font_semibold())
        .child(rowName(r)))
      .when(r.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${r.ahead}`)))
      .when(r.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${r.behind}`)))
      .when(r.dirty, (el) => el.child(div().flex_none().text_color(t.ansi3).child("✎")))
      .when(r.pr > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`#${r.pr}`)))
      .when(Boolean(r.agent), (el) => el.child(div().flex_none().text_color(r.busy ? t.ansi3 : t.dim).child(`${r.busy ? "◉" : "○"} ${r.agent}`)));
  }

  formView(t) {
    const fields = this.fields();
    const on = (f) => fields[this.field] === f;
    const sel = this.selections[this.agent];
    const pick = (f, value) => h_flex().id(`wt-${f}`).cursor_pointer()
      .on_click((_e, cx) => { this.setField(fields.indexOf(f)); this.cycle(1); cx.notify(); })
      .text_color(on(f) ? t.accent : t.foreground)
      .child(`‹ ${value || "default"} ›`);
    const text = (f, state, hint) => {
      const done = on(f) ? this.completion(state) : "";
      return h_flex().flex_1().gap(8).items_center()
        .child(Input.new(state).flex_1().h(24).px(6).rounded(5).border(1).border_color(on(f) ? t.accent : t.input).bg(t.background))
        .when(Boolean(done), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(`⇥ ${done}`)))
        .when(Boolean(hint), (el) => el.child(div().text_size(11.5).text_color(hint?.[1]).child(hint?.[0] ?? "")));
    };
    const b = this.branch.value().trim(), base = this.base.value().trim();
    const has = (n) => this.names.local.has(n) || this.names.remote.has(n);
    const value = {
      agent: pick("agent", this.agent),
      model: pick("model", sel?.model),
      effort: pick("effort", sel?.effort),
      branch: text("branch", this.branch, b && has(b) ? ["exists", t.ansi3] : null),
      base: text("base", this.base, base && !has(base) ? ["unknown branch", t.ansi1] : null),
    };
    return v_flex().size_full().gap(6)
      .child(div().flex_1().min_h(0).p(8).rounded(8).border(1).border_color(on("prompt") ? t.accent : t.input).bg(t.background)
        .child(Textarea.new(this.prompt).size_full()))
      .children(fields.slice(1).map((f) => h_flex().h(28).gap(8).items_center()
        .child(div().w(14).text_color(t.accent).child(on(f) ? "▸" : ""))
        .child(div().w(56).text_color(on(f) ? t.accent : t.dim).child(f))
        .child(value[f])));
  }

  actionView(t) {
    const r = this.sel;
    const why = refusal(r, this.view);
    const card = h_flex().gap(10).items_center()
      .child(div().font_semibold().child(rowName(r)))
      .when(r.ahead > 0, (el) => el.child(div().text_color(t.ansi2).child(`↑${r.ahead}`)))
      .when(r.behind > 0, (el) => el.child(div().text_color(t.ansi1).child(`↓${r.behind}`)))
      .when(r.dirty, (el) => el.child(div().text_color(t.ansi3).child("✎ uncommitted")))
      .when(r.pr > 0, (el) => el.child(div().text_color(t.ansi2).child(`#${r.pr}`)));
    const notes = [];
    if (why) notes.push([why, t.blocked]);
    else if (this.view === "remove") {
      if (this.removeBranch) notes.push(["Remove worktree and branch.", t.foreground]);
      if (r.dirty) notes.push(["Uncommitted changes will be lost.", t.blocked]);
      if ((!r.path && !r.remote && !r.merged) || (this.removeBranch && !r.merged)) notes.push(["Unmerged commits will be lost.", t.blocked]);
    }
    return v_flex().size_full().gap(8)
      .child(card)
      .children(notes.map(([text, color]) => div().text_color(color).child(text)))
      .when(this.view === "merge" && !why, (el) => el.child(h_flex().gap(8).items_center()
        .child(div().text_color(t.dim).child("into"))
        .child(Input.new(this.target).flex_1().h(26).px(8).rounded(6).border(1).border_color(t.accent).bg(t.background))))
      .when(this.out.length > 0, (el) => el.child(v_flex().id("wt-out").flex_1().min_h(0).overflow_y_scroll()
        .font_family(settings().font_family ?? "JetBrains Mono").text_size(11.5).text_color(t.muted)
        .children(this.out.slice(-300).map((l) => div().truncate().child(l || " ")))));
  }

  actionHelp() {
    if (this.failed) return [["⏎", "back"]];
    if (this.running) return [];
    if (refusal(this.sel, this.view)) return [["esc", "back"]];
    return this.view === "merge" ? [["⏎", "merge"], ["esc", "back"]] : [["x/y/⏎", "remove"], ["n/esc", "back"]];
  }
}
