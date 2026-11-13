// Usage: a row above Settings in the sidebar that opens the subscription limits
// of every logged-in account, after T3 Code's Usage → Limits page: one section
// per provider, one card per window with what is left, its pace and its reset.
// The same mod with props {view: true} is that dialog.
// Key command: "usage.open".

import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, layout, nextCommand, openOverlay, props, setShared, shared, theme } from "herdr";
import * as usage from "./sources.js";

// T3 Code's rule: opening checks again only when the last check is older.
const STALE_MS = 5 * 60_000;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function openUsage() {
  openOverlay({ mod: "usage", kind: "dialog", props: { view: true }, width: 0.8, height: 0.85 });
}

export default class Usage extends View {
  init(_props, cx) {
    // Herdr gives a mod its props through props(), not through init's argument.
    if (props()?.view) return this.initView(cx);
    // The earlier sidebar bar kept its last reading here.
    if (shared("usage.view")) setShared("usage.view", null);
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        cx.notify(); // a replaced build's loop stops here, before it acts
        if (command === "open") openUsage();
      }
    });
  }

  // ---- the dialog ------------------------------------------------------------

  initView(cx) {
    this.rows = null; // [{ account, entry, error, loading }]
    this.now = Date.now();
    cx.timer.every(60_000, (cx) => {
      this.now = Date.now();
      cx.notify();
    });
    cx.spawn(async (cx) => {
      const accounts = await usage.discoverAccounts();
      this.rows = await Promise.all(accounts.map(async (account) => ({ account, entry: await usage.readCache(account.key), error: null, loading: false })));
      cx.notify();
      await this.refresh(cx, STALE_MS);
    });
  }

  async refresh(cx, maxAge) {
    this.now = Date.now();
    await Promise.all((this.rows ?? []).map(async (row) => {
      if (row.loading || (row.entry && this.now - row.entry.fetchedAt < maxAge)) return;
      row.loading = true;
      cx.notify();
      try {
        const entry = { snapshot: await row.account.load(), fetchedAt: Date.now() };
        await usage.writeCache(row.account.key, entry);
        row.entry = entry;
        row.error = null;
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error);
      }
      row.loading = false;
      this.now = Date.now();
      cx.notify();
    }));
  }

  iconButton(id, icon, tip, action) {
    const t = theme();
    return div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).on_click(action).child(icon);
  }

  bar(id, window, remaining, color, t) {
    // The tick is where even spending would be: the share of the window still to run.
    const timeLeft = usage.timeLeftPercent(window, this.now);
    return div().id(id).relative().w_full().h(20)
      .child(div().absolute().left(0).top(7).w_full().h(6).rounded(3).bg(t.border))
      .when(remaining > 0, (el) => el.child(div().absolute().left(0).top(7).h(6).rounded(3).bg(color).w(`${remaining}%`)))
      .when(timeLeft !== null, (el) => el.child(div().absolute().top(2).h(16).w(2).rounded(1).bg(t.foreground).left(`${Math.min(timeLeft, 99.5)}%`)));
  }

  card(row, window, base, t) {
    const remaining = Math.round(100 - window.usedPercent);
    const stale = Boolean(row.error);
    const color = stale ? t.dim : usage.fillColor(remaining, base, t);
    const pace = usage.paceOf(window, this.now);
    const id = `${row.account.key}-${window.id}`;
    return h_flex().id(`card-${id}`).gap(24).items_center().p(16).rounded(8).border(1).border_color(t.border)
      .child(v_flex().w(176).flex_none().gap(2)
        .child(div().text_size(13).font_medium().text_color(t.foreground).truncate().child(window.label))
        .child(h_flex().items_baseline().gap(8)
          .child(div().text_size(28).font_semibold().text_color(stale ? t.dim : usage.fillColor(remaining, t.foreground, t)).child(`${remaining}%`))
          .child(div().text_size(13).text_color(t.muted).child("left"))
          .when(Boolean(pace), (el) => el.child(div().id(`pace-${id}`).text_color(t.muted).tooltip(usage.PACE[pace].label)
            .child(svg(usage.PACE[pace].icon).size(14))))))
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(this.bar(`bar-${id}`, window, remaining, color, t))
        .child(div().text_size(11.5).text_color(t.dim).child(usage.resetText(window, this.now))));
  }

  account(row, base, t) {
    const snapshot = row.entry?.snapshot;
    const about = [snapshot?.plan, snapshot?.email ? usage.maskEmail(snapshot.email) : null, `via ${row.account.sources.join(", ")}`]
      .filter(Boolean).join(" · ");
    const status = row.loading
      ? div().text_color(t.dim).child("Checking…")
      : row.error
        ? div().text_color(t.ansi1).truncate().child(row.error)
        : div().text_color(t.dim).child(row.entry ? `Updated ${usage.age(row.entry.fetchedAt, this.now)}` : "");
    const windows = snapshot?.windows ?? [];
    return v_flex().gap(10)
      .child(h_flex().justify_between().gap(16).text_size(12)
        .child(div().text_color(t.muted).truncate().child(about))
        .child(div().flex_none().max_w(360).child(status)))
      .when(windows.length === 0 && !row.loading && !row.error, (el) => el.child(div().text_size(12.5).text_color(t.dim).child("No limits reported.")))
      .children(windows.map((window) => this.card(row, window, base, t)));
  }

  section(provider, rows, t) {
    const info = usage.PROVIDERS[provider];
    const base = info.color ?? t.foreground;
    return v_flex().gap(14)
      .child(h_flex().justify_between().items_center()
        .child(h_flex().gap(8).items_center()
          .child(image(info.icon).size(18))
          .child(div().text_size(14).font_semibold().text_color(t.foreground).child(info.label)))
        .child(div().id(`manage-${provider}`).px(8).py(3).rounded(6).text_size(12).text_color(t.muted)
          .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => cx.open_url(info.manage)).child("Manage usage ↗")))
      .children(rows.map((row) => this.account(row, base, t)));
  }

  renderView() {
    const t = theme();
    const loading = (this.rows ?? []).some((row) => row.loading);
    this.now ??= Date.now();
    const refreshIcon = svg("mods/usage/refresh.svg").size(15);
    const body = !this.rows
      ? [div().text_size(13).text_color(t.muted).child("Looking for logins…")]
      : this.rows.length === 0
        ? [div().text_size(13).text_color(t.muted).child("No harness here is logged in to a subscription.")]
        : ["claude", "chatgpt"]
          .map((provider) => [provider, this.rows.filter((row) => row.account.provider === provider)])
          .filter(([, rows]) => rows.length > 0)
          .map(([provider, rows]) => this.section(provider, rows, t));
    return v_flex().id("usage-view").size_full()
      .child(h_flex().flex_none().h(48).pl(20).pr(10).gap(8).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/usage/gauge.svg").size(16).text_color(t.muted))
        .child(div().text_size(14).font_semibold().text_color(t.foreground).child("Usage limits"))
        .child(div().flex_1())
        .child(this.iconButton("usage-refresh", loading ? refreshIcon.spin(900) : refreshIcon, "Refresh limits", (_e, cx) => {
          cx.spawn((cx) => this.refresh(cx, 0));
        }))
        .child(this.iconButton("usage-close", svg("mods/usage/x.svg").size(15), "Close", () => closeOverlay(props().overlay))))
      .child(div().id("usage-body").flex_1().min_h(0).overflow_y_scrollbar()
        .child(v_flex().w_full().max_w(880).mx_auto().px(24).py(20).gap(28).children(body)));
  }

  // ---- the sidebar row -------------------------------------------------------

  render() {
    if (props()?.view) return this.renderView();
    const t = theme();
    return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).justify_center()
      .child(h_flex().id("usage-open").h(28).px(8).gap(9).items_center().rounded(8).text_size(13)
        .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .when(narrow(), (el) => el.tooltip("Usage"))
        .on_click(() => openUsage())
        .child(svg("mods/usage/gauge.svg").size(14))
        .when(!narrow(), (el) => el.child("Usage")));
  }
}
