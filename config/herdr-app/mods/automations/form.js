// The New and Edit view of the Automations card. Choices look and behave as in the
// Worktrees popup: they open with Enter, Up or Down, a typed text filters them.

import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex, Button, Combobox, Input, InputState, Popup, ScrollHandle, Textarea, TextareaState } from "gpui-base";
import { home, panes, pickFolder, settings, spaces } from "herdr";
import { DAYS, INTERVALS, PRESETS, fromForm, parse, toForm, upcoming, when } from "./cron.js";
import { HARNESSES, loadHarnesses, loadOpencodeModels, tilde } from "./data.js";

const ICON = (name) => `mods/workspace-chrome/${name}.svg`;
const LABELS = { name: "Name", text: "Prompt", harness: "Harness", model: "Model", effort: "Effort", folder: "Folder", preset: "Schedule",
  every: "Interval", weekday: "Day", minute: "Minute", time: "Time", cron: "Cron expression", notify: "Notify", limit: "Time limit (minutes)" };
const INPUTS = ["name", "folder", "minute", "time", "cron", "limit"];
const NOTIFY = [["failure", "When a run fails"], ["always", "After each run"], ["never", "Never"]];
const CHOICES = ["harness", "model", "effort", "preset", "every", "weekday", "notify"];

// The models of the last OpenCode answer, at once; then the service's.
const cachedModels = () => {
  try {
    return JSON.parse(localStorage.getItem("opencode-models") ?? "null");
  } catch {
    return null;
  }
};

export const harnessIcon = (kind) => (kind === "opencode" ? svg(`icons/${kind}.svg`) : image(`icons/${kind}.svg`)).flex_none();

export class Form {
  constructor(cx) {
    this.inputs = Object.fromEntries(INPUTS.map((f) => [f, InputState.new({
      placeholder: { name: "Name", folder: "~/Projects/…", time: "09:00", cron: "0 9 * * 1-5" }[f] ?? "",
    })]));
    this.inputs.text = TextareaState.new({ placeholder: "What should the automation do?" });
    for (const [field, input] of Object.entries(this.inputs)) {
      input.on("change", (_e, cx) => { this.error = ""; cx.notify(); });
      input.on("focus", (_e, cx) => { this.field = field; cx.notify(); });
    }
    this.handles = Object.fromEntries(CHOICES.map((f) => [f, cx.focus_handle()]));
    this.search = InputState.new({ placeholder: "Type to search…" });
    this.search.on("change", (_e, cx) => { this.at = 0; this.reveal(); cx.notify(); });
    this.scroll = ScrollHandle.new();
    this.widths = {};
    this.agents = {};
    this.models = cachedModels();
    this.modelsError = "";
  }

  // automation: null for a new one.
  open(automation, cx) {
    const a = automation ?? { name: "", kind: "prompt", text: "", harness: "claude", folder: home(), cron: "0 9 * * *", notify: "failure", limit: 60 };
    this.automation = automation;
    this.error = "";
    this.dropdown = null;
    this.deleting = false;
    const schedule = toForm(a.cron);
    this.value = { kind: a.kind, harness: a.harness ?? "claude", provider: a.provider ?? "", model: a.model ?? "", effort: a.effort ?? "",
      preset: schedule.preset, every: schedule.every, weekday: schedule.weekday, notify: a.notify };
    for (const [field, text] of Object.entries({ name: a.name, text: a.text, folder: tilde(a.folder), limit: String(a.limit), ...schedule })) {
      this.inputs[field]?.set_value(String(text));
    }
    this.inputs.name.focus();
    cx.spawn(async (cx) => {
      const { agents, providers } = await loadHarnesses();
      this.agents = agents;
      if (!automation) this.reset();
      cx.notify();
      try {
        this.models = await loadOpencodeModels(providers);
        this.modelsError = "";
        localStorage.setItem("opencode-models", JSON.stringify(this.models));
      } catch (error) {
        this.modelsError = String(error.message ?? error);
      }
      if (this.value.harness === "opencode" && !this.value.model) this.reset();
      cx.notify();
    });
  }

  // The harness's first model and effort: the defaults of the Worktrees popup.
  reset() {
    const v = this.value;
    const model = this.options("model")[0];
    Object.assign(v, { provider: model?.provider ?? "", model: model?.model ?? "" });
    v.effort = this.options("effort")[0]?.value ?? "";
  }

  schedule() {
    const { preset, every, weekday } = this.value;
    return fromForm({ preset, every, weekday, minute: this.inputs.minute.value(), time: this.inputs.time.value(), cron: this.inputs.cron.value() });
  }

  // The automation to save. Throws an Error with a message for the person.
  result() {
    const text = (f) => this.inputs[f].value().trim();
    const { kind, harness, provider, model, effort, notify } = this.value;
    if (!text("name")) throw new Error("Write a name.");
    if (!text("text")) throw new Error(`Write a ${kind}.`);
    const folder = text("folder").replace(/^~(?=\/|$)/, home());
    if (!folder.startsWith("/")) throw new Error("The folder must start with / or ~.");
    const limit = Number(text("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 1440) throw new Error("The time limit must be from 1 to 1440 minutes.");
    if (kind === "prompt" && harness === "opencode" && !model) throw new Error("Select a model.");
    return { name: text("name"), kind, text: this.inputs.text.value(), folder, cron: this.schedule(), notify, limit,
      ...(kind === "prompt" ? { harness, model, effort, ...(harness === "opencode" ? { provider } : {}) } : {}) };
  }

  fields() {
    const v = this.value;
    const times = { every: ["every"], hourly: ["minute"], daily: ["time"], weekdays: ["time"], weekly: ["weekday", "time"], custom: ["cron"] }[v.preset] ?? [];
    return ["name", "text", ...(v.kind === "prompt" ? ["harness", "model", ...(this.options("effort").length ? ["effort"] : [])] : []),
      "folder", "preset", ...times, "notify", "limit"];
  }

  // ---- choices -----------------------------------------------------------------

  options(field) {
    const v = this.value;
    const pairs = (list) => list.map(([value, label]) => ({ value, label }));
    if (field === "harness") return pairs(Object.entries(HARNESSES));
    if (field === "preset") return pairs(PRESETS);
    if (field === "notify") return pairs(NOTIFY);
    if (field === "every") return INTERVALS.map((n) => ({ value: n, label: `${n} minutes` }));
    if (field === "weekday") return [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: DAYS[d] }));
    if (field === "folder") {
      const seen = new Set();
      return spaces().filter((s) => !s.machine).map((s) => {
        const tabs = new Set(s.tabs.map((t) => t.id));
        return { value: tilde(panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder), label: s.name };
      }).filter((o) => o.value && !seen.has(o.value) && seen.add(o.value)).map((o) => ({ ...o, group: o.value }));
    }
    if (v.harness === "opencode") {
      const models = this.models ?? [];
      if (field === "model") return models.map((m) => ({ ...m, value: JSON.stringify([m.provider, m.model]) }));
      const efforts = models.find((m) => m.provider === v.provider && m.model === v.model)?.efforts ?? [];
      return efforts.length ? pairs([["", "Default"], ...efforts.map((e) => [e, e])]) : [];
    }
    const list = this.agents[v.harness]?.[field === "model" ? "models" : "efforts"] ?? [];
    return list.map((value) => ({ value, label: value, model: value }));
  }

  current(field) {
    const v = this.value;
    return field === "model" && v.harness === "opencode" ? JSON.stringify([v.provider, v.model]) : v[field];
  }

  shown() {
    const query = this.dropdown === "folder" ? "" : this.search.value().trim().toLowerCase();
    return this.options(this.dropdown).filter((o) => !query || `${o.label} ${o.group ?? ""}`.toLowerCase().includes(query));
  }

  reveal() {
    if (this.dropdown) this.scroll.scroll_to_item(Math.max(0, this.at));
  }

  show(field, open, cx) {
    this.field = field;
    this.dropdown = open && this.options(field).length ? field : null;
    this.search.set_value("");
    this.at = this.dropdown ? this.options(field).findIndex((o) => o.value === (field === "folder" ? this.inputs.folder.value() : this.current(field))) : -1;
    this.reveal();
    if (field === "folder") this.inputs.folder.focus();
    else (this.dropdown ? this.search : this.handles[field]).focus();
    cx.notify();
  }

  pick(field, option, cx) {
    if (!option) return;
    this.error = "";
    if (field === "folder") this.inputs.folder.set_value(option.value);
    else if (field === "model") Object.assign(this.value, { provider: option.provider ?? "", model: option.model });
    else this.value[field] = option.value;
    if (field === "harness") this.reset();
    // Keep the effort if the new model has it.
    const efforts = this.options("effort").map((o) => o.value);
    if (field === "model" && !efforts.includes(this.value.effort)) this.value.effort = efforts[0] ?? "";
    this.show(field, false, cx);
  }

  key(key, cx) {
    if (!this.dropdown) return;
    const list = this.shown();
    if (key === "enter") return this.pick(this.dropdown, list[this.at], cx);
    this.at = Math.max(0, Math.min(list.length - 1, this.at + (key === "down" ? 1 : -1)));
    this.reveal();
    cx.notify();
  }

  // True when the key had something to close.
  escape(cx) {
    if (!this.dropdown) return false;
    this.show(this.dropdown, false, cx);
    return true;
  }

  tab(step, cx) {
    const fields = this.fields();
    const at = fields.findIndex((f) => this.handles[f]?.is_focused());
    this.field = fields[((at >= 0 ? at : Math.max(0, fields.indexOf(this.field))) + step + fields.length) % fields.length];
    this.dropdown = null;
    (this.inputs[this.field] ?? this.handles[this.field]).focus();
    cx.notify();
  }

  // ---- view --------------------------------------------------------------------

  list(field, t) {
    const options = this.shown();
    return v_flex().id(`auto-${field}-options`).w(Math.max(this.widths[field] ?? 0, 180)).h(Math.max(32, Math.min(options.length * 30, 240)) + 10).mt(4).p(4).rounded(8)
      .overflow_y_scrollbar().track_scroll(this.scroll)
      .bg(t.popover).border(1).border_color(t.border).shadow_lg().role("list_box")
      .on_mouse_down_out((_e, cx) => { if (this.over !== field) this.show(field, false, cx); })
      .when(!options.length, (el) => el.child(div().h(32).px(8).py(7).text_color(t.muted).child("No matches")))
      .children(options.map((o, i) => {
        const chosen = o.value === (field === "folder" ? this.inputs.folder.value() : this.current(field));
        return h_flex().id(`auto-${field}-${i}`).h(30).flex_none().px(8).gap(8).items_center().rounded(4).cursor_pointer()
          .role("list_box_option").aria_selected(chosen).accessibility_label(o.group ? `${o.label}, ${o.group}` : o.label)
          .when(i === this.at, (el) => el.bg(t.selected).aria_active_descendant())
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.pick(field, o, cx))
          .when(field === "harness", (el) => el.child(harnessIcon(o.value).size(14)))
          .child(div().flex_1().min_w(0).truncate().child(o.label))
          .when(Boolean(o.group), (el) => el.child(div().max_w("60%").truncate().text_size(11).text_color(t.muted).child(o.group)))
          .when(chosen, (el) => el.child(svg(ICON("check")).size(13).flex_none().text_color(t.accent)));
      }));
  }

  box(field, t) {
    const on = this.field === field || this.handles[field]?.is_focused();
    return h_flex().id(`auto-${field}-box`).w_full().h(32).px(8).gap(6).items_center().rounded(7).border(1)
      .border_color(on ? t.accent : t.border).bg(t.background).hover((s) => s.border_color(t.accent))
      .on_size_change((size) => { this.widths[field] = size.width / (settings().zoom || 1); })
      .on_hover((over) => { this.over = over ? field : null; });
  }

  choice(field, t) {
    const open = this.dropdown === field;
    const option = this.options(field).find((o) => o.value === this.current(field));
    const loading = this.value.harness === "opencode" && field === "model" && !this.models;
    const label = option?.label ?? (loading ? (this.modelsError ? "Unavailable" : "Loading…") : this.value[field] || "Default");
    const trigger = this.box(field, t).cursor_pointer()
      .when(open, (el) => el.key_context("AutoChoice"))
      .accessibility_label(`${LABELS[field]}: ${label}`)
      .on_click((_e, cx) => { if (!open) this.show(field, true, cx); })
      .when(field === "harness", (el) => el.child(harnessIcon(this.value.harness).size(14)))
      .when(open, (el) => el.child(Input.new(this.search).flex_1().min_w(0).h(28).accessibility_label(LABELS[field]).text_color(t.foreground)))
      .when(!open, (el) => el.child(div().flex_1().min_w(0).truncate().child(String(label))))
      .child(svg(ICON("chevron-down")).size(13).flex_none().text_color(t.muted));
    return Combobox.new(`auto-${field}`).w_full().min_w(0).open(open).track_focus(this.handles[field])
      .on_open_change((next, cx) => this.show(field, next, cx))
      .child(Popup.new(`auto-${field}-popup`, trigger).w_full().when(open, (el) => el.content(this.list(field, t))));
  }

  input(field, t) {
    return this.box(field, t).child(Input.new(this.inputs[field]).flex_1().min_w(0).h(28).accessibility_label(LABELS[field]).text_color(t.foreground));
  }

  folderInput(t) {
    const open = this.dropdown === "folder";
    const icon = (id, name, tip, click) => div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).role("button").accessibility_label(tip).tooltip(tip)
      .on_click(click).child(svg(ICON(name)).size(13));
    const trigger = this.box("folder", t).when(open, (el) => el.key_context("AutoChoice"))
      .child(Input.new(this.inputs.folder).flex_1().min_w(0).h(28).accessibility_label(LABELS.folder).text_color(t.foreground))
      .child(icon("auto-folder-pick", "folder", "Select a folder", (_e, cx) => cx.spawn(async (cx) => {
        const path = await pickFolder({ prompt: "Select" });
        if (path) this.inputs.folder.set_value(tilde(path));
        cx.notify();
      })))
      .child(icon("auto-folder-spaces", "chevron-down", "Folders of the open spaces", (_e, cx) => this.show("folder", !open, cx)));
    return Popup.new("auto-folder-popup", trigger).w_full().when(open, (el) => el.content(this.list("folder", t)));
  }

  preview(t) {
    let text;
    try {
      const cron = this.schedule();
      const times = cron ? upcoming(parse(cron), new Date(), 3) : [];
      text = cron ? `Next: ${times.map((d) => when(d)).join(" · ")}` : "This automation runs only when you start it.";
    } catch (error) {
      return div().text_size(11).text_color(t.blocked).child(error.message);
    }
    return div().text_size(11).text_color(t.dim).child(text);
  }

  view(t) {
    const v = this.value;
    const row = (field, control) => v_flex().flex_1().min_w(0).gap(5)
      .child(div().text_size(11).text_color(t.muted).child(field === "text" && v.kind === "script" ? "Script" : LABELS[field])).child(control);
    const line = (...fields) => h_flex().w_full().gap(8).children(fields.map((f) => row(f, CHOICES.includes(f) ? this.choice(f, t) : this.input(f, t))));
    const kinds = h_flex().w_full().p(2).gap(2).rounded(7).border(1).border_color(t.border).bg(t.background)
      .children([["prompt", "Prompt", "mods/worktrees/sparkles.svg"], ["script", "Script", ICON("terminal")]].map(([kind, label, icon]) =>
        Button.new(`auto-kind-${kind}`).flex().flex_1().h(26).gap(6).items_center().justify_center().rounded(5).text_size(12).cursor_pointer()
          .selected(v.kind === kind).bg(v.kind === kind ? t.selected : t.background).text_color(v.kind === kind ? t.foreground : t.muted)
          .on_click((_e, cx) => { v.kind = kind; this.error = ""; cx.notify(); })
          .child(svg(icon).size(13)).child(label)));
    const fields = this.fields();
    const times = fields.slice(fields.indexOf("preset") + 1, fields.indexOf("notify"));
    return v_flex().w_full().gap(12)
      .child(line("name"))
      .child(kinds)
      .child(row("text", div().h(170).px(10).py(8).rounded(7).border(1).border_color(this.field === "text" ? t.accent : t.border).bg(t.background)
        .when(v.kind === "script", (el) => el.font_family(settings().font_family ?? "JetBrains Mono").text_size(12))
        .child(Textarea.new(this.inputs.text).size_full().accessibility_label(LABELS.text).text_color(t.foreground))))
      .child(div().text_size(11).text_color(t.dim).child(v.kind === "script"
        ? "Runs in zsh. A #! first line selects another interpreter."
        : "Runs without a person: a request for a permission is denied."))
      .when(v.kind === "prompt", (el) => el.child(line("harness"))
        .child(line("model", ...(fields.includes("effort") ? ["effort"] : [])))
        .when(v.harness === "opencode" && Boolean(this.modelsError), (el) => el.child(div().text_size(11).text_color(t.blocked).child(this.modelsError))))
      .child(row("folder", this.folderInput(t)))
      .child(line("preset"))
      .when(times.length > 0, (el) => el.child(line(...times)))
      .child(this.preview(t))
      .child(line("notify", "limit"));
  }
}
