import { View, div, svg } from "gpui-kit";
import { Button, h_flex, v_flex } from "gpui-base";
import { exec, hc, panes, run, spaces, theme } from "herdr";
import { taskEntries } from "./data.js";

export default class Tasks extends View {
  init(_props, cx) {
    this.hidden = JSON.parse(localStorage.getItem("hidden") || "[]");
    this.logs = {};
    this.sources = {};
    cx.timer.every(2000, (cx) => {
      const task = taskEntries().find((t) => t.address === this.selected);
      if (task && (task.active || this.sources[task.address] !== (task.log || task.state))) this.readLog(task.address, cx);
    });
  }

  readLog(address, cx) {
    if (this.reading) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      try {
        const task = taskEntries().find((t) => t.address === address);
        const result = task?.log
          ? await exec("tail", ["-n", "100", "--", task.log], { on: address.includes("/") ? address.split("/")[0] : null })
          : await hc(["read", address, "--lines", "100"]);
        if (result.code !== 0) throw new Error(result.stderr || "Cannot read task output.");
        this.logs[address] = result.stdout || "No output yet.";
        this.sources[address] = task?.log || task?.state;
      }
      catch (error) { this.logs[address] = String(error); }
      finally { this.reading = false; cx.notify(); }
    });
  }

  open(task, cx) {
    const machine = task.address.includes("/") ? task.address.split("/")[0] : null;
    const existing = spaces().find((s) => {
      if ((s.machine ?? null) !== machine) return false;
      const tabs = new Set(s.tabs.map((t) => t.id));
      const cwd = panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
      return task.path && (cwd === task.path || cwd?.startsWith(`${task.path}/`));
    });
    if (task.state === "finished") {
      if (existing) run("space.select", { id: existing.id });
      else if (task.path) run("space.new", { folder: task.path, machine: machine ?? "" });
      return;
    }
    if (task.labels["task.kind"] !== "worktree") return run("terminal.peek", { terminal: task.address });
    this.opening = task.address;
    cx.spawn(async (cx) => {
      try {
        if (!task.labels["herdr.space"]) {
          const id = `${task.address.replaceAll("/", "-")}-${task.created_ms}`;
          const space = existing?.id.split("/").at(-1) ?? `sp-task-${id}`;
          await hc(["label", task.address, `herdr.space=${space}`, `herdr.tab=tb-task-${id}`]);
        }
      } catch (error) {
        this.logs[task.address] = String(error);
        this.selected = task.address;
        if (this.opening === task.address) this.opening = null;
      }
      cx.notify();
    });
  }

  render() {
    // Adoption arrives through live app data, not necessarily with the label reply.
    if (this.opening && panes().some((p) => p.terminal === this.opening)) {
      run("agent.focus", { terminal: this.opening });
      this.opening = null;
    }
    const t = theme();
    const tasks = taskEntries().filter((task) => !this.hidden.includes(task.address));
    const button = (id, text, click) => Button.new(id).px(8).py(4).rounded(5).bg(t.raised).text_size(11).text_color(t.foreground).cursor_pointer().on_click((_e, cx) => click(cx)).child(text);
    return v_flex().id("tasks").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/workspace-chrome/layers.svg").size(14)).child(div().font_semibold().child("Tasks")))
      .child(v_flex().id("task-list").flex_1().min_h(0).p(10).gap(10).overflow_y_scrollbar()
        .when(!tasks.length, (el) => el.child(div().p(12).text_size(12).text_color(t.muted).child("No background tasks.")))
        .children(tasks.map((task) => {
          let status = task.branch || "Ready";
          if (task.active) status = task.labels["task.kind"] === "worktree" ? "Setting up and naming…" : "Running…";
          if (task.failed) status = `Failed (exit ${task.exit_code ?? "unknown"})`;
          return v_flex().gap(6).p(10).rounded(8).border(1).border_color(t.border).bg(t.surface)
          .child(h_flex().gap(7).items_center()
            .child(svg(`mods/workspace-chrome/${task.active ? "spinner" : task.failed ? "x" : "circle-check"}.svg`).size(13).text_color(task.failed ? t.blocked : t.muted).when(task.active, (el) => el.spin(900)))
            .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().child(task.title)))
          .child(div().text_size(11).text_color(task.failed ? t.blocked : t.muted).child(task.error || task.warning || status))
          .when(Boolean(task.path), (el) => el.child(div().truncate().text_size(10.5).text_color(t.dim).tooltip(task.path).child(task.path)))
          .child(h_flex().gap(6)
            .when(!task.active && !task.failed && (Boolean(task.path) || task.state !== "finished"), (el) => el.child(button(`open-${task.address}`, "Open", (cx) => this.open(task, cx))))
            .child(button(`logs-${task.address}`, this.selected === task.address ? "Hide logs" : "Logs", (cx) => {
              this.selected = this.selected === task.address ? null : task.address;
              if (this.selected) this.readLog(this.selected, cx);
              cx.notify();
            }))
            .when(!task.active, (el) => el.child(button(`dismiss-${task.address}`, "Dismiss", (cx) => {
              this.hidden.push(task.address); localStorage.setItem("hidden", JSON.stringify(this.hidden)); cx.notify();
            }))))
          .when(this.selected === task.address, (el) => el.child(div().id(`task-output-${task.address}`).max_h(300).overflow_y_scrollbar().p(8).rounded(5).bg(t.background).text_size(10.5).font_family("JetBrains Mono").child(this.logs[task.address] || "Loading output…")));
        })));
  }
}
