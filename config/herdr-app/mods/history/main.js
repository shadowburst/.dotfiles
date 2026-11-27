// History: the newest agent sessions on this computer (OpenCode, Claude Code, Codex), read
// from each agent's own storage by sessions.py, to open one again. One that a terminal shows
// now has a dot, and opening it goes to that terminal; any other opens in a new tab of the
// space that shows its folder, else in a new space.
// A dialog. Key command: "mod.open:history" (toggles). Type to filter, ↑/↓ and Enter to open,
// ctrl+d to hide a session, ctrl+r to read again, Esc to close.

import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, ScrollHandle } from "gpui-base";
import { agents, appHome, closeOverlay, exec, home, panes, props, run, setShared, shared, spaces, theme } from "herdr";

const LIMIT = 50;
const HIDDEN = "history.hidden"; // shared: the session ids hidden with ctrl+d or ×, newest last
const KEEP_HIDDEN = 500;
const ICON = (name) => `mods/workspace-chrome/${name}.svg`;
const AGENTS = { opencode: "OpenCode", claude: "Claude Code", codex: "Codex" };
const DAY = 86_400_000;

// A theme color with an alpha (0..1); theme colors are #rrggbb.
function alpha(color, a) {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? "")) return color;
  return color + Math.round(a * 255).toString(16).padStart(2, "0");
}

function age(ms, now) {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  if (m < 10080) return `${Math.round(m / 1440)}d`;
  return `${Math.round(m / 10080)}w`;
}

function group(ms, now) {
  const today = new Date(now).setHours(0, 0, 0, 0);
  if (ms >= today) return "Today";
  if (ms >= today - DAY) return "Yesterday";
  if (ms >= today - 6 * DAY) return "This week";
  return "Older";
}

const short = (folder) => (folder ?? "").replace(home(), "~");

// The command that continues a session, in its own folder.
function argv(s) {
  if (s.agent === "claude") return ["claude", "--resume", s.id];
  if (s.agent === "codex") return ["codex", "--no-daemon", "-c", `projects={${JSON.stringify(s.folder)}={trust_level="trusted"}}`, "resume", s.id];
  return ["opencode", "--session", s.id];
}

// A local space whose terminals are in the folder (or under it), else the space's own folder.
function spaceOf(folder) {
  return spaces().find((sp) => {
    if (sp.machine) return false;
    const tabs = new Set(sp.tabs.map((t) => t.id));
    const cwd = panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || sp.folder;
    return cwd === folder || cwd?.startsWith(`${folder}/`);
  });
}

export default class History extends View {
  init(_props, cx) {
    this.sessions = null; // from sessions.py; null while the first read runs
    this.error = "";
    this.loading = false;
    this.filter = "";
    this.at = 0;
    this.hover = null;
    this.now = Date.now();
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Filter by title or folder" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      this.scroll.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", () => this.open(this.rows()[this.at]));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.refresh(cx);
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/history/sessions.py`, String(LIMIT), ...(shared(HIDDEN) ?? [])], { timeout: 30_000 });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").at(-1) || `sessions.py exited ${r.code}`);
        this.sessions = JSON.parse(r.stdout);
        this.error = "";
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
      this.loading = false;
      this.now = Date.now();
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  rows() {
    const f = this.filter.trim().toLowerCase();
    const hidden = new Set(shared(HIDDEN) ?? []);
    return (this.sessions ?? []).filter((s) => !hidden.has(s.id) && (!f || `${s.title} ${short(s.folder)}`.toLowerCase().includes(f)));
  }

  open(s) {
    if (!s) return;
    this.close();
    // A live one: its tab if Herdr shows it, else a peek over the tab.
    if (s.live) return run(agents().some((a) => a.address === s.live) ? "agent.focus" : "terminal.peek", { terminal: s.live });
    const name = s.title.length > 40 ? `${s.title.slice(0, 39)}…` : s.title;
    const space = spaceOf(s.folder);
    if (space) run("tab.new", { space: space.id, folder: s.folder, name, argv: argv(s) });
    else run("space.new", { folder: s.folder, tab: name, argv: argv(s), machine: "" });
  }

  hide(s) {
    if (!s) return;
    setShared(HIDDEN, [...(shared(HIDDEN) ?? []).filter((id) => id !== s.id), s.id].slice(-KEEP_HIDDEN));
  }

  iconButton(id, icon, tip, action) {
    const t = theme();
    return div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .role("button").accessibility_label(tip).tooltip(tip).on_click(action).child(icon);
  }

  kbd(text, t) {
    return h_flex().flex_none().px(5).h(18).min_w(18).items_center().justify_center().rounded(4)
      .bg(alpha(t.foreground, 0.07)).text_size(10.5).text_color(t.dim).child(text);
  }

  rowView(s, selected, t) {
    const icon = (s.agent === "opencode" ? svg(`icons/${s.agent}.svg`) : image(`icons/${s.agent}.svg`)).size(15);
    const shown = selected || this.hover === s.id;
    return h_flex().id(`h-${s.id}`).h(40).px(10).gap(10).items_center().rounded(8).cursor_pointer()
      .role("list_box_option").aria_selected(selected).accessibility_label(`${s.title}; ${AGENTS[s.agent]}; ${short(s.folder)}${s.live ? "; open now" : ""}`)
      .when(selected, (el) => el.bg(t.selected))
      .when(!selected, (el) => el.hover((st) => st.bg(t.hover)))
      .on_hover((hovered, cx) => {
        this.hover = hovered ? s.id : this.hover === s.id ? null : this.hover;
        cx.notify();
      })
      .on_click(() => this.open(s))
      .child(div().flex_none().size(26).rounded(7).bg(alpha(t.foreground, 0.06)).flex().items_center().justify_center().child(icon))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(13).text_color(t.foreground).when(selected, (el) => el.font_medium()).child(s.title))
        .child(div().truncate().text_size(11).text_color(t.dim).child(`${short(s.folder)} · ${AGENTS[s.agent]}`)))
      .when(Boolean(s.live), (el) => el.child(h_flex().flex_none().h(20).px(7).gap(5).items_center().rounded_full()
        .bg(alpha(t.working, 0.14)).text_color(t.working).text_size(11).font_medium()
        .child(div().size(6).rounded_full().bg(t.working)).child("open")))
      .child(div().flex_none().w(30).text_size(11.5).text_color(t.dim).text_right().child(age(s.updated, this.now)))
      .child(div().id(`hide-${s.id}`).flex_none().size(22).flex().items_center().justify_center().rounded(5)
        .text_color(t.dim).when(!shown, (el) => el.invisible())
        .hover((st) => st.bg(t.hover).text_color(t.foreground)).tooltip("Hide (Ctrl+D)")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.hide(s);
        })
        .child(svg(ICON("x")).size(13)));
  }

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    // The list's children: a title for each date group, then its sessions.
    const items = [];
    let last = null;
    rows.forEach((s, i) => {
      const g = group(s.updated, this.now);
      if (g !== last) items.push(div().px(10).pt(items.length ? 14 : 2).pb(4).text_size(11).font_semibold().text_color(t.dim).child(g));
      last = g;
      if (i === this.at) this.atItem = items.length;
      items.push(this.rowView(s, i === this.at, t));
    });
    const refreshIcon = svg("mods/usage/refresh.svg").size(15);
    const empty = this.error
      ? div().text_color(t.blocked).child(this.error)
      : !this.sessions
        ? h_flex().gap(8).items_center().text_color(t.muted).child(svg(ICON("spinner")).size(14).spin(900)).child("Reading sessions…")
        : div().text_color(t.dim).child(this.sessions.length ? "No session matches." : "No sessions yet.");
    // Only the arrows bring the selection into view, so the wheel can scroll freely.
    if (this.reveal) this.scroll.scroll_to_item(this.atItem);
    this.reveal = false;
    const step = (by, cx) => {
      if (!rows.length) return;
      this.at = (this.at + by + rows.length) % rows.length;
      this.reveal = true;
      cx.notify();
    };
    return v_flex().id("history").size_full().bg(t.popover).text_color(t.foreground).text_size(13)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") this.close();
        else if (k === "down") step(1, cx);
        else if (k === "up") step(-1, cx);
        else if (k === "d" && e.modifiers.control) this.hide(rows[this.at]);
        else if (k === "r" && e.modifiers.control) this.refresh(cx);
        else return;
        cx.stop_propagation();
      })
      .child(h_flex().flex_none().h(60).px(20).gap(12).items_center().border_b(1).border_color(t.border)
        .child(div().flex_none().size(34).rounded(9).bg(alpha(t.accent, 0.16)).flex().items_center().justify_center()
          .child(svg(ICON("clock")).size(17).text_color(t.accent)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(14.5).font_semibold().child("History"))
          .child(div().text_size(12).text_color(t.muted).truncate().child("Recent agent sessions on this computer")))
        .child(this.iconButton("history-refresh", this.loading ? refreshIcon.spin(900) : refreshIcon, "Read again (Ctrl+R)", (_e, cx) => this.refresh(cx)))
        .child(this.iconButton("history-close", div().text_size(11).text_color(t.dim).child("Esc"), "Close (Esc)", () => this.close())))
      .child(v_flex().flex_1().min_h(0).px(20).pt(16).gap(10)
        .child(h_flex().flex_none().h(34).px(10).gap(8).items_center().rounded(8).border(1).border_color(t.accent).bg(t.background)
          .child(svg(ICON("search")).size(14).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h(30).text_color(t.foreground)))
        .child(rows.length
          ? v_flex().id("history-list").flex_1().min_h(0).pb(12).overflow_y_scrollbar().track_scroll(this.scroll)
            .role("list_box").accessibility_label("Agent sessions").children(items)
          : v_flex().flex_1().items_center().justify_center().text_size(12.5).child(empty)))
      .child(h_flex().flex_none().h(40).px(20).gap(14).items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
        .child(h_flex().gap(6).items_center().child(this.kbd("↑↓", t)).child("select"))
        .child(h_flex().gap(6).items_center().child(this.kbd("↵", t)).child("open"))
        .child(h_flex().gap(6).items_center().child(this.kbd("Ctrl D", t)).child("hide"))
        .child(div().flex_1())
        .when(Boolean(this.error) && rows.length > 0, (el) => el.child(div().truncate().text_color(t.blocked).child(this.error))));
  }
}
