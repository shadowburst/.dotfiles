// A space's context menu: props { id, git: "main" | "linked" | null }.
// As Herdr's `menu`, but its worktree items open the worktrees popup, which uses wt;
// Herdr's open its `worktree` dialog, which runs git directly and skips the wt hooks.
// ↑/↓ move, Enter runs, Esc closes.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, openOverlay, props, run, theme } from "herdr";

const ICON = (name) => `mods/workspace-chrome/${name}.svg`;

export function items({ id, git }) {
  const worktrees = (action) => () => openOverlay({ mod: "worktrees", kind: "dialog", width: 0.9, height: 0.8, props: { space: id, action } });
  return [
    { label: "Rename", icon: "square-pen", act: () => run("space.rename", { id }) },
    ...(git ? [
      { label: "New worktree", icon: "git-branch", act: worktrees("new") },
      { label: "Open worktree", icon: "git-branch", act: worktrees("open") },
    ] : []),
    ...(git === "linked" ? [{ label: "Remove worktree", icon: "git-branch", act: worktrees("remove") }] : []),
    { label: "Close", icon: "x", act: () => run("space.close", { id }), last: true },
  ];
}

export default class SpaceMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  choose(item) {
    closeOverlay(props()?.overlay);
    item.act();
  }

  render() {
    const t = theme();
    const list = items(props() ?? {});
    return v_flex().id("space-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(list[this.at]);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(list.map((item, i) => v_flex()
        .when(Boolean(item.last), (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(h_flex().id(`item-${i}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
          .when(i === this.at, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.choose(item))
          .child(svg(ICON(item.icon)).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(item.label)))));
  }
}
