// Automations: prompts and scripts that run on a schedule or on request. A card in the
// right panel, beside Tasks: the list, the form (form.js) and the results of each run.
// The copy with props.poll floats over the window and draws nothing: it starts the runs
// that are due and notifies when they end. So the schedule needs the Herdr window, but
// a started run lives in herdr-core until it ends (runner.py).

import { View, div, svg } from "gpui-kit";
import { Button, Switch, TextView, h_flex, v_flex } from "gpui-base";
import { focused, layout, nextCommand, notify, playSound, props, run, setShared, settings, shared, theme } from "herdr";
import { describe, matches, parse, upcoming, when } from "./cron.js";
import { HARNESSES, agentSignature, agentStatus, agentTerminal, agentTerminals, busyAgent, changeAutomations, deleteAutomation, liveRuns, loadAutomations, loadOutput, loadRuns, markSeen, openAgent, removeTerminal, start, stop, terminalKey, tilde } from "./data.js";
import { Form, harnessIcon } from "./form.js";

const ICON = (name) => `mods/workspace-chrome/${name}.svg`;
const OWN = "mods/automations/timer.svg";
const FAILED = ["failed", "timeout", "interrupted"];
const bad = (r) => (r.agent ? ["blocked", "error"].includes(r.agent) : FAILED.includes(r.state));
const outputKey = (r) => `${r.id} ${r.state} ${r.agent ?? ""}`;
const sound = (name) => { if (settings().sounds?.enabled !== false) playSound(name); };
const message = (error) => String(error?.message ?? error);

function duration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// An agent's words, as in Spaces.
const AGENT_STATES = { blocked: "Needs input", working: "Working", done: "Finished", idle: "Idle", error: "Error", starting: "Starting" };

function stateText(r) {
  if (AGENT_STATES[r.agent]) return AGENT_STATES[r.agent];
  return {
    running: "Running…", done: r.kind === "prompt" ? "Finished" : "Succeeded", stopped: "Stopped", timeout: "Time limit reached", interrupted: "Interrupted",
    skipped: "Skipped: a run was active", failed: r.exit_code ? `Failed (exit ${r.exit_code})` : "Failed",
  }[r.state] ?? r.state;
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Automations extends View {
  init(_props, cx) {
    this.polls = Boolean(props()?.poll);
    if (this.polls) return this.initPoll(cx);
    this.page = "list"; // "list", "form", "runs" or "run"
    this.opened = shared("automations.opened");
    this.list = null;
    this.runs = {};
    this.error = "";
    this.form = new Form(cx);
    cx.bind_keys([["tab", "auto_tab"], ["shift-tab", "auto_shift_tab"], ["escape", "auto_escape"], ["ctrl-enter", "auto_save"]]
      .flatMap(([keystroke, action]) => ["Automations", "Automations > Input"].map((context) => ({ keystroke, action, context })))
      .concat(["up", "down", "enter"].map((keystroke) => ({ keystroke, action: `auto_${keystroke}`, context: "AutoChoice > Input" }))));
    this.minute = 0;
    this.again = 0;
    cx.timer.every(2000, (cx) => this.follow(cx));
    this.follow(cx);
  }

  // ---- the floating copy: schedule and notifications -------------------------------

  initPoll(cx) {
    this.minute = 0;
    cx.timer.every(5000, (cx) => {
      this.schedule(cx);
      this.settle(cx);
      this.ask(cx);
    });
    cx.spawn(async () => {
      for (;;) {
        if (await nextCommand() !== "show") continue;
        const panel = find(layout(), "panel");
        if (panel?.hidden || find(panel, "panel-body")?.active !== "automations") setShared("automations.opened", Date.now());
        run("layout.select", { stack: "panel-body", child: "automations" });
        run("layout.show", { id: "panel" });
      }
    });
  }

  // Only the current minute counts: one that passed while the computer slept is skipped.
  schedule(cx) {
    const now = Date.now(), minute = Math.floor(now / 60_000);
    if (minute === this.minute) return;
    this.minute = minute;
    cx.spawn(async () => {
      let due = [];
      try {
        due = (await loadAutomations()).filter((a) => {
          try { return a.active && a.cron && matches(parse(a.cron), new Date(now)); }
          catch { return false; }
        });
      } catch (error) {
        console.log(`automations: ${message(error)}`); // the card shows it
      }
      for (const a of due) {
        try { await start(a, "schedule", now); }
        catch (error) { notify({ title: `Cannot start ${a.name}`, body: message(error), level: "error" }); }
      }
    });
  }

  // Agents that need the person: Herdr itself notifies only for agents in a tab.
  ask(cx) {
    const asking = agentTerminals().filter((t) => t.status === "blocked" && !t.labels["herdr.space"]);
    const fresh = asking.filter((t) => !this.asking?.has(t.address));
    this.asking = new Set(asking.map((t) => t.address));
    if (!fresh.length) return;
    cx.spawn(async () => {
      const list = await loadAutomations().catch(() => []);
      for (const t of fresh) {
        const automation = list.find((a) => a.id === t.labels["automation.agent"]);
        if (!automation || automation.notify === "never") continue;
        notify({ title: `${automation.name}: ${AGENT_STATES.blocked}`, body: t.report?.msg ?? "", level: "warning", action: { name: "terminal.peek", args: { terminal: t.address } } });
        sound("blocked");
      }
    });
  }

  // Runs that ended: notify as each automation asks, and remove their terminals.
  settle(cx) {
    const pending = Object.entries(shared("automations.pending") ?? {});
    const live = new Set(liveRuns().map(terminalKey));
    const ended = pending.filter(([key]) => !live.has(key));
    if (this.settling || !ended.length) return;
    this.settling = true;
    cx.spawn(async () => {
      try {
        const [list, runs] = await Promise.all([loadAutomations(), loadRuns()]);
        for (const [key, { at, address }] of ended) {
          const [id, name] = key.split("/");
          const automation = list.find((a) => a.id === id);
          const result = runs[id]?.find((r) => r.id === name);
          // The terminal list can be late: keep a run that has no final state yet.
          if (automation && (result ? result.state === "running" : Date.now() - at < 60_000)) continue;
          const { [key]: _done, ...rest } = shared("automations.pending") ?? {};
          setShared("automations.pending", rest);
          await removeTerminal(address);
          if (automation && result) await this.announce(automation, result);
        }
      } catch (error) {
        console.log(`automations: ${message(error)}`);
      } finally {
        this.settling = false;
      }
    });
  }

  async announce(automation, result) {
    const failed = FAILED.includes(result.state);
    if (!failed && result.state !== "done") return;
    if (automation.notify === "never" || (automation.notify === "failure" && !failed)) return;
    const { answer, log } = await loadOutput(automation.id, result.id);
    const body = result.error || (!failed && answer) || log.split("\n").at(-1) || `Run time: ${duration(result.finished - result.started)}`;
    notify({ title: `${automation.name}: ${stateText(result)}`, body: body.slice(0, 200), level: failed ? "error" : "success", action: { name: "automations.show" } });
    if (automation.kind === "prompt") sound(failed ? "blocked" : "done");
  }

  // ---- the card: data ----------------------------------------------------------------

  // Reads the files again when a run started or ended, and each minute (the next runs change).
  follow(cx) {
    const minute = Math.floor(Date.now() / 60_000);
    const signature = JSON.stringify([liveRuns().map(terminalKey).sort(), agentSignature(), Object.keys(shared("automations.pending") ?? {}).sort()]);
    if (signature !== this.signature) this.again = 2; // a run's files come just after its terminal
    if (this.again > 0 || minute !== this.minute) this.reload(cx);
    this.again = Math.max(0, this.again - 1);
    Object.assign(this, { signature, minute });
    this.ticks = (this.ticks ?? 0) + 1;
    const result = this.page === "run" && this.result();
    const moving = result && ["running", "working"].includes(result.agent ?? result.state);
    if (result && (moving ? this.ticks % 2 === 0 : this.outputOf !== outputKey(result))) this.readOutput(cx);
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      try {
        [this.list, this.runs] = await Promise.all([loadAutomations(), loadRuns()]);
        if (!["list", "form"].includes(this.page) && !this.automation()) this.page = "list";
        this.error = "";
      } catch (error) {
        this.list ??= [];
        this.error = message(error);
      }
      cx.notify();
    });
  }

  readOutput(cx) {
    const { id } = this, result = this.result();
    if (!result || this.reading) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      try {
        const output = await loadOutput(id, result.id);
        if (this.id === id && this.name === result.id) [this.output, this.outputOf] = [output, outputKey(result)];
      } catch (error) {
        this.error = message(error);
      } finally {
        this.reading = false;
      }
      cx.notify();
    });
  }

  automation() { return this.list?.find((a) => a.id === this.id); }
  // A run with its agent's live status, if its agent is there.
  seen(id, r) {
    const terminal = r.kind === "prompt" && agentTerminal(id, r.id);
    return terminal ? { ...r, agent: agentStatus(terminal), ask: terminal.status === "blocked" ? terminal.report?.msg : "" } : r;
  }
  results(id) { return (this.runs[id] ?? []).map((r) => this.seen(id, r)); }
  result() { return this.results(this.id).find((r) => r.id === this.name); }
  active(id) { return liveRuns().some((t) => t.labels["automation.id"] === id) || Boolean(busyAgent(id)) || this.runs[id]?.some((r) => r.state === "running"); }

  // An action that changes something: shows its error in the card.
  act(cx, action) {
    this.error = "";
    cx.spawn(async (cx) => {
      try { await action(cx); }
      catch (error) { this.error = message(error); }
      cx.notify();
    });
    cx.notify();
  }

  go(page, cx) {
    this.page = page;
    this.error = "";
    cx.notify();
  }

  // The card lives on while it is hidden: opening it again starts at the list.
  restart() {
    const opened = shared("automations.opened");
    if (opened === this.opened) return;
    Object.assign(this, { opened, page: "list", back: "list", error: "" });
  }

  showRun(result, cx) {
    Object.assign(this, { name: result.id, output: null, outputOf: "", showLog: false });
    this.go("run", cx);
    this.readOutput(cx);
    if (result.agent === "done") markSeen(agentTerminal(this.id, result.id));
  }

  openForm(automation, cx) {
    this.back = this.page;
    this.go("form", cx);
    this.form.open(automation, cx);
  }

  closeForm(cx) {
    this.go(this.back === "runs" && this.automation() ? "runs" : "list", cx);
    const pane = focused()?.pane;
    if (pane) run("pane.focus", { pane });
  }

  save(cx) {
    if (this.page !== "form" || this.saving) return;
    let values;
    try {
      values = this.form.result();
    } catch (error) {
      this.form.error = message(error);
      return cx.notify();
    }
    const old = this.form.automation;
    const id = old?.id ?? `a${Date.now().toString(36)}`;
    this.saving = true;
    cx.spawn(async (cx) => {
      try {
        this.list = await changeAutomations((list) => old
          ? list.map((a) => (a.id === id ? { id, active: a.active, ...values } : a))
          : [...list, { id, active: true, ...values }]);
        this.closeForm(cx);
      } catch (error) {
        this.form.error = message(error);
      } finally {
        this.saving = false;
      }
      cx.notify();
    });
  }

  remove(cx) {
    if (!this.form.deleting) {
      this.form.deleting = true;
      return cx.notify();
    }
    this.form.deleting = false;
    cx.spawn(async (cx) => {
      try {
        this.list = await deleteAutomation(this.form.automation.id);
        this.closeForm(cx);
      } catch (error) {
        this.form.error = message(error);
      }
      cx.notify();
    });
  }

  setActive(automation, active, cx) {
    this.act(cx, async () => {
      this.list = await changeAutomations((list) => list.map((a) => (a.id === automation.id ? { ...a, active } : a)));
    });
  }

  runNow(automation, cx) {
    this.act(cx, async () => {
      await start(automation, "manual");
      this.again = 2;
    });
  }

  stopRun(id, cx) {
    this.act(cx, async () => {
      // Until the list has the new run, its terminal is the only sign of it.
      const terminal = liveRuns().find((t) => t.labels["automation.id"] === id) ?? busyAgent(id);
      const name = this.runs[id]?.find((r) => r.state === "running")?.id ?? terminal?.labels["automation.run"];
      if (name) await stop(id, name);
    });
  }

  escape(cx) {
    if (this.page !== "form") return;
    if (!this.form.escape(cx)) this.closeForm(cx);
  }

  // ---- the card: view ------------------------------------------------------------------

  // kind: "primary", "danger" or "" (the plain button of Tasks).
  button(t, id, text, click, { kind = "", disabled = false } = {}) {
    const [bg, fg] = { primary: [t.solid, t.solid_foreground], danger: [t.blocked, t.background] }[kind] ?? [t.raised, t.foreground];
    return Button.new(id).px(8).py(4).rounded(5).bg(bg).text_size(11).text_color(fg).disabled(disabled)
      .when(disabled, (el) => el.opacity(0.45))
      .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => click(cx)))
      .child(text);
  }

  toggle(t, automation) {
    const on = automation.active;
    const label = on ? "Active: select to pause" : "Paused: select to resume";
    return div().flex_none().id(`tip-${automation.id}`).tooltip(label)
      .child(Switch.new(`active-${automation.id}`).checked(on).accessibility_label(`${automation.name}: ${on ? "active" : "paused"}`)
        .w(30).h(17).rounded(9).p(2).flex().cursor_pointer().bg(on ? t.accent : t.hover).when(on, (el) => el.justify_end())
        .on_change((active, cx) => this.setActive(automation, active, cx))
        .child(div().size(13).rounded(7).bg(on ? t.accent_foreground : t.muted)));
  }

  kindIcon(automation, size, t) {
    return automation.kind === "script" ? svg(ICON("terminal")).size(size).flex_none().text_color(t.muted) : harnessIcon(automation.harness).size(size);
  }

  stateIcon(r, size, t) {
    const agent = { working: [ICON("spinner"), t.working], starting: [ICON("spinner"), t.dim], blocked: ["mods/spaces-pr/circle-alert.svg", t.blocked],
      error: [ICON("x"), t.blocked], done: [ICON("circle-check"), t.done], idle: [ICON("circle-check"), t.dim] }[r.agent];
    if (agent) return svg(agent[0]).size(size).flex_none().text_color(agent[1]).when(["working", "starting"].includes(r.agent), (el) => el.spin(900));
    const [icon, color] = r.state === "running" ? ["spinner", t.working] : r.state === "done" ? ["circle-check", t.ansi2]
      : FAILED.includes(r.state) ? ["x", t.blocked] : r.state === "stopped" ? ["square", t.muted] : ["minus", t.dim];
    return svg(ICON(icon)).size(size).flex_none().text_color(color).when(r.state === "running", (el) => el.spin(900));
  }

  nextText(automation) {
    if (!automation.cron) return "";
    if (!automation.active) return "Paused";
    try {
      const [next] = upcoming(parse(automation.cron), new Date());
      return next ? `Next: ${when(next)}` : "";
    } catch {
      return "Invalid schedule";
    }
  }

  runOrStop(automation, t) {
    return this.active(automation.id)
      ? this.button(t, `stop-${automation.id}`, "Stop", (cx) => this.stopRun(automation.id, cx))
      : this.button(t, `run-${automation.id}`, "Run now", (cx) => this.runNow(automation, cx));
  }

  header(t) {
    const title = { list: "Automations", form: this.form.automation ? "Edit automation" : "New automation" }[this.page] ?? this.automation()?.name ?? "";
    const back = (cx) => this.page === "form" ? this.closeForm(cx) : this.go(this.page === "run" ? "runs" : "list", cx);
    const automation = this.automation();
    return h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .when(this.page === "list", (el) => el.child(svg(OWN).size(14).flex_none()))
      .when(this.page !== "list", (el) => el.child(Button.new("auto-back").size(22).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
        .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).accessibility_label("Back").tooltip("Back")
        .on_click((_e, cx) => back(cx)).child(svg(ICON("chevron-left")).size(14))))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(title))
      .when(this.page === "list", (el) => el.child(this.button(t, "auto-new", "New", (cx) => this.openForm(null, cx))))
      .when(this.page === "runs" && Boolean(automation), (el) => el.child(this.runOrStop(automation, t))
        .child(this.button(t, "auto-edit", "Edit", (cx) => this.openForm(automation, cx))));
  }

  card(automation, t) {
    const runs = this.results(automation.id);
    const last = runs.find((r) => r.state === "running" || ["working", "blocked"].includes(r.agent)) ?? runs[0];
    const next = this.nextText(automation);
    return v_flex().gap(6).p(10).rounded(8).border(1).border_color(t.border).bg(t.surface)
      .child(h_flex().gap(7).items_center()
        .child(this.kindIcon(automation, 13, t))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().text_color(automation.active ? t.foreground : t.muted).child(automation.name))
        .when(Boolean(automation.cron), (el) => el.child(this.toggle(t, automation))))
      .child(div().text_size(11).text_color(t.muted).child([describe(automation.cron), next].filter(Boolean).join(" · ")))
      .when(Boolean(last), (el) => el.child(h_flex().gap(6).items_center().text_size(11).text_color(bad(last) ? t.blocked : t.muted)
        .child(this.stateIcon(last, 12, t))
        .child(div().flex_1().min_w(0).truncate().child(`${stateText(last)} · ${last.ask || when(new Date(last.started))}`))))
      .child(div().truncate().text_size(10.5).text_color(t.dim).tooltip(automation.folder).child(tilde(automation.folder)))
      .child(h_flex().gap(6)
        .when(last?.agent === "blocked", (el) => el.child(this.button(t, `answer-${automation.id}`, "Answer", () => openAgent(automation, last), { kind: "primary" })))
        .child(this.runOrStop(automation, t))
        .child(this.button(t, `results-${automation.id}`, "Results", (cx) => { this.id = automation.id; this.go("runs", cx); }))
        .child(this.button(t, `edit-${automation.id}`, "Edit", (cx) => { this.id = automation.id; this.openForm(automation, cx); })));
  }

  empty(t, title, icon = OWN) {
    return v_flex().flex_1().items_center().justify_center().gap(10).text_color(t.muted)
      .child(svg(icon).size(40).text_color(t.dim)).child(div().text_size(12).child(title));
  }

  listPage(t) {
    if (!this.list) return [];
    if (!this.list.length) return [this.empty(t, "No automations.")];
    return this.list.map((a) => this.card(a, t));
  }

  runsPage(t) {
    const runs = this.results(this.id);
    if (!runs.length) return [this.empty(t, "No runs.")];
    return runs.map((r) => h_flex().id(`result-${r.id}`).flex_none().gap(8).p(10).items_center().rounded(8).border(1).border_color(t.border).bg(t.surface)
      .when(r.state !== "skipped", (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.showRun(r, cx)))
      .child(this.stateIcon(r, 13, t))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_size(12).font_medium().child(when(new Date(r.started))))
        .child(div().truncate().text_size(11).text_color(bad(r) ? t.blocked : t.muted).child(
          [stateText(r), r.trigger === "manual" ? "Manual" : "Schedule", r.finished && r.state !== "skipped" ? duration(r.finished - r.started) : ""].filter(Boolean).join(" · "))))
      .when(r.state !== "skipped", (el) => el.child(svg(ICON("chevron-right")).size(13).flex_none().text_color(t.dim))));
  }

  runPage(t) {
    const r = this.result(), automation = this.automation();
    if (!r || !automation) return [this.empty(t, "This result was removed.")];
    const prompt = r.kind === "prompt", output = this.output;
    const markdown = prompt && !this.showLog && output?.answer;
    const details = [when(new Date(r.started)), r.finished ? duration(r.finished - r.started) : "", r.trigger === "manual" ? "Manual" : "Schedule",
      prompt ? HARNESSES[r.harness] : "", Number.isInteger(r.exit_code) ? `Exit ${r.exit_code}` : ""].filter(Boolean).join(" · ");
    const text = output ? (markdown || output.log || "No output.") : "Loading output…";
    const actions = [
      prompt && (r.agent || r.session) && this.button(t, "run-open", r.agent === "blocked" ? "Answer" : "Open", () => openAgent(automation, r), { kind: r.agent === "blocked" ? "primary" : "" }),
      (r.state === "running" || ["working", "blocked"].includes(r.agent)) && this.button(t, "run-stop", "Stop", (cx) => this.act(cx, () => stop(automation.id, r.id))),
      prompt && output?.answer && this.button(t, "run-log", this.showLog ? "Answer" : "Log", (cx) => { this.showLog = !this.showLog; cx.notify(); }),
    ].filter(Boolean);
    return [
      v_flex().flex_none().gap(6)
        .child(h_flex().gap(7).items_center().child(this.stateIcon(r, 13, t))
          .child(div().flex_1().text_size(12).font_medium().text_color(bad(r) ? t.blocked : t.foreground).child(stateText(r))))
        .child(div().text_size(11).text_color(t.muted).child(details))
        .when(Boolean(r.ask), (el) => el.child(div().text_size(11).text_color(t.blocked).child(r.ask)))
        .when(Boolean(r.error), (el) => el.child(div().text_size(11).text_color(t.blocked).child(r.error)))
        .when(actions.length > 0, (el) => el.child(h_flex().gap(6).children(actions))),
      div().id("run-output").flex_1().min_h(0).overflow_y_scrollbar().p(10).rounded(8).border(1).border_color(t.border).bg(t.surface)
        .when(Boolean(markdown), (el) => el.text_size(12).child(TextView.markdown(`answer-${r.id}`, text).selectable()))
        .when(!markdown, (el) => el.text_size(10.5).font_family(settings().font_family ?? "JetBrains Mono").child(text)),
    ];
  }

  footer(t) {
    const old = this.form.automation;
    const running = old && this.active(old.id);
    return v_flex().flex_none().px(14).py(10).gap(8).border_t(1).border_color(t.border)
      .when(Boolean(this.form.error), (el) => el.child(div().text_size(11).text_color(t.blocked).child(this.form.error)))
      .child(h_flex().gap(6)
        .when(Boolean(old), (el) => el.child(this.button(t, "auto-delete", this.form.deleting ? "Delete permanently" : "Delete", (cx) => this.remove(cx),
          { kind: this.form.deleting ? "danger" : "", disabled: running })))
        .child(div().flex_1())
        .child(this.button(t, "auto-cancel", "Cancel", (cx) => this.closeForm(cx)))
        .child(this.button(t, "auto-save", "Save", (cx) => this.save(cx), { kind: "primary", disabled: this.saving })));
  }

  render() {
    if (this.polls) return div();
    this.restart();
    const t = theme();
    const body = this.page === "form" ? [this.form.view(t)] : this.page === "runs" ? this.runsPage(t) : this.page === "run" ? this.runPage(t) : this.listPage(t);
    return v_flex().id("automations").key_context("Automations").size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_action("auto_tab", (_e, cx) => { if (this.page === "form") this.form.tab(1, cx); })
      .on_action("auto_shift_tab", (_e, cx) => { if (this.page === "form") this.form.tab(-1, cx); })
      .on_action("auto_escape", (_e, cx) => this.escape(cx))
      .on_action("auto_save", (_e, cx) => this.save(cx))
      .on_action("auto_up", (_e, cx) => this.form.key("up", cx))
      .on_action("auto_down", (_e, cx) => this.form.key("down", cx))
      .on_action("auto_enter", (_e, cx) => this.form.key("enter", cx))
      .child(this.header(t))
      .when(Boolean(this.error), (el) => el.child(div().flex_none().px(14).pt(10).text_size(11).text_color(t.blocked).child(this.error)))
      .child(v_flex().id(`auto-body-${this.page}`).flex_1().min_h(0).p(this.page === "form" ? 14 : 10).gap(10)
        .when(this.page !== "run", (el) => el.overflow_y_scrollbar()).children(body)) // one run's output scrolls by itself
      .when(this.page === "form", (el) => el.child(this.footer(t)));
  }
}
