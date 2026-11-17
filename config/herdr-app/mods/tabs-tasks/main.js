import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, setShared, layout, settings, terminals, notify, hc } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    this.taskSeen = JSON.parse(localStorage.getItem("task-notices") || "{}");
    cx.timer.every(1000, (cx) => this.syncTasks(cx));
    this.syncTasks(cx);
  }

  syncTasks(cx) {
    if (this.syncingTasks) return;
    this.syncingTasks = true;
    cx.spawn(async (cx) => {
      try {
        const isActive = (task) => task.state !== "finished" && !["ready", "failed"].includes(task.labels?.["task.state"]);
        const records = { ...(shared("tasks.records") || {}) };
        const live = terminals().filter((task) => task.labels?.["task.kind"]);
        for (const task of live) records[task.address] = { ...records[task.address],
          address: task.address, name: task.name, created_ms: task.created_ms ?? records[task.address]?.created_ms ?? Date.now(),
          state: task.state, exit_code: task.exit_code, labels: task.labels,
        };
        for (const task of Object.values(records)) {
          if (task.state === "finished" || live.some((t) => t.address === task.address)) continue;
          try {
            const result = await hc(["get", task.address, "--json"]);
            if (result.code !== 0) throw new Error(result.stderr || "Cannot read task status.");
            const final = JSON.parse(result.stdout);
            records[task.address] = { ...task, state: final.state, exit_code: final.exit_code, labels: final.labels || task.labels };
          } catch (error) {
            records[task.address] = { ...task, labels: { ...task.labels, "task.warning": `Status unavailable: ${error}` } };
          }
        }
        const next = { ...(shared("tasks.records") || {}), ...records };
        if (JSON.stringify(next) !== JSON.stringify(shared("tasks.records") || {})) setShared("tasks.records", next);
        // The Tasks panel never opens or closes by itself: the Tasks (n) counter shows progress.
        for (const task of Object.values(next)) {
          const labels = task.labels || {};
          if (!labels["task.kind"] || this.taskSeen[task.address] || (!["ready", "failed"].includes(labels["task.state"]) && task.state !== "finished")) continue;
          const failed = labels["task.state"] === "failed" || (task.state === "finished" && task.exit_code !== 0);
          this.taskSeen[task.address] = true;
          localStorage.setItem("task-notices", JSON.stringify(this.taskSeen));
          // A launcher's follow-up commands (e.g. close the removed worktree's spaces) run once, on success.
          if (task.onSuccess) {
            if (!failed) for (const c of task.onSuccess) run(c.name, c.args);
            const { onSuccess: _done, ...rest } = task;
            setShared("tasks.records", { ...(shared("tasks.records") || {}), [task.address]: rest });
          }
          notify({ title: failed ? "Background task failed" : "Background task ready",
            body: labels["task.error"] || labels["task.warning"] || labels["task.branch"] || labels["task.title"] || task.name || "Background task", level: failed ? "error" : "info",
            ...(task.state !== "finished" ? { action: { name: "terminal.peek", args: { terminal: task.address } } } : {}) });
        }
      } finally {
        this.syncingTasks = false;
      }
    });
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = [...(shared("workspace.panels") ?? ["files", "changes"]), "tasks"];
    const running = Object.values(shared("tasks.records") || {}).filter((task) => !["ready", "failed"].includes(task.labels["task.state"]) && task.state !== "finished").length;
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .child(panelButton("tasks", `Tasks${running ? ` (${running})` : ""}`, "mods/workspace-chrome/layers.svg"))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs-tasks/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs-tasks/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs-tasks/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
