// The focused agent's subscription usage, at the bottom of the sidebar: the
// 5-hour window if its account has one, else the weekly, as what is left.
// A click opens every window of that account. Empty when no agent has focus.
// Same mod with props {popup: true}: that popup, drawn from shared "usage.view".
// Key commands: "usage.refresh" fetches now, "usage.popup" opens the popup.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, focused, layout, nextCommand, openOverlay, panes, props, run, setShared, shared, theme } from "herdr";
import * as usage from "./sources.js";

const VIEW = "usage.view";
// Fetch again only when the cache is older than this.
const ON_FOCUS_MS = 2 * 60_000;
const ON_IDLE_MS = 30_000;
const POLL_MS = 5 * 60_000;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// The agent in the focused pane; none when a shell, an editor or a mod has focus.
function focusedAgent() {
  const address = focused()?.terminal;
  return address ? agents().find((a) => a.address === address) : undefined;
}

function bar(remaining, color, t) {
  return div().w_full().h(4).rounded(2).bg(t.hover)
    .child(div().h_full().rounded(2).bg(color).w(`${Math.max(0, Math.min(100, remaining))}%`));
}

export default class Usage extends View {
  init(p, cx) {
    if (p?.popup) {
      cx.timer.every(30_000, (cx) => cx.notify()); // "updated … ago"
      return;
    }
    this.address = null;
    this.status = null;
    this.generation = 0;
    this.target = null; // { provider, login: "claude" | …, label, key, auth }
    this.entry = null; // { snapshot, fetchedAt }
    this.error = null;
    this.loading = false;
    this.published = "";

    cx.timer.every(1500, (cx) => this.tick(cx));
    cx.timer.every(60_000, (cx) => cx.notify()); // the reset countdown
    cx.timer.every(POLL_MS, (cx) => cx.spawn((cx) => this.fetch(cx, POLL_MS)));
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        // A replaced build's loop throws here, before it acts, rather than
        // living on beside the new one (openOverlay never touches cx).
        cx.notify();
        if (command === "refresh") cx.spawn((cx) => this.fetch(cx, 0));
        else if (command === "popup" && this.target) this.openPopup();
      }
    });
    this.tick(cx);
  }

  // Focus and agent status are live data; this only compares them, and works
  // when the focused agent changes or stops working.
  tick(cx) {
    const agent = focusedAgent();
    const address = agent?.address ?? null;
    const wasWorking = this.status === "working";
    this.status = agent?.status ?? null;
    if (address !== this.address) {
      this.address = address;
      this.select(cx, agent, ON_FOCUS_MS);
    } else if (agent && wasWorking && agent.status !== "working") {
      // The model may have changed with the turn: look it up again.
      this.select(cx, agent, ON_IDLE_MS);
    }
  }

  select(cx, agent, maxAge) {
    const generation = ++this.generation;
    cx.spawn(async (cx) => {
      const cwd = agent ? panes().find((p) => p.terminal === agent.address)?.cwd : undefined;
      const target = agent ? await usage.resolveAgent(agent, cwd) : undefined;
      const auth = target ? await usage.loadLogin(target) : undefined;
      if (generation !== this.generation) return;
      const key = target ? (auth?.key ?? `${target.provider}-none`) : null;
      if (key !== this.target?.key) {
        const entry = auth ? await usage.readCache(auth.key) : undefined;
        if (generation !== this.generation) return;
        this.entry = entry ?? null;
        this.error = target && !auth ? "Not logged in" : null;
      }
      this.target = target ? { ...target, label: usage.LABELS[target.provider], key, auth } : null;
      this.publish();
      cx.notify();
      if (this.target) await this.fetch(cx, maxAge);
    });
  }

  async fetch(cx, maxAge) {
    const target = this.target;
    if (!target || this.loading) return;
    if (this.entry && Date.now() - this.entry.fetchedAt < maxAge) return;
    // The harness may have renewed its token since: read it again.
    const auth = await usage.loadLogin(target);
    if (this.target !== target) return;
    if (!auth) return this.fail(cx, "Not logged in");
    if (auth.key !== target.key) return; // another account now: the next select handles it
    if (auth.expiresAt && auth.expiresAt <= Date.now()) return this.fail(cx, "Login expired");

    this.loading = true;
    this.publish();
    cx.notify();
    try {
      const entry = { snapshot: await usage.fetchUsage(target.provider, auth), fetchedAt: Date.now() };
      await usage.writeCache(auth.key, entry);
      if (this.target?.key === auth.key) {
        this.entry = entry;
        this.error = null;
      }
    } catch (error) {
      if (this.target?.key === auth.key) this.error = error instanceof Error ? error.message : String(error);
    }
    this.loading = false;
    this.publish();
    cx.notify();
  }

  fail(cx, message) {
    this.error = message;
    this.publish();
    cx.notify();
  }

  // What the popup draws. Never the token.
  publish() {
    const view = this.target
      ? { label: this.target.label, entry: this.entry, error: this.error, loading: this.loading }
      : null;
    const text = JSON.stringify(view);
    if (text === this.published) return;
    this.published = text;
    setShared(VIEW, view);
  }

  openPopup() {
    const count = this.entry?.snapshot?.windows?.length ?? 0;
    openOverlay({ mod: "usage", kind: "popup", props: { popup: true }, width: 300, height: 120 + Math.max(1, count) * 62 });
  }

  render() {
    if (props()?.popup) return this.renderPopup();
    const t = theme();
    const root = v_flex().id("usage").size_full().bg(t.chrome).border_t(1).border_color(t.border).justify_center();
    if (!this.target) return root;

    const win = usage.mainWindow(this.entry?.snapshot);
    const remaining = win ? 100 - win.usedPercent : 0;
    // A failed or expired fetch keeps the last value, dimmed.
    const color = !win || this.error ? t.dim : usage.barColor(remaining, t);
    const name = win ? `${this.target.label} · ${usage.windowName(win.seconds)}` : this.target.label;
    const reset = win?.resetsAt ? usage.countdown(win.resetsAt) : "";
    const tip = [name, win ? `${Math.round(remaining)} % left` : "", reset && `resets in ${reset}`, this.error ?? ""]
      .filter(Boolean).join(" · ");

    const clickable = (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => this.openPopup());

    if (narrow()) {
      return clickable(root.px(8).tooltip(tip).child(bar(remaining, color, t)));
    }
    const right = win
      ? h_flex().gap(6).child(div().text_color(color).child(`${Math.round(remaining)} %`))
        .when(Boolean(reset), (el) => el.child(div().text_color(t.dim).child(reset)))
      : div().text_color(t.dim).child(this.error ?? (this.loading ? "…" : "—"));
    return clickable(root.px(16).gap(6).text_size(12).tooltip(tip)
      .child(h_flex().justify_between().items_center()
        .child(div().text_color(this.error ? t.dim : t.muted).truncate().child(name))
        .child(right))
      .child(bar(remaining, color, t)));
  }

  renderPopup() {
    const t = theme();
    const view = /** @type {any} */ (shared(VIEW));
    const root = v_flex().id("usage-popup").size_full().p(14).gap(12).text_size(12.5);
    if (!view) return root.child(div().text_color(t.muted).child("No agent in focus"));

    const snapshot = view.entry?.snapshot;
    const meta = [snapshot?.plan, snapshot?.email ? usage.maskEmail(snapshot.email) : null].filter(Boolean).join(" · ");
    const windows = (snapshot?.windows ?? []).map((w, i) => {
      const remaining = 100 - w.usedPercent;
      const color = view.error ? t.dim : usage.barColor(remaining, t);
      const reset = w.resetsAt ? `resets in ${usage.countdown(w.resetsAt)}` : "no reset time";
      return v_flex().id(`window-${i}`).gap(4)
        .child(h_flex().justify_between()
          .child(div().text_color(t.foreground).child(`${w.label} · ${usage.windowName(w.seconds)}`))
          .child(div().text_color(color).child(`${Math.round(remaining)} % left`)))
        .child(bar(remaining, color, t))
        .child(div().text_size(11).text_color(t.dim).child(reset));
    });
    const status = view.loading
      ? "Refreshing…"
      : [view.entry ? `Updated ${usage.age(view.entry.fetchedAt)}` : "No data yet", view.error].filter(Boolean).join(" · ");
    const icon = svg("mods/usage/refresh.svg").size(14);

    return root
      .child(h_flex().justify_between().items_start().gap(8)
        .child(v_flex().flex_1().gap(2)
          .child(div().font_semibold().text_color(t.foreground).child(view.label))
          .when(Boolean(meta), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(meta))))
        .child(div().id("usage-refresh").size(24).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Refresh")
          .on_click(() => run("usage.refresh"))
          .child(view.loading ? icon.spin(900) : icon)))
      .child(v_flex().flex_1().gap(12).children(windows))
      .child(div().truncate().text_size(11.5).text_color(view.error ? t.ansi1 : t.dim).child(status));
  }
}
