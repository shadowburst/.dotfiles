// A pane's header (cloned from Herdr's shipped `pane` mod, app 0.1.13) with the sub-agents its
// agent started as tabs: hc helpers and OpenCode children. A tab shows its sub-agent in the pane
// for now; Main brings the pane's own terminal back. A pane without sub-agents has the shipped header.
// Props from the app: { pane, terminal }. The copy with props.poll floats over the window, draws
// nothing and keeps the list current for every header.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, layout, notify } from "herdr";
import { focus, poll, reconcile, restore, show, shown, subAgents, tidy } from "./data.js";

const WORD = { working: "working", blocked: "needs you", done: "finished", idle: "idle" };

// Match the first visible tab frame, including the active child of a stack.
function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    children = [visible.find(child => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class PaneAgents extends View {
  init(_props, cx) {
    this.hovered = false;
    this.polls = Boolean(props()?.poll);
    if (!this.polls) return;
    restore();
    const sync = (cx) => {
      reconcile();
      tidy();
      if (this.polling) return;
      this.polling = true;
      cx.spawn(async () => {
        // A missed answer keeps the last list; the next poll asks again.
        try { await poll(); } catch (error) { console.log(`pane-agents: ${error?.message ?? error}`); } finally { this.polling = false; }
      });
    };
    cx.timer.every(4000, sync);
    sync(cx);
  }

  async close() { if (this.polls) restore(); }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  select(pane, key, cx) {
    cx.stop_propagation();
    cx.spawn(async () => {
      try { await show(pane, key); } catch (error) { notify({ title: "Cannot show the sub-agent", body: String(error?.message ?? error), level: "error" }); }
    });
  }

  tab(t, id, active, pane, key) {
    return h_flex().id(id).h(22).px(8).gap(6).flex_none().items_center().rounded(6).cursor_pointer()
      .bg(active ? t.selected : t.background).text_color(active ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => this.select(pane, key, cx));
  }

  dot(t, status) {
    if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
    return div().size(7).mx(2).flex_none().rounded(4).bg(t[status] ?? t.dim);
  }

  tabs(t, p, kids, on) {
    const pane = p.pane, pic = icon(p.program, 13, t.muted);
    return h_flex().flex_1().min_w(0).gap(4).items_center()
      .child(this.tab(t, `pa-main-${pane}`, !on, pane, null)
        .accessibility_label("Main agent").tooltip(folder(p.cwd) || p.title)
        .when(Boolean(pic), (el) => el.child(pic)).child(div().font_medium().child("Main")))
      .child(div().w(1).h(14).mx(2).flex_none().bg(t.border))
      .child(h_flex().id(`pa-kids-${pane}`).flex_1().min_w(0).gap(4).items_center().overflow_x_scrollbar()
        .children(kids.map((k) => this.tab(t, `pa-kid-${pane}-${k.key}`, on === k.key, pane, k.key)
          .border(1).border_color(k.status === "blocked" ? t.blocked : t.background)
          .accessibility_label(`Sub-agent ${k.name}, ${WORD[k.status] ?? k.status}`).tooltip(`${k.name} · ${k.tag} · ${WORD[k.status] ?? k.status}`)
          .child(this.dot(t, k.status)).child(div().max_w(180).truncate().child(k.name))
          .child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10).text_color(t.dim).child(k.tag)))));
  }

  render() {
    // Runs again whenever the focus or what a pane shows changes.
    if (this.polls) { reconcile(); return div(); }
    const t = theme();
    const p = panes().find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const pane = p.pane, kids = subAgents(pane), on = shown()[pane] ?? null;
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    const tabbed = kids.length > 0 || Boolean(on);
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .min_w(0)
      .px(tabbed ? 6 : 10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .when(bottom, el => el.border_t(1))
      .when(!bottom, el => el.border_b(1))
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => focus(pane))
      .when(tabbed, (el) => el.child(this.tabs(t, p, kids, on)))
      .when(!tabbed, (el) => el
        .when(Boolean(pic), (line) => line.child(pic))
        .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
        .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd))))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
