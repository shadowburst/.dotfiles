// Derived from tintinweb/pi-subagents 0.19.0. See LICENSE.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { getSupportedThinkingLevels, StringEnum, type Model, type ModelThinkingLevel } from "@earendil-works/pi-ai";
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
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type KeybindingsManager,
  type TUI,
} from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

import {
  AgentPool,
  cleanupWorktree,
  createWorktree,
  latestAssistantResponse,
  orderAgentsForList,
  transcriptForView,
  truncateResponse,
  validateAgentRequest,
  extractTextContent,
  type ModelCatalog,
  type TranscriptEntry,
  type Worktree,
} from "./state.ts";

const WIDGET_KEY = "subagents";
const NOTICE_TYPE = "subagent-completed";
const AGENT_TOOL = "Agent";
const RESULT_TOOL = "get_subagent_result";
const STEER_TOOL = "steer_subagent";
const CANCEL_TOOL = "cancel_subagent";
const SUBAGENT_TOOLS = new Set([AGENT_TOOL, RESULT_TOOL, STEER_TOOL, CANCEL_TOOL]);
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const NOTICE_DELAY_MS = 200;
const CHILD_SHUTDOWN_TIMEOUT_MS = 3_000;
const CANCEL_TIMEOUT_MS = 5_000;

const childSessionContext = new AsyncLocalStorage<boolean>();

type AgentStatus = "queued" | "running" | "stopping" | "completed" | "failed" | "cancelled" | "unresponsive";
type Deferred = { promise: Promise<void>; resolve: () => void };

type AgentRecord = {
  id: string;
  description: string;
  prompt: string;
  nextPrompt: string;
  model: string;
  resolvedModel: Model<any>;
  effort: ModelThinkingLevel;
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
  uiError?: string;
  usage?: { tokens: number | null; contextWindow: number; percent: number | null };
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
  settling: boolean;
  listOrder: number;
  runNumber: number;
  consumed: boolean;
  lingerTurns: number;
};

type AgentParams = Static<typeof AgentSchema>;
type AgentRunResult = {
  agentId: string;
  status: AgentStatus;
  output: string;
  branch?: string;
  worktreePath?: string;
};
type SubagentRunRequest = {
  version: 1;
  prompt: string;
  description: string;
  model: string;
  effort: ModelThinkingLevel;
  accept: () => void;
  resolve: (result: AgentRunResult) => void;
  reject: (error: Error) => void;
};

const AgentSchema = Type.Object({
  prompt: Type.String({ description: "The self-contained task for the child." }),
  description: Type.String({ description: "Short label shown in /agents and completion notices." }),
  model: Type.String({ minLength: 1, description: "Full provider/model ID from the session's available model catalog." }),
  effort: Type.String({ minLength: 1, description: "Reasoning effort supported by the selected model." }),
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

async function withinDeadline(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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

function panel(theme: Theme, width: number, content: string[]): string[] {
  const inner = Math.max(0, width - 2);
  const border = (text: string) => theme.fg("border", text);
  return [
    border(`╭${"─".repeat(inner)}╮`),
    ...content.map((line) => {
      const text = truncateToWidth(line, inner, "");
      return border("│") + text + " ".repeat(Math.max(0, inner - visibleWidth(text))) + border("│");
    }),
    border(`╰${"─".repeat(inner)}╯`),
  ].map((line) => truncateToWidth(line, Math.max(1, width), ""));
}

function columns(left: string, right: string, width: number): string {
  const rightWidth = Math.min(visibleWidth(right), Math.max(0, Math.floor(width * 0.65)));
  const lhs = truncateToWidth(left, Math.max(0, width - rightWidth - 2), "");
  const rhs = truncateToWidth(right, rightWidth, "");
  return truncateToWidth(lhs + " ".repeat(Math.max(1, width - visibleWidth(lhs) - visibleWidth(rhs))) + rhs, width, "");
}

function statusIcon(record: AgentRecord, theme: Theme, frame = 0): string {
  if (record.status === "running") return theme.fg("accent", SPINNER[frame % SPINNER.length]!);
  if (record.status === "queued") return theme.fg("muted", "◦");
  if (record.status === "completed") return theme.fg("success", "✓");
  if (record.status === "cancelled") return theme.fg("dim", "■");
  if (record.status === "stopping") return theme.fg("warning", "■");
  return theme.fg("error", "✗");
}

function statusLabel(record: AgentRecord, theme: Theme): string {
  const color = record.status === "completed" ? "success"
    : ["failed", "unresponsive"].includes(record.status) ? "error"
    : ["running", "stopping"].includes(record.status) ? "warning" : "muted";
  return theme.fg(color, `■ ${record.status}`);
}

function agentMetadata(record: AgentRecord, width: number, fullContext = false): string {
  const usage = record.usage;
  const context = usage ? `ctx ${usage.percent === null ? "?" : `${usage.percent.toFixed(1)}%`}${fullContext ? ` (${usage.tokens ?? "?"}/${usage.contextWindow})` : ""}` : "ctx ?";
  const suffix = `${record.effort} · ${context} · ${elapsed(record)}`;
  const label = record.model.slice(record.model.indexOf("/") + 1);
  const model = truncateToWidth(label, Math.max(0, width - visibleWidth(suffix) - 3), "");
  return model ? `${model} · ${suffix}` : suffix;
}

function agentLocation(record: AgentRecord): string {
  return [record.status === "queued" ? "waiting for a slot" : "", record.worktreePath ?? record.worktree?.workPath, record.worktreeBranch ?? record.worktree?.branch, record.isolation === "worktree" ? "worktree" : ""].filter(Boolean).join(" · ");
}

function canStop(record: AgentRecord): boolean {
  return ["queued", "running"].includes(record.status);
}

function activity(record: AgentRecord): string {
  if (record.activeTools.size) {
    const names = [...new Set(record.activeTools.values())];
    return names.length === 1 ? `${names[0]}…` : `${names.join(", ")}…`;
  }
  if (record.status !== "running") return `${record.status}…`;
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
    const running = records.filter((record) => ["running", "stopping"].includes(record.status));
    const queued = records.filter((record) => record.status === "queued");
    const finished = records.filter((record) => !["queued", "running", "stopping"].includes(record.status) && record.lingerTurns > 0);
    if (!running.length && !queued.length && !finished.length) return [];

    const runningLines = running.map((record) => [
      `${this.theme.fg("dim", "├─")} ${statusIcon(record, this.theme, this.frame)} ${this.theme.bold(record.description)} ${this.theme.fg("muted", `· ${record.model} · ${record.effort}`)} ${this.theme.fg("dim", `· ${elapsed(record)}`)}`,
      `${this.theme.fg("dim", "│")}    ${this.theme.fg(record.uiError || record.error ? "error" : "dim", `⎿  ${record.uiError ?? record.error ?? activity(record)}`)}`,
    ]);
    const queuedLine = queued.length
      ? `${this.theme.fg("dim", "├─")} ${this.theme.fg("muted", "◦")} ${this.theme.fg("dim", `${queued.length} queued`)}`
      : undefined;
    const finishedLines = finished.map((record) => {
      const icon = statusIcon(record, this.theme);
      const error = record.uiError ?? record.error;
      const suffix = `${record.status === "unresponsive" ? " · unresponsive" : ""}${error ? ` · ${error.slice(0, 60)}` : ""}`;
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
  private selectedId?: string;
  private frame = 0;
  private pageSize = 1;
  private stopArmedId?: string;
  private stoppingId?: string;
  private feedback = "";
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly records: () => AgentRecord[],
    private readonly done: (id?: string) => void,
    private readonly cancel: (record: AgentRecord) => Promise<void> | void,
    private readonly selection: { id?: string } = {},
  ) {
    this.selectedId = selection.id;
    this.timer = setInterval(() => {
      if (this.records().some((record) => record.status === "running")) {
        this.frame++;
        tui.requestRender();
      }
    }, 80);
    this.timer.unref();
  }

  handleInput(data: string): void {
    const records = this.orderedRecords();
    const selected = this.selectedIndex(records);
    if (keyMatches(this.keybindings, data, "tui.select.cancel") && this.stopArmedId) {
      this.stopArmedId = undefined;
      this.tui.requestRender();
      return;
    }
    if (keyMatches(this.keybindings, data, "tui.select.cancel") || matchesKey(data, "q") || matchesKey(data, Key.ctrl("c"))) return this.done();
    if (!records.length) return;
    const record = records[selected]!;
    if (matchesKey(data, "x")) {
      if (canStop(record) && !this.stoppingId) {
        if (this.stopArmedId === record.id) {
          this.stopArmedId = undefined;
          this.stoppingId = record.id;
          this.feedback = `Stop requested: ${record.description}`;
          void Promise.resolve().then(() => this.cancel(record)).catch((failure) => {
            record.uiError = `Stop failed: ${String(failure)}`;
            this.feedback = record.uiError;
          }).finally(() => { this.stoppingId = undefined; this.tui.requestRender(); });
        } else this.stopArmedId = record.id;
        this.tui.requestRender();
      }
      return;
    }
    this.stopArmedId = undefined;
    if (keyMatches(this.keybindings, data, "tui.select.up") || matchesKey(data, "k")) this.selectedId = records[(selected - 1 + records.length) % records.length]!.id;
    else if (keyMatches(this.keybindings, data, "tui.select.down") || matchesKey(data, "j")) this.selectedId = records[(selected + 1) % records.length]!.id;
    else if (keyMatches(this.keybindings, data, "tui.select.pageUp")) this.selectedId = records[Math.max(0, selected - this.pageSize)]!.id;
    else if (keyMatches(this.keybindings, data, "tui.select.pageDown")) this.selectedId = records[Math.min(records.length - 1, selected + this.pageSize)]!.id;
    else if (keyMatches(this.keybindings, data, "tui.select.confirm")) return this.done(records[selected]!.id);
    this.selection.id = this.selectedId;
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const { active, finished } = orderAgentsForList(this.records());
    const records = [...active, ...finished];
    this.selectedIndex(records);
    const lines: Array<{ text: string; recordId?: string }> = [];
    const addRecord = (record: AgentRecord) => {
      const selected = record.id === this.selectedId;
      const marker = selected ? this.theme.fg("accent", "❯") : " ";
      const title = this.theme.fg(selected ? "accent" : "text", record.description);
      const left = ` ${marker} ${statusIcon(record, this.theme, this.frame)} ${title} ${this.theme.fg("dim", record.id)}`;
      lines.push({ text: columns(left, this.theme.fg("muted", agentMetadata(record, Math.floor((width - 2) * 0.65))), Math.max(1, width - 2)), recordId: record.id });
      const metadata = [agentLocation(record), record.uiError ?? record.error].filter(Boolean).join(" · ");
      if (metadata) lines.push({ text: this.theme.fg(record.uiError || record.error ? "error" : "dim", `    ${metadata}`), recordId: record.id });
    };

    if (active.length) {
      lines.push({ text: this.theme.fg("muted", "Active") });
      active.forEach(addRecord);
    }
    if (finished.length) {
      if (active.length) lines.push({ text: "" });
      lines.push({ text: this.theme.fg("muted", "Finished") });
      finished.forEach(addRecord);
    }
    if (!records.length) lines.push({ text: this.theme.fg("muted", "No agents in this session.") });

    const height = Math.max(1, (this.tui.terminal.rows || 30) - 6);
    const selectedLine = lines.findIndex((line) => line.recordId === this.selectedId);
    const maxStart = Math.max(0, lines.length - height);
    let start = selectedLine < 0 ? 0 : height === 1
      ? Math.min(selectedLine, maxStart)
      : Math.max(0, Math.min(selectedLine - Math.floor((height - 2) / 2), maxStart));
    if (selectedLine >= 0 && height > 1 && selectedLine + 2 > start + height) start = Math.min(maxStart, selectedLine + 2 - height);
    const visible = lines.slice(start, start + height);
    this.pageSize = Math.max(1, new Set(visible.flatMap((line) => line.recordId ? [line.recordId] : [])).size - 1);
    const selected = records.find((record) => record.id === this.selectedId);
    if (this.stopArmedId && (this.stopArmedId !== selected?.id || !selected || !canStop(selected))) this.stopArmedId = undefined;
    const hints = this.stopArmedId ? "x again to STOP · Esc reset"
      : "↑↓/jk select · Enter open · x stop · Esc/q close";
    return [
      columns(this.theme.fg("accent", this.theme.bold("Subagents")), this.theme.fg("muted", `${records.length} agents · ${active.length} active`), width),
      ...panel(this.theme, width, [...visible.map(({ text }) => text), ...Array(Math.max(0, height - visible.length)).fill("")]),
      truncateToWidth(this.theme.fg("warning", this.feedback), width, ""),
      truncateToWidth(this.theme.fg("dim", hints), width, ""),
    ];
  }

  invalidate(): void {}
  dispose(): void { clearInterval(this.timer); }

  private orderedRecords(): AgentRecord[] {
    const { active, finished } = orderAgentsForList(this.records());
    return [...active, ...finished];
  }

  private selectedIndex(records: AgentRecord[]): number {
    let index = records.findIndex((record) => record.id === this.selectedId);
    if (index < 0 && records.length) {
      this.selectedId = records[0]!.id;
      index = 0;
    }
    this.selection.id = this.selectedId;
    return index;
  }
}

class AgentDetail implements Component, Focusable {
  private readonly composer = new Input();
  private composing = false;
  private _focused = false;
  private stopArmed = false;
  private stopping = false;
  private feedback = "";
  private readonly timer: ReturnType<typeof setInterval>;
  private scrollOffset = 0;
  private autoScroll = true;
  private width = 80;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly record: AgentRecord,
    private readonly done: () => void,
    private readonly steer: (message: string) => Promise<void> | void,
    private readonly cancel: () => Promise<void> | void,
  ) {
    this.timer = setInterval(() => tui.requestRender(), 1000);
    this.timer.unref();
    this.composer.onSubmit = (value) => {
      const message = value.trim();
      if (!message) return;
      if (record.status !== "running") {
        this.feedback = "Only running agents can be steered.";
        tui.requestRender();
        return;
      }
      this.composer.setValue("");
      this.feedback = "Sending instruction…";
      void Promise.resolve().then(() => this.steer(message)).then(() => {
        this.feedback = "Instruction sent.";
        this.autoScroll = true;
      }).catch((failure) => {
        record.uiError = `Steer failed: ${String(failure)}`;
        this.feedback = record.uiError;
        if (!this.composer.getValue()) this.composer.setValue(value);
      }).finally(() => tui.requestRender());
    };
  }

  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    this.composer.focused = value && this.composing;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || keyMatches(this.keybindings, data, "tui.select.cancel")) {
      if (this.stopArmed) this.stopArmed = false;
      else if (this.composing) { this.composing = false; this.composer.focused = false; }
      else return this.done();
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.ctrl("c")) || (!this.composing && matchesKey(data, "q"))) return this.done();
    if (matchesKey(data, Key.ctrl("x")) || (!this.composing && matchesKey(data, "x"))) {
      if (canStop(this.record) && !this.stopping) {
        if (this.stopArmed) {
          this.stopArmed = false;
          this.stopping = true;
          this.feedback = "Stop requested…";
          void Promise.resolve().then(() => this.cancel()).catch((failure) => {
            this.record.uiError = `Stop failed: ${String(failure)}`;
            this.feedback = this.record.uiError;
          }).finally(() => { this.stopping = false; this.tui.requestRender(); });
        } else this.stopArmed = true;
        this.tui.requestRender();
      }
      return;
    }
    this.stopArmed = false;
    if (!this.composing && matchesKey(data, Key.enter) && this.record.status === "running") {
      this.composing = true;
      this.composer.focused = this.focused;
      this.tui.requestRender();
      return;
    }
    // Paging stays available while composing; ordinary letters (including x)
    // and cursor keys belong to Input, not transcript navigation.
    const pageUp = keyMatches(this.keybindings, data, "tui.select.pageUp") || matchesKey(data, "shift+up");
    const pageDown = keyMatches(this.keybindings, data, "tui.select.pageDown") || matchesKey(data, "shift+down");
    if (this.composing && !pageUp && !pageDown) {
      this.composer.handleInput(data);
      this.tui.requestRender();
      return;
    }

    const total = this.history(this.width).length;
    const viewport = this.viewportHeight();
    const max = Math.max(0, total - viewport);
    const up = keyMatches(this.keybindings, data, "tui.select.up") || matchesKey(data, "k");
    const down = keyMatches(this.keybindings, data, "tui.select.down") || matchesKey(data, "j");
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
    const theme = this.theme;
    const border = theme.fg("borderAccent", "─".repeat(this.width));
    if (!canStop(this.record)) this.stopArmed = false;
    const header = columns(`${statusLabel(this.record, theme)} ${theme.fg("accent", theme.bold(this.record.description))} ${theme.fg("dim", this.record.id)}`, theme.fg("muted", agentMetadata(this.record, Math.floor(this.width * 0.65), true)), this.width);
    const error = this.record.uiError ?? this.record.error;
    const status = this.stopArmed ? theme.fg("warning", `${this.composing ? "Ctrl+X" : "x"} again to STOP · Esc reset`)
      : error ? theme.fg("error", `error: ${error}`)
      : theme.fg("muted", [this.feedback, agentLocation(this.record), !this.autoScroll ? "scrolled · ↓/PgDn to follow" : ""].filter(Boolean).join(" · "));
    const hints = this.composing
      ? "Enter send · Ctrl+X twice stop · Esc transcript · PgUp/PgDn scroll · Ctrl+C close"
      : `${this.record.status === "running" ? "Enter steer · " : ""}${canStop(this.record) ? "x twice stop · " : ""}↑↓/jk scroll · PgUp/PgDn · Esc/q close`;
    return [border, header, border, ...visible,
      ...Array(Math.max(0, viewport - visible.length)).fill(""),
      status, border, ...this.composer.render(this.width), theme.fg("dim", hints), border,
    ].map((line) => truncateToWidth(line, this.width, ""));
  }

  invalidate(): void { this.composer.invalidate(); }
  dispose(): void { clearInterval(this.timer); }

  private viewportHeight(): number {
    return Math.max(1, (this.tui.terminal.rows || 30) - 8 - this.composer.render(this.width).length);
  }

  private history(width: number): string[] {
    const lines: string[] = [];
    const entries: TranscriptEntry[] = [...transcriptForView(this.record.prompt, []), ...this.record.transcript];
    for (const entry of entries) {
      if (!entry.text && !entry.thinking) continue;
      if (lines.length) lines.push(this.theme.fg("dim", "───"));
      lines.push(entry.role === "user" ? this.theme.fg("accent", "[User]")
        : entry.role === "tool" ? this.theme.fg("toolTitle", "[Tool]") : this.theme.bold("[Assistant]"));
      if (entry.thinking) lines.push(...wrapTextWithAnsi(entry.thinking, width).map((line) => this.theme.fg("thinkingText", line)));
      try {
        lines.push(...new Markdown(entry.text, 0, 0, getMarkdownTheme()).render(width));
      } catch {
        lines.push(...wrapTextWithAnsi(entry.text, width));
      }
    }
    // Older saved sessions may have live text without a transcript entry.
    if (this.record.responseText && !this.record.transcript.some((entry) => entry.role === "assistant" && entry.text === this.record.responseText)) {
      lines.push(...new Markdown(this.record.responseText, 0, 0, getMarkdownTheme()).render(width));
    }
    if (this.record.activeTools.size) {
      lines.push("", this.theme.fg("toolTitle", `Tools: ${activity(this.record)}`));
    } else if (["running", "stopping", "unresponsive", "queued"].includes(this.record.status)) {
      lines.push("", this.theme.fg("dim", this.record.status === "running" ? "working…" : this.record.status));
    }
    return lines.length ? lines.map((line) => truncateToWidth(line, width, "")) : [this.theme.fg("muted", "(waiting for first message...)")];
  }

}

async function shutdownChildSession(session?: AgentSession): Promise<void> {
  try {
    const runner = session?.extensionRunner;
    if (runner?.hasHandlers("session_shutdown")) {
      await withinDeadline(runner.emit({ type: "session_shutdown", reason: "quit" }), CHILD_SHUTDOWN_TIMEOUT_MS);
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
  let listOrder = 0;
  const bumpListOrder = (record: AgentRecord) => { record.listOrder = ++listOrder; };
  const notices = new Map<string, ReturnType<typeof setTimeout>>();
  const openTuis = new Set<TUI>();
  let context: ExtensionContext | undefined;
  let catalog: ModelCatalog = new Map();
  let resolvedModels = new Map<string, Model<any>>();
  let widgetRegistered = false;
  let widgetTui: TUI | undefined;
  let shuttingDown = false;

  const allRecords = () => [...records.values()];
  const widgetRecords = () => allRecords().filter((record) =>
    record.status === "queued" || record.status === "running" || record.status === "stopping" || record.lingerTurns > 0);

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
    if (shuttingDown) return;
    for (const id of ids) {
      const record = records.get(id);
      if (record) void run(record, record.runNumber);
    }
    refresh();
  };

  function finish(record: AgentRecord, status: AgentStatus, error?: string): void {
    if (record.settled) return;
    record.settled = true;
    record.acceptingSteer = false;
    record.status = status;
    record.error = error;
    record.activeTools.clear();
    record.completedAt = Date.now();
    bumpListOrder(record);
    record.lingerTurns = status === "completed" ? 1 : 2;
    if (!record.background) record.consumed = true;
    scheduleNotice(record);
    record.started.resolve();
    record.done.resolve();
    startQueued(pool.cancel(record.id));
    refresh();
  }

  function detachSession(record: AgentRecord): AgentSession | undefined {
    const session = record.session;
    if (session) record.history = [...session.messages];
    record.unsubscribe?.();
    record.unsubscribe = undefined;
    record.session = undefined;
    return session;
  }

  function forceStop(record: AgentRecord, error: string): void {
    record.abortController.abort();
    if (record.worktree) record.worktreePath = record.worktree.path;
    const session = detachSession(record);
    try { session?.dispose(); } catch { /* A broken tool must not block recovery. */ }
    finish(record, "unresponsive", error);
  }

  async function settle(
    record: AgentRecord,
    runNumber: number,
    proposed: "completed" | "failed" | "cancelled",
    error?: string,
  ): Promise<void> {
    if (record.runNumber !== runNumber || record.settled || record.settling) return;
    record.settling = true;
    record.acceptingSteer = false;
    if (record.session) record.history = [...record.session.messages];
    if (record.worktree || proposed !== "completed" || record.abortController.signal.aborted) {
      await shutdownChildSession(detachSession(record));
    }
    if (record.settled) return;
    if (record.worktree) {
      const worktree = record.worktree;
      // Keep the path available if cancellation/shutdown times out during cleanup.
      const result = await cleanupWorktree(pi, record.context.cwd, worktree, record.description);
      record.worktree = undefined;
      record.worktreeBranch = result.branch ?? record.worktreeBranch;
      record.worktreePath = result.path;
      if (result.error) error = `Worktree cleanup failed; edits were preserved at ${result.path}: ${result.error}`;
    }
    if (record.settled) { refresh(); return; }
    const status = record.abortController.signal.aborted ? "cancelled" : proposed;
    finish(record, record.worktreePath ? "failed" : status, error);
  }

  function watchSession(record: AgentRecord, session: AgentSession): void {
    record.unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      if (record.settled) return;
      record.usage = session.getContextUsage();
      if (event.type === "message_start" && event.message.role === "assistant") {
        record.responseText = "";
        record.transcript.push({ role: "assistant", text: "" });
      } else if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        record.responseText += event.assistantMessageEvent.delta;
        const latest = record.transcript.at(-1);
        if (latest?.role === "assistant") latest.text += event.assistantMessageEvent.delta;
      } else if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
        const latest = record.transcript.at(-1);
        if (latest?.role === "assistant") latest.thinking = (latest.thinking ?? "") + event.assistantMessageEvent.delta;
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
        record.transcript.push({ role: "tool", text: `${event.toolName}${event.isError ? " failed" : ""}:\n${bounded(extractTextContent(event.result?.content))}` });
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
    try {
      await session.bindExtensions({
        mode: "print",
        onError: (failure) => { record.uiError = `extension error: ${failure.extensionPath}: ${failure.error}`; refresh(); },
      });
      return session;
    } catch (failure) {
      await shutdownChildSession(session);
      throw failure;
    }
  }

  async function run(record: AgentRecord, runNumber: number): Promise<void> {
    if (shuttingDown || record.status !== "queued" || record.runNumber !== runNumber) return;
    record.status = "running";
    record.startedAt = Date.now();
    record.completedAt = undefined;
    bumpListOrder(record);
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
        if (record.settled) {
          record.worktreePath = worktree.path;
          refresh();
          return;
        }
        record.worktree = worktree;
        cwd = worktree.workPath;
      }
      if (record.abortController.signal.aborted || shuttingDown) {
        await settle(record, runNumber, "cancelled");
        return;
      }

      if (!record.session) {
        const session = await createChild(record, cwd);
        if (record.settled) { await shutdownChildSession(session); return; }
        record.session = session;
        watchSession(record, session);
      }
      if (record.abortController.signal.aborted || shuttingDown) {
        await settle(record, runNumber, "cancelled");
        return;
      }

      const session = record.session;
      const startIndex = session.messages.length;
      const prompt = session.prompt(record.nextPrompt);
      record.acceptingSteer = true;
      record.started.resolve();
      for (const message of record.pendingSteers.splice(0)) {
        try { await session.steer(message); }
        catch (failure) { record.uiError = `Steering failed: ${String(failure)}`; refresh(); }
      }
      await prompt;
      if (record.settled) return;
      const response = latestAssistantResponse(session.messages, startIndex);
      record.latestFinalText = response.text;
      if (record.abortController.signal.aborted) await settle(record, runNumber, "cancelled");
      else if (response.error) await settle(record, runNumber, "failed", response.error);
      else await settle(record, runNumber, "completed");
    } catch (failure) {
      const error = failure instanceof Error ? failure.message : String(failure);
      const cancelled = record.abortController.signal.aborted;
      await settle(record, runNumber, cancelled ? "cancelled" : "failed", cancelled ? undefined : error);
    } finally {
      record.abortController.signal.removeEventListener("abort", abort);
    }
  }

  async function cancel(record: AgentRecord): Promise<void> {
    if (record.status === "queued") { finish(record, "cancelled"); return; }
    if (record.status === "stopping") { await record.done.promise; return; }
    if (record.status !== "running") return;
    record.status = "stopping";
    record.acceptingSteer = false;
    record.abortController.abort();
    refresh();
    if (!await withinDeadline(record.done.promise, CANCEL_TIMEOUT_MS)) {
      forceStop(record, "Cancellation exceeded 5s; execution may still be unwinding. Scheduler slot released; inspect preserved work before continuing.");
    }
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
        (message) => steer(record, message),
        () => cancel(record),
      );
      const dispose = component.dispose.bind(component);
      return Object.assign(component, { dispose: () => { dispose(); openTuis.delete(tui); } });
    }, { overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" } });
  };

  const showManager = async () => {
    const ctx = context;
    if (!ctx || ctx.mode !== "tui") return;
    const selection: { id?: string } = {};
    for (;;) {
      const id = await ctx.ui.custom<string | undefined>((tui, theme, keybindings, done) => {
        openTuis.add(tui);
        const component = new AgentList(tui, theme, keybindings, allRecords, done, cancel, selection);
        const dispose = component.dispose.bind(component);
        return Object.assign(component, { dispose: () => { dispose(); openTuis.delete(tui); } });
      }, { overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" } });
      if (!id) return;
      await showDetail(id);
    }
  };

  function snapshotCatalog(ctx: ExtensionContext): void {
    const scoped = new Set(ctx.scopedModels.map(({ model }) => `${model.provider}/${model.id}`));
    const models = ctx.modelRegistry.getAvailable().filter((model) =>
      scoped.size === 0 || scoped.has(`${model.provider}/${model.id}`));
    catalog = new Map(models.map((model) => [
      `${model.provider}/${model.id}`,
      getSupportedThinkingLevels(model),
    ]));
    resolvedModels = new Map(models.map((model) => [`${model.provider}/${model.id}`, model]));
  }

  function resolveModel(id: string): Model<any> {
    const model = resolvedModels.get(id);
    if (!model) throw new Error(`Model is unavailable in this session: ${id}`);
    return model;
  }

  async function runAgent(
    params: AgentParams,
    signal: AbortSignal | undefined,
    ctx: ExtensionContext,
  ): Promise<AgentRunResult> {
    context = ctx;
    const valid = validateAgentRequest(params.model, params.effort, catalog, params.isolation);
    if (valid.ok === false) throw new Error(valid.error);
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
      bumpListOrder(record);
      record.error = undefined;
      record.uiError = undefined;
      record.usage = undefined;
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
      record.settling = false;
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
        resolvedModel: resolveModel(params.model),
        effort: params.effort as ModelThinkingLevel,
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
        settling: false,
        listOrder: ++listOrder,
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
        agentId: record.id,
        status: record.status,
        output: bounded(`Agent ID: ${record.id}\nStatus: ${record.status}`),
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
      agentId: record.id,
      status: record.status,
      output: bounded(output),
      branch: record.worktreeBranch,
      worktreePath: record.worktreePath,
    };
  }

  pi.on("session_start", (_event, ctx) => {
    context = ctx;
    snapshotCatalog(ctx);
  });

  pi.events.on("subagents:run", (request: SubagentRunRequest) => {
    if (request.version !== 1 || !context) {
      request.reject(new Error("The subagents bridge is unavailable. Reload Pi after updating both extensions."));
      return;
    }
    request.accept();
    void runAgent(
      {
        prompt: request.prompt,
        description: request.description,
        model: request.model,
        effort: request.effort,
        run_in_background: false,
      },
      undefined,
      context,
    ).then(request.resolve, (failure) => {
      request.reject(failure instanceof Error ? failure : new Error(String(failure)));
    });
  });

  pi.registerMessageRenderer(NOTICE_TYPE, (message) => new Text(extractTextContent(message.content), 0, 0));

  pi.registerTool({
    name: AGENT_TOOL,
    label: "Agent",
    description: "Delegate a task to a fresh neutral Pi session. Background is the default; foreground waits for the final response.",
    promptSnippet: "Delegate a bounded task to a fresh subagent",
    parameters: AgentSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: AgentParams, signal, _onUpdate, ctx) {
      const result = await runAgent(params, signal, ctx);
      return {
        content: [{ type: "text", text: result.output }],
        details: {
          agent_id: result.agentId,
          status: result.status,
          branch: result.branch,
          worktree_path: result.worktreePath,
        },
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
      if (params.wait && !record.settled) {
        await abortable(record.done.promise, signal);
      }
      if (record.settled) cancelNotice(record);
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
    name: CANCEL_TOOL,
    label: "Cancel subagent",
    description: "Stop a queued or running subagent, preserving its transcript and file edits. Unresponsive means stopping was not confirmed within 5 seconds; execution may still be unwinding.",
    parameters: Type.Object({ agent_id: Type.String({ description: "Agent ID to cancel." }) }),
    executionMode: "parallel",
    async execute(_toolCallId, params: { agent_id: string }) {
      const record = records.get(params.agent_id);
      if (!record) throw new Error(`Unknown agent: ${params.agent_id}`);
      await cancel(record);
      cancelNotice(record);
      const summary = worktreeSummary(record);
      return {
        content: [{ type: "text", text: bounded([`Agent ${record.id}: ${record.status}`, record.error, summary].filter(Boolean).join("\n\n")) }],
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
      if (record.settled && record.lingerTurns > 0) record.lingerTurns--;
    }
    refresh();
  });

  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    for (const timer of notices.values()) clearTimeout(timer);
    notices.clear();
    const children = allRecords();
    await withinDeadline(Promise.allSettled(children.map(async (record) => {
      if (!record.settled) await cancel(record);
      await shutdownChildSession(detachSession(record));
    })), CHILD_SHUTDOWN_TIMEOUT_MS);
    // Never await cleanup a second time after the total shutdown deadline.
    for (const record of children) {
      if (!record.settled) forceStop(record, "Parent shutdown deadline exceeded; execution may still be unwinding.");
      const session = detachSession(record);
      try { session?.dispose(); } catch { /* best effort after deadline */ }
    }
    if (context?.mode === "tui") context.ui.setWidget(WIDGET_KEY, undefined);
    widgetRegistered = false;
    widgetTui = undefined;
    records.clear();
    pool.reset();
    openTuis.clear();
  });
}
