// The header of the sidebar stack: Spaces or Inbox, one click or key apart.
// Key commands: "sidebar" switches the stack, "left" / "right" go to Spaces /
// Inbox (no wrap), "next" / "prev" go to the next or previous space, or agent
// while the Inbox shows (alt+tab; the props.keys copy), "changes" shows or hides the
// Changes panel (one key, as the TUI's review pane).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, layout, nextCommand, props, run, theme } from "herdr";

const STACK = "sidebar-lists";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const active = () => find(layout(), STACK)?.active ?? "lists";
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function show(child) {
  run("layout.select", { stack: STACK, child });
}

function toggleChanges() {
  const panel = find(layout(), "panel");
  const body = find(layout(), "panel-body");
  if (panel && !panel.hidden && body?.active === "changes") return run("layout.hide", { id: "panel" });
  run("layout.select", { stack: "panel-body", child: "changes" });
  run("layout.show", { id: "panel" });
}

export default class SidebarSwitch extends View {
  init(_props, cx) {
    // The copy with props.keys floats over the whole window and draws nothing:
    // it answers alt+tab even while the sidebar is hidden. The header answers the rest.
    this.keys = Boolean(props()?.keys);
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (this.keys) {
          // The next space, or the next agent of the Inbox while it shows.
          if (command === "next" || command === "prev") run(`${active() === "inbox" ? "agent" : "space"}.${command}`, {});
          continue;
        }
        if (command === "sidebar") show(active() === "inbox" ? "lists" : "inbox");
        // Spaces is on the left, Inbox on the right: no wrap at either end.
        else if (command === "left") show("lists");
        else if (command === "right") show("inbox");
        else if (command === "changes") toggleChanges();
        cx.notify();
      }
    });
  }

  tab(id, icon, label, count, t) {
    const on = active() === id;
    return h_flex()
      .id(`switch-${id}`)
      .flex_1()
      .h(26)
      .gap(6)
      .items_center()
      .justify_center()
      .rounded(6)
      .text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .cursor_pointer()
      .on_click(() => show(id))
      .child(svg(icon).size(14).flex_none())
      .when(!narrow(), (el) => el.child(label))
      .when(count > 0, (el) => el.child(div().text_size(11).text_color(t.blocked).child(String(count))));
  }

  render() {
    if (this.keys) return div();
    const t = theme();
    // Agents that wait for the person: what the Inbox puts on top.
    const waiting = agents().filter((a) => a.status === "blocked" || a.status === "done").length;
    return h_flex()
      .size_full()
      .bg(t.chrome)
      .px(8)
      .gap(4)
      .items_center()
      .text_size(12.5)
      .child(this.tab("lists", "mods/sidebar-switch/layout-list.svg", "Spaces", 0, t))
      .child(this.tab("inbox", "mods/sidebar-switch/inbox.svg", "Inbox", waiting, t));
  }
}
