// Derived from tintinweb/pi-subagents 0.19.0. See LICENSE.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { StringEnum, type Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  DefaultResourceLoader,
  getAgentDir,
  getMarkdownTheme,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  Markdown,
  matchesKey,
  Text,
  truncateToWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type KeybindingsManager,
  type TUI,
} from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

import {
  AgentPool,
  EFFORTS,
  MODELS,
  cleanupWorktree,
  createWorktree,
  latestAssistantResponse,
  transcriptForView,
  truncateResponse,
  validateAgentRequest,
  extractTextContent,
  type Effort,
  type ModelId,
  type TranscriptEntry,
  type Worktree,
} from "./state.ts";

const WIDGET_KEY = "subagents";
const NOTICE_TYPE = "subagent-completed";
const AGENT_TOOL = "Agent";
const RESULT_TOOL = "get_subagent_result";
const STEER_TOOL = "steer_subagent";
const SUBAGENT_TOOLS = new Set([AGENT_TOOL, RESULT_TOOL, STEER_TOOL]);
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const NOTICE_DELAY_MS = 200;
const CHILD_SHUTDOWN_TIMEOUT_MS = 3_000;

const childSessionContext = new AsyncLocalStorage<boolean>();

type AgentStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type Deferred = { promise: Promise<void>; resolve: () => void };

type AgentRecord = {
  id: string;
  description: string;
  prompt: string;
  nextPrompt: string;
  model: ModelId;
  resolvedModel: Model<any>;
  effort: Effort;
  background: boolean;
  isolation?: "worktree";
  context: ExtensionContext;
  status: AgentStatus;
  startedAt?: number;
  completedAt?: number;
  transcript: TranscriptEntry[];
  latestFinalText: string;
  responseText: string;
  activeTools: Map<string, string>;
  error?: string;
  session?: AgentSession;
  history: AgentSession["messages"];
  unsubscribe?: () => void;
  worktree?: Worktree;
  worktreeBranch?: string;
  worktreePath?: string;
  pendingSteers: string[];
  acceptingSteer: boolean;
  initialUserSeen: boolean;
  abortController: AbortController;
  done: Deferred;
  started: Deferred;
  settled: boolean;
  runNumber: number;
  consumed: boolean;
  lingerTurns: number;
};

type AgentParams = Static<typeof AgentSchema>;

const AgentSchema = Type.Object({
  prompt: Type.String({ description: "The self-contained task for the child." }),
  description: Type.String({ description: "Short label shown in /agents and completion notices." }),
  model: StringEnum(MODELS, { description: "Full provider/model ID." }),
  effort: StringEnum(EFFORTS, { description: "Reasoning effort for the selected model." }),
  run_in_background: Type.Optional(Type.Boolean({ description: "Default true. Set false to wait for the final response." })),
  resume: Type.Optional(Type.String({ description: "Completed agent ID to reactivate in its existing session." })),
  isolation: Type.Optional(StringEnum(["worktree"] as const, { description: "Create a strict isolated git worktree." })),
});

const ResultSchema = Type.Object({
  agent_id: Type.String({ description: "Agent ID returned by Agent." }),
  wait: Type.Optional(Type.Boolean({ description: "Wait for queued or running work to settle." })),
});

const SteerSchema = Type.Object({
  agent_id: Type.String({ description: "Running agent ID." }),
  message: Type.String({ description: "Instruction to inject into the running agent conversation." }),
});

function deferred(): Deferred {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve };
}

function elapsed(record: AgentRecord): string {
  const end = record.completedAt ?? Date.now();
  const start = record.startedAt ?? end;
  return `${((Math.max(0, end - start)) / 1_000).toFixed(1)}s`;
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error("Aborted"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Aborted"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

function bounded(text: string): string {
  return truncateResponse(text, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES);
}

function worktreeSummary(record: AgentRecord): string | undefined {
  if (record.worktreePath) return `Worktree preserved at ${record.worktreePath}.`;
  if (record.worktreeBranch) return `Changes saved to branch ${record.worktreeBranch}.`;
  return undefined;
}

function replayHistory(sessionManager: SessionManager, messages: AgentSession["messages"]): void {
  for (const message of messages) {
    if (message.role === "branchSummary" || message.role === "compactionSummary") {
      sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text: `Previous conversation summary:\n${message.summary}` }],
        timestamp: message.timestamp,
      });
    } else {
      sessionManager.appendMessage(message);
    }
  }
}

function activity(record: AgentRecord): string {
  if (record.activeTools.size) {
    const names = [...new Set(record.activeTools.values())];
    return names.length === 1 ? `${names[0]}…` : `${names.join(", ")}…`;
  }
  const line = record.responseText.split("\n").find((value) => value.trim())?.trim();
  return line ? `${line.slice(0, 80)}${line.length > 80 ? "…" : ""}` : "thinking…";
}

class AgentWidget implements Component {
  private frame = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly records: () => AgentRecord[],
  ) {
    this.timer = setInterval(() => {
      this.frame++;
      tui.requestRender();
    }, 80);
    this.timer.unref();
  }

  render(width: number): string[] {
    const records = this.records();
    const running = records.filter((record) => record.status === "running");
    const queued = records.filter((record) => record.status === "queued");
    const finished = records.filter((record) => !["queued", "running"].includes(record.status) && record.lingerTurns > 0);
    if (!running.length && !queued.length && !finished.length) return [];

    const runningLines = running.map((record) => [
      `${this.theme.fg("dim", "├─")} ${this.theme.fg("accent", SPINNER[this.frame % SPINNER.length]!)} ${this.theme.bold(record.description)} ${this.theme.fg("dim", `· ${elapsed(record)}`)}`,
      `${this.theme.fg("dim", "│")}    ${this.theme.fg("dim", `⎿  ${activity(record)}`)}`,
    ]);
    const queuedLine = queued.length
      ? `${this.theme.fg("dim", "├─")} ${this.theme.fg("muted", "◦")} ${this.theme.fg("dim", `${queued.length} queued`)}`
      : undefined;
    const finishedLines = finished.map((record) => {
      const icon = record.status === "completed"
        ? this.theme.fg("success", "✓")
        : record.status === "cancelled"
          ? this.theme.fg("dim", "■")
          : this.theme.fg("error", "✗");
      const suffix = record.error ? ` · ${record.error.slice(0, 60)}` : "";
      return `${this.theme.fg("dim", "├─")} ${icon} ${this.theme.fg("dim", record.description)} ${this.theme.fg("dim", `· ${elapsed(record)}${suffix}`)}`;
    });

    const lines = [this.theme.fg(running.length || queued.length ? "accent" : "dim", `${running.length || queued.length ? "●" : "○"} Agents`)];
    let budget = 11;
    const total = runningLines.length * 2 + finishedLines.length + (queuedLine ? 1 : 0);
    const needsOverflow = total > budget;
    if (needsOverflow) budget--;
    if (queuedLine) budget--;
    let hidden = 0;
    for (const pair of runningLines) {
      if (budget >= 2) { lines.push(...pair); budget -= 2; }
      else hidden++;
    }
    if (queuedLine) lines.push(queuedLine);
    for (const line of finishedLines) {
      if (budget > 0) { lines.push(line); budget--; }
      else hidden++;
    }
    if (needsOverflow) lines.push(`${this.theme.fg("dim", "└─")} ${this.theme.fg("dim", `+${hidden} more`)}`);

    if (!needsOverflow && lines.length > 1) {
      const last = lines.length - 1;
      lines[last] = lines[last]!.replace("├─", "└─");
      if (running.length && !queued.length && lines[last]!.includes("⎿")) {
        lines[last - 1] = lines[last - 1]!.replace("├─", "└─");
        lines[last] = lines[last]!.replace("│", " ");
      }
    }
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void {}
  dispose(): void { clearInterval(this.timer); }
}

type SelectKey = "tui.select.up" | "tui.select.down" | "tui.select.pageUp" | "tui.select.pageDown" | "tui.select.confirm" | "tui.select.cancel";

function keyMatches(keybindings: KeybindingsManager, data: string, id: SelectKey): boolean {
  return keybindings.matches(data, id);
}

class AgentList implements Component {
  private selected = 0;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly records: () => AgentRecord[],
    private readonly done: (id?: string) => void,
  ) {}

  handleInput(data: string): void {
    const records = this.records();
    if (keyMatches(this.keybindings, data, "tui.select.cancel") || matchesKey(data, "q") || matchesKey(data, Key.ctrl("c"))) return this.done();
    if (!records.length) return;
    if (keyMatches(this.keybindings, data, "tui.select.up") || matchesKey(data, "k")) this.selected = (this.selected - 1 + records.length) % records.length;
    else if (keyMatches(this.keybindings, data, "tui.select.down") || matchesKey(data, "j")) this.selected = (this.selected + 1) % records.length;
    else if (keyMatches(this.keybindings, data, "tui.select.pageUp")) this.selected = Math.max(0, this.selected - 10);
    else if (keyMatches(this.keybindings, data, "tui.select.pageDown")) this.selected = Math.min(records.length - 1, this.selected + 10);
    else if (keyMatches(this.keybindings, data, "tui.select.confirm")) return this.done(records[this.selected]!.id);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const records = this.records();
    this.selected = Math.min(this.selected, Math.max(0, records.length - 1));
    const height = Math.max(1, this.tui.terminal.rows - 4);
    const start = Math.max(0, Math.min(this.selected - Math.floor(height / 2), records.length - height));
    const lines = [this.theme.fg("accent", this.theme.bold("Agents")), ""];
    if (!records.length) lines.push(this.theme.fg("muted", "No agents in this session."));
    for (const [offset, record] of records.slice(start, start + height).entries()) {
      const index = start + offset;
      const line = `${index === this.selected ? "→" : " "} ${record.description} · ${record.status} · ${record.model} · ${elapsed(record)}`;
      lines.push(index === this.selected
        ? this.theme.bg("selectedBg", truncateToWidth(line, width, ""))
        : truncateToWidth(line, width, ""));
    }
    lines.push("", this.theme.fg("dim", "navigate · Enter open · Esc/q back"));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void {}
}

class AgentDetail implements Component, Focusable {
  private composer?: Input;
  private _focused = false;
  private stopArmed = false;
  private scrollOffset = 0;
  private autoScroll = true;
  private width = 80;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly record: AgentRecord,
    private readonly done: () => void,
    private readonly steer: (message: string) => void,
    private readonly cancel: () => void,
  ) {}

  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    if (this.composer) this.composer.focused = value;
  }

  handleInput(data: string): void {
    if (this.composer) {
      this.composer.handleInput(data);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, "q")) return this.done();
    if (matchesKey(data, Key.enter) && this.record.status === "running") {
      this.stopArmed = false;
      this.openComposer();
      return;
    }
    if (matchesKey(data, "x")) {
      if (this.record.status === "queued" || this.record.status === "running") {
        if (this.stopArmed) { this.stopArmed = false; this.cancel(); }
        else this.stopArmed = true;
        this.tui.requestRender();
      }
      return;
    }
    this.stopArmed = false;

    const total = this.history(this.width).length;
    const viewport = this.viewportHeight();
    const max = Math.max(0, total - viewport);
    const up = keyMatches(this.keybindings, data, "tui.select.up") || matchesKey(data, "k");
    const down = keyMatches(this.keybindings, data, "tui.select.down") || matchesKey(data, "j");
    const pageUp = keyMatches(this.keybindings, data, "tui.select.pageUp") || matchesKey(data, "shift+up");
    const pageDown = keyMatches(this.keybindings, data, "tui.select.pageDown") || matchesKey(data, "shift+down");
    if (up) { this.scrollOffset = Math.max(0, this.scrollOffset - 1); this.autoScroll = false; }
    else if (down) { this.scrollOffset = Math.min(max, this.scrollOffset + 1); this.autoScroll = this.scrollOffset === max; }
    else if (pageUp) { this.scrollOffset = Math.max(0, this.scrollOffset - viewport); this.autoScroll = false; }
    else if (pageDown) { this.scrollOffset = Math.min(max, this.scrollOffset + viewport); this.autoScroll = this.scrollOffset === max; }
    this.tui.requestRender();
  }

  render(width: number): string[] {
    this.width = Math.max(1, width);
    const history = this.history(width);
    const viewport = this.viewportHeight();
    const max = Math.max(0, history.length - viewport);
    if (this.autoScroll) this.scrollOffset = max;
    this.scrollOffset = Math.min(this.scrollOffset, max);
    const visible = history.slice(this.scrollOffset, this.scrollOffset + viewport);
    const header = `${this.theme.bold(this.record.description)} ${this.theme.fg("muted", `(${this.record.id} · ${this.record.status} · ${this.record.model})`)}`;
    const actions = this.record.status === "running"
      ? `${this.stopArmed ? "x again to STOP" : "Enter steer · x stop"} · `
      : this.record.status === "queued"
        ? `${this.stopArmed ? "x again to STOP" : "x stop"} · `
        : "";
    const composer = this.composer ? this.composer.render(width) : [];
    return [
      truncateToWidth(header, width, ""),
      this.theme.fg("borderMuted", "─".repeat(width)),
      ...visible,
      ...Array.from({ length: Math.max(0, viewport - visible.length) }, () => ""),
      this.theme.fg("borderMuted", "─".repeat(width)),
      ...composer,
      truncateToWidth(this.theme.fg("dim", `${actions}↑↓/jk scroll · PgUp/PgDn or Shift+↑↓ · Esc/ctrl+c/q close`), width, ""),
    ];
  }

  invalidate(): void {}

  private viewportHeight(): number {
    return Math.max(3, this.tui.terminal.rows - (this.composer ? 6 : 5));
  }

  private history(width: number): string[] {
    const lines: string[] = [];
    for (const entry of transcriptForView(this.record.prompt, this.record.transcript)) {
      if (lines.length) lines.push(this.theme.fg("dim", "───"));
      lines.push(entry.role === "user" ? this.theme.fg("accent", "[User]") : this.theme.bold("[Assistant]"));
      try {
        lines.push(...new Markdown(entry.text, 0, 0, getMarkdownTheme()).render(width));
      } catch {
        lines.push(...wrapTextWithAnsi(entry.text, width));
      }
    }
    if (this.record.status === "running") {
      const live = this.record.responseText.split("\n").find((value) => value.trim())?.trim() || "working…";
      lines.push("", truncateToWidth(this.theme.fg("accent", "▍ ") + this.theme.fg("dim", live), width, ""));
    }
    return lines.length ? lines.map((line) => truncateToWidth(line, width, "")) : [this.theme.fg("muted", "(waiting for first message...)")];
  }

  private openComposer(): void {
    const input = new Input();
    input.focused = this.focused;
    input.onSubmit = (value) => {
      const message = value.trim();
      this.composer = undefined;
      if (message) this.steer(message);
      this.tui.requestRender();
    };
    input.onEscape = () => { this.composer = undefined; this.tui.requestRender(); };
    this.composer = input;
    this.tui.requestRender();
  }
}

async function shutdownChildSession(session?: AgentSession): Promise<void> {
  try {
    const runner = session?.extensionRunner;
    if (runner?.hasHandlers("session_shutdown")) {
      await Promise.race([
        runner.emit({ type: "session_shutdown", reason: "quit" }),
        new Promise<void>((resolve) => setTimeout(resolve, CHILD_SHUTDOWN_TIMEOUT_MS).unref()),
      ]);
    }
  } catch {
    // A child extension cannot block shutdown of the parent.
  }
  try { session?.dispose(); } catch { /* ignore partial sessions */ }
}

export default function subagentsExtension(pi: ExtensionAPI): void {
  if (childSessionContext.getStore() === true) return;

  const records = new Map<string, AgentRecord>();
  const pool = new AgentPool();
  const notices = new Map<string, ReturnType<typeof setTimeout>>();
  const openTuis = new Set<TUI>();
  let context: ExtensionContext | undefined;
  let widgetRegistered = false;
  let widgetTui: TUI | undefined;
  let shuttingDown = false;

  const allRecords = () => [...records.values()];
  const widgetRecords = () => allRecords().filter((record) =>
    record.status === "queued" || record.status === "running" || record.lingerTurns > 0);

  const refresh = () => {
    for (const tui of openTuis) tui.requestRender();
    const visible = widgetRecords().length > 0;
    if (context?.mode !== "tui") return;
    if (visible && !widgetRegistered) {
      context.ui.setWidget(WIDGET_KEY, (tui, theme) => {
        widgetTui = tui;
        return new AgentWidget(tui, theme, widgetRecords);
      }, { placement: "aboveEditor" });
      widgetRegistered = true;
    } else if (!visible && widgetRegistered) {
      context.ui.setWidget(WIDGET_KEY, undefined);
      widgetRegistered = false;
      widgetTui = undefined;
    } else {
      widgetTui?.requestRender();
    }
  };

  const cancelNotice = (record: AgentRecord) => {
    record.consumed = true;
    const timer = notices.get(record.id);
    if (timer) clearTimeout(timer);
    notices.delete(record.id);
  };

  const scheduleNotice = (record: AgentRecord) => {
    if (!record.background || record.consumed || shuttingDown) return;
    const previous = notices.get(record.id);
    if (previous) clearTimeout(previous);
    notices.set(record.id, setTimeout(() => {
      notices.delete(record.id);
      if (record.consumed || shuttingDown) return;
      pi.sendMessage({
        customType: NOTICE_TYPE,
        content: `Description: ${record.description}\nAgent ID: ${record.id}`,
        display: true,
      }, { deliverAs: "followUp", triggerTurn: true });
    }, NOTICE_DELAY_MS));
  };

  const startQueued = (ids: string[]) => {
    for (const id of ids) {
      const record = records.get(id);
      if (record) void run(record, record.runNumber);
    }
    refresh();
  };

  async function settle(
    record: AgentRecord,
    runNumber: number,
    proposed: Exclude<AgentStatus, "queued" | "running">,
    error?: string,
  ): Promise<void> {
    if (record.runNumber !== runNumber || record.settled) return;
    record.settled = true;
    record.acceptingSteer = false;
    const finalStatus = record.status === "cancelled" ? "cancelled" : proposed;
    record.error = error;

    if (record.session) record.history = [...record.session.messages];
    if (record.worktree) {
      const worktree = record.worktree;
      const session = record.session;
      record.worktree = undefined;
      record.unsubscribe?.();
      record.unsubscribe = undefined;
      record.session = undefined;
      await shutdownChildSession(session);
      const result = await cleanupWorktree(pi, record.context.cwd, worktree, record.description);
      if (result.branch) record.worktreeBranch = result.branch;
      if (result.path) record.worktreePath = result.path;
      if (result.error) {
        record.error = `Worktree cleanup failed; edits were preserved at ${result.path}: ${result.error}`;
      }
    }

    record.status = record.worktreePath ? "failed" : finalStatus;
    record.completedAt = Date.now();
    record.lingerTurns = record.status === "completed" ? 1 : 2;
    if (!record.background) record.consumed = true;
    scheduleNotice(record);
    record.started.resolve();
    record.done.resolve();
    startQueued(pool.finish(record.id));
    refresh();
  }

  function watchSession(record: AgentRecord, session: AgentSession): void {
    record.unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      if (event.type === "message_start" && event.message.role === "assistant") {
        record.responseText = "";
        record.transcript.push({ role: "assistant", text: "" });
      } else if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        record.responseText += event.assistantMessageEvent.delta;
        const latest = record.transcript.at(-1);
        if (latest?.role === "assistant") latest.text += event.assistantMessageEvent.delta;
      } else if (event.type === "message_end") {
        if (event.message.role === "user") {
          const text = extractTextContent(event.message.content).trim();
          if (!record.initialUserSeen) record.initialUserSeen = true;
          else if (text) record.transcript.push({ role: "user", text });
        } else if (event.message.role === "assistant") {
          const text = extractTextContent(event.message.content).trim();
          const latest = record.transcript.at(-1);
          if (latest?.role === "assistant") latest.text = text;
          else record.transcript.push({ role: "assistant", text });
        }
      } else if (event.type === "tool_execution_start") {
        record.activeTools.set(event.toolCallId, event.toolName);
      } else if (event.type === "tool_execution_end") {
        record.activeTools.delete(event.toolCallId);
      }
      refresh();
    });
  }

  async function createChild(record: AgentRecord, cwd: string): Promise<AgentSession> {
    const agentDir = getAgentDir();
    const settingsManager = SettingsManager.create(cwd, agentDir);
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
    await childSessionContext.run(true, () => loader.reload());
    const modelRuntime = (record.context.modelRegistry as unknown as {
      runtime?: NonNullable<Parameters<typeof createAgentSession>[0]>["modelRuntime"];
    }).runtime;
    if (!modelRuntime) throw new Error("Parent model runtime is unavailable");
    const sessionManager = SessionManager.inMemory(cwd);
    replayHistory(sessionManager, record.history);
    const { session } = await childSessionContext.run(true, () => createAgentSession({
      cwd,
      agentDir,
      modelRuntime,
      model: record.resolvedModel,
      thinkingLevel: record.effort,
      excludeTools: [...SUBAGENT_TOOLS],
      resourceLoader: loader,
      settingsManager,
      sessionManager,
    }));
    await session.bindExtensions({
      mode: "print",
      onError: (failure) => { record.responseText = `extension error: ${failure.extensionPath}`; refresh(); },
    });
    return session;
  }

  async function run(record: AgentRecord, runNumber: number): Promise<void> {
    if (shuttingDown || record.status !== "queued" || record.runNumber !== runNumber) return;
    record.status = "running";
    record.startedAt = Date.now();
    record.completedAt = undefined;
    record.responseText = "";
    record.activeTools.clear();
    refresh();

    const abort = () => { void record.session?.abort().catch(() => {}); };
    record.abortController.signal.addEventListener("abort", abort, { once: true });
    try {
      let cwd = record.context.cwd;
      if (!record.session && record.isolation === "worktree") {
        const worktree = await createWorktree(pi, cwd, record.id, record.worktreeBranch);
        if (!worktree) {
          throw new Error('Cannot run with isolation: "worktree": git worktree creation failed. Initialize and commit the repository, or omit isolation.');
        }
        record.worktree = worktree;
        cwd = worktree.workPath;
      }
      if ((record.status as AgentStatus) === "cancelled" || shuttingDown) {
        await settle(record, runNumber, "cancelled");
        return;
      }

      if (!record.session) {
        record.session = await createChild(record, cwd);
        watchSession(record, record.session);
      }
      if ((record.status as AgentStatus) === "cancelled" || shuttingDown) {
        await settle(record, runNumber, "cancelled");
        return;
      }

      const startIndex = record.session.messages.length;
      const prompt = record.session.prompt(record.nextPrompt);
      record.acceptingSteer = true;
      record.started.resolve();
      for (const message of record.pendingSteers.splice(0)) await record.session.steer(message);
      await prompt;

      const response = latestAssistantResponse(record.session.messages, startIndex);
      record.latestFinalText = response.text;
      if ((record.status as AgentStatus) === "cancelled" || record.abortController.signal.aborted) await settle(record, runNumber, "cancelled");
      else if (response.error) await settle(record, runNumber, "failed", response.error);
      else await settle(record, runNumber, "completed");
    } catch (failure) {
      const error = failure instanceof Error ? failure.message : String(failure);
      const cancelled = (record.status as AgentStatus) === "cancelled";
      await settle(record, runNumber, cancelled ? "cancelled" : "failed", cancelled ? undefined : error);
    } finally {
      record.abortController.signal.removeEventListener("abort", abort);
    }
  }

  async function cancel(record: AgentRecord): Promise<void> {
    if (record.status === "queued") {
      record.status = "cancelled";
      record.settled = true;
      record.completedAt = Date.now();
      record.lingerTurns = 2;
      record.started.resolve();
      record.done.resolve();
      scheduleNotice(record);
      startQueued(pool.cancel(record.id));
      refresh();
      return;
    }
    if (record.status !== "running") return;
    if (record.settled) {
      await record.done.promise;
      return;
    }
    record.status = "cancelled";
    record.acceptingSteer = false;
    record.abortController.abort();
    await record.session?.abort().catch(() => {});
    refresh();
  }

  async function steer(record: AgentRecord, message: string): Promise<void> {
    if (record.status !== "running" || record.settled) throw new Error(`Agent is not running: ${record.id}`);
    if (!record.session || !record.acceptingSteer) {
      record.pendingSteers.push(message);
      return;
    }
    await record.session.steer(message);
  }

  const showDetail = async (id: string) => {
    const record = records.get(id);
    const ctx = context;
    if (!record || !ctx || ctx.mode !== "tui") return;
    await ctx.ui.custom<void>((tui, theme, keybindings, done) => {
      openTuis.add(tui);
      const component = new AgentDetail(
        tui,
        theme,
        keybindings,
        record,
        done,
        (message) => { void steer(record, message).catch((failure) => { record.responseText = String(failure); refresh(); }); },
        () => { void cancel(record); },
      );
      return Object.assign(component, { dispose: () => openTuis.delete(tui) });
    });
  };

  const showManager = async () => {
    const ctx = context;
    if (!ctx || ctx.mode !== "tui") return;
    for (;;) {
      const id = await ctx.ui.custom<string | undefined>((tui, theme, keybindings, done) => {
        openTuis.add(tui);
        const component = new AgentList(tui, theme, keybindings, allRecords, done);
        return Object.assign(component, { dispose: () => openTuis.delete(tui) });
      });
      if (!id) return;
      await showDetail(id);
    }
  };

  function resolveModel(ctx: ExtensionContext, id: ModelId): Model<any> {
    const slash = id.indexOf("/");
    const provider = id.slice(0, slash);
    const modelId = id.slice(slash + 1);
    const model = ctx.modelRegistry.find(provider, modelId);
    const scoped = ctx.scopedModels.map(({ model: item }) => `${item.provider}/${item.id}`);
    if (scoped.length && !scoped.includes(id)) throw new Error(`Model is unavailable in this session: ${id}`);
    if (!model || !ctx.modelRegistry.getAvailable().some((item) => item.provider === provider && item.id === modelId)) {
      throw new Error(`Model is unavailable in this session: ${id}`);
    }
    return model;
  }

  pi.registerMessageRenderer(NOTICE_TYPE, (message) => new Text(extractTextContent(message.content), 0, 0));

  pi.registerTool({
    name: AGENT_TOOL,
    label: "Agent",
    description: "Delegate a task to a fresh neutral Pi session. Background is the default; foreground waits for the final response.",
    promptSnippet: "Delegate a bounded task to a fresh subagent",
    promptGuidelines: [
      "Use Agent only when a separate context or parallel work saves more than dispatch costs.",
      "For Agent routing, use Luna/medium for exploration; Luna/high for source-heavy research and tightly specified edits; Terra/high for broad implementation; Sol/high for review and consequential reasoning. Other valid combinations remain allowed.",
    ],
    parameters: AgentSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: AgentParams, signal, _onUpdate, ctx) {
      context = ctx;
      const valid = validateAgentRequest(params.model, params.effort, params.isolation);
      if (!valid.ok) throw new Error(valid.error);
      const background = params.run_in_background ?? true;
      let record: AgentRecord;

      if (params.resume) {
        record = records.get(params.resume) ?? (() => { throw new Error(`Unknown agent: ${params.resume}`); })();
        if (record.status !== "completed") throw new Error(`Only completed agents can resume: ${params.resume}`);
        if (record.model !== params.model || record.effort !== params.effort) {
          throw new Error("Resume must keep the original model and effort");
        }
        if (params.isolation !== undefined && params.isolation !== record.isolation) {
          throw new Error("Resume cannot change isolation");
        }
        cancelNotice(record);
        record.description = params.description;
        record.nextPrompt = params.prompt;
        record.background = background;
        record.status = "queued";
        record.error = undefined;
        record.latestFinalText = "";
        record.responseText = "";
        record.activeTools.clear();
        record.acceptingSteer = false;
        record.startedAt = undefined;
        record.completedAt = undefined;
        record.abortController = new AbortController();
        record.done = deferred();
        record.started = deferred();
        record.settled = false;
        record.runNumber++;
        record.consumed = false;
        record.lingerTurns = 0;
      } else {
        const id = randomUUID().slice(0, 17);
        record = {
          id,
          description: params.description,
          prompt: params.prompt,
          nextPrompt: params.prompt,
          model: params.model,
          resolvedModel: resolveModel(ctx, params.model),
          effort: params.effort,
          background,
          isolation: params.isolation,
          context: ctx,
          status: "queued",
          transcript: [],
          latestFinalText: "",
          responseText: "",
          activeTools: new Map(),
          history: [],
          pendingSteers: [],
          acceptingSteer: false,
          initialUserSeen: false,
          abortController: new AbortController(),
          done: deferred(),
          started: deferred(),
          settled: false,
          runNumber: 1,
          consumed: false,
          lingerTurns: 0,
        };
        records.set(id, record);
      }

      startQueued(pool.enqueue(record.id));
      let detachAbort: (() => void) | undefined;
      if (!background && signal) {
        const onAbort = () => { void cancel(record); };
        if (signal.aborted) onAbort();
        else {
          signal.addEventListener("abort", onAbort, { once: true });
          detachAbort = () => signal.removeEventListener("abort", onAbort);
        }
      }

      if (background) {
        if (record.status === "running") await record.started.promise;
        return {
          content: [{ type: "text", text: bounded(`Agent ID: ${record.id}\nStatus: ${record.status}`) }],
          details: { agent_id: record.id, status: record.status },
        };
      }

      await record.done.promise;
      detachAbort?.();
      cancelNotice(record);
      const summary = worktreeSummary(record);
      const output = record.status === "completed"
        ? [summary, record.latestFinalText || "Agent completed without a final assistant response."].filter(Boolean).join("\n\n")
        : `Agent ${record.id} ${record.status}: ${record.error ?? "no final assistant response"}${summary ? `\n\n${summary}` : ""}${record.latestFinalText ? `\n\n${record.latestFinalText}` : ""}`;
      return {
        content: [{ type: "text", text: bounded(output) }],
        details: { agent_id: record.id, status: record.status, branch: record.worktreeBranch, worktree_path: record.worktreePath },
      };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg("toolTitle", theme.bold("Agent "))}${theme.fg("accent", String(args.description ?? ""))}`, 0, 0);
    },
  });

  pi.registerTool({
    name: RESULT_TOOL,
    label: "Get subagent result",
    description: "Return status and the latest final assistant response. Set wait only to wait for a queued or running agent.",
    parameters: ResultSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: Static<typeof ResultSchema>, signal) {
      const record = records.get(params.agent_id);
      if (!record) throw new Error(`Unknown agent: ${params.agent_id}`);
      if (params.wait && (record.status === "queued" || record.status === "running")) {
        await abortable(record.done.promise, signal);
      }
      if (record.status !== "queued" && record.status !== "running") cancelNotice(record);
      const parts = [`Status: ${record.status}`];
      if (record.error) parts.push(`Error: ${record.error}`);
      const summary = worktreeSummary(record);
      if (summary) parts.push(summary);
      parts.push(record.latestFinalText || "No final assistant response.");
      return {
        content: [{ type: "text", text: bounded(parts.join("\n\n")) }],
        details: { agent_id: record.id, status: record.status, branch: record.worktreeBranch, worktree_path: record.worktreePath },
      };
    },
  });

  pi.registerTool({
    name: STEER_TOOL,
    label: "Steer subagent",
    description: "Send a new instruction to a running subagent.",
    parameters: SteerSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: Static<typeof SteerSchema>) {
      const record = records.get(params.agent_id);
      if (!record) throw new Error(`Unknown agent: ${params.agent_id}`);
      await steer(record, params.message);
      return {
        content: [{ type: "text", text: `Steered ${record.id}` }],
        details: { agent_id: record.id, status: record.status },
      };
    },
  });

  pi.registerCommand("agents", {
    description: "List agents in this session",
    handler: async (_args, ctx) => {
      context = ctx;
      if (ctx.mode !== "tui") return ctx.ui.notify("/agents requires interactive TUI mode", "error");
      await showManager();
    },
  });

  pi.on("session_start", (_event, ctx) => {
    context = ctx;
    shuttingDown = false;
    refresh();
  });

  pi.on("tool_execution_start", () => {
    for (const record of records.values()) {
      if (record.status !== "queued" && record.status !== "running" && record.lingerTurns > 0) record.lingerTurns--;
    }
    refresh();
  });

  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    for (const timer of notices.values()) clearTimeout(timer);
    notices.clear();
    for (const record of records.values()) {
      if (record.status === "queued" || record.status === "running") void cancel(record);
    }
    await Promise.race([
      Promise.allSettled(allRecords().map((record) => record.done.promise)),
      new Promise<void>((resolve) => setTimeout(resolve, CHILD_SHUTDOWN_TIMEOUT_MS).unref()),
    ]);
    await Promise.all(allRecords().map(async (record) => {
      const forced = !record.settled;
      if (forced) {
        record.settled = true;
        record.status = "cancelled";
        record.acceptingSteer = false;
        record.started.resolve();
        record.done.resolve();
        pool.cancel(record.id);
      }
      const session = record.session;
      if (session) record.history = [...session.messages];
      record.unsubscribe?.();
      record.unsubscribe = undefined;
      record.session = undefined;
      await shutdownChildSession(session);
      if (record.worktree) {
        const worktree = record.worktree;
        record.worktree = undefined;
        if (forced) record.worktreePath = worktree.path;
        else await cleanupWorktree(pi, record.context.cwd, worktree, record.description);
      }
    }));
    await Promise.allSettled(allRecords().map((record) => record.done.promise));
    if (context?.mode === "tui") context.ui.setWidget(WIDGET_KEY, undefined);
    widgetRegistered = false;
    widgetTui = undefined;
    records.clear();
    pool.reset();
    openTuis.clear();
  });
}
