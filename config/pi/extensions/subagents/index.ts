import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";

import { getSupportedThinkingLevels, StringEnum } from "@earendil-works/pi-ai";
import {
  CustomEditor,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  getMarkdownTheme,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Editor,
  type EditorComponent,
  type EditorTheme,
  type Focusable,
  Key,
  Markdown,
  matchesKey,
  Text,
  truncateToWidth,
  type TUI,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

import {
  addChild,
  closeChild as closeRetainedChild,
  createSchedulerState,
  failChild,
  normalizeTitle,
  retryChild,
  settleChild,
  submitToChild,
  type ChildSpec,
  type RetainedChild,
  type SchedulerState,
  type StartWork,
} from "./state.ts";

const CHILD_ENV = "PI_SUBAGENT_CHILD";
const TOOL_NAME = "spawn_subagent";
const WIDGET_KEY = "subagents";
const MESSAGE_TYPE = "subagent-result";
const CHILD_CONTRACT = "Complete the delegated task and report clearly. Do not delegate further. Do not assume access to the parent conversation.";
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

type ThinkingLevel = (typeof THINKING_LEVELS)[number];
type TranscriptEntry =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string; thinking: string; draft?: boolean }
  | { type: "tool"; id: string; name: string; summary: string; result?: string; error?: boolean };

interface RunUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
}

interface ActiveRun {
  number: number;
  usage: RunUsage;
  finalText: string;
  stopReason?: string;
  error?: string;
  cardEmitted: boolean;
}

interface RuntimeChild {
  id: string;
  title: string;
  task: string;
  model: string;
  thinking: ThinkingLevel;
  tools: string[];
  transcript: TranscriptEntry[];
  activity: string;
  rpc?: RpcChild;
  run?: ActiveRun;
  assistantDraft?: Extract<TranscriptEntry, { type: "assistant" }>;
}

interface CompletionDetails {
  id: string;
  run: number;
  title?: string;
  task: string;
  model: string;
  thinking: string;
  success: boolean;
  finalText: string;
  usage: RunUsage;
}

const SpawnSchema = Type.Object({
  title: Type.String({ description: "Specific 2–5 word sentence-case title, at most 40 characters, with no trailing punctuation or agent/subagent boilerplate" }),
  task: Type.String({ description: "One concrete task to delegate to a fresh subagent" }),
  model: Type.String({ description: "Exact provider/model from the parent session's scoped models" }),
  thinking: StringEnum(THINKING_LEVELS, { description: "Fixed thinking level for this subagent" }),
});
type SpawnParams = Static<typeof SpawnSchema>;

function emptyUsage(): RunUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
}

function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value / 1000)}k`;
}

function formatUsage(usage: RunUsage): string {
  const parts = [`${usage.turns} turn${usage.turns === 1 ? "" : "s"}`];
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  return parts.join(" ");
}

function preview(text: string, length = 58): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > length ? `${singleLine.slice(0, length - 1)}…` : singleLine;
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text"))
    .map((part) => part.text)
    .join("\n");
}

function thinkingContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "thinking"; thinking: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: string }).type === "thinking"))
    .map((part) => part.thinking)
    .join("\n");
}

function resultContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  return preview(textContent(content), 100);
}

function toolSummary(name: string, args: Record<string, unknown>): string {
  const target = String(args.path ?? args.file_path ?? "");
  switch (name) {
    case "read": return `read ${target || "…"}`;
    case "write": return `write ${target || "…"}`;
    case "edit": return `edit ${target || "…"}`;
    case "grep": return `grep /${String(args.pattern ?? "")}/`;
    case "find": return `find ${String(args.pattern ?? "*")}`;
    case "bash": return `$ ${preview(String(args.command ?? "…"), 80)}`;
    default: return `${name} ${preview(JSON.stringify(args), 80)}`;
  }
}

function activityForTool(name: string, args: Record<string, unknown>): string {
  const target = path.basename(String(args.path ?? args.file_path ?? ""));
  if (name === "read") return `reading ${target || "a file"}`;
  if (name === "write" || name === "edit") return `editing ${target || "a file"}`;
  if (name === "grep" || name === "find") return "searching files";
  if (name === "bash") {
    const command = String(args.command ?? "");
    return /(?:^|\s)(?:test|tests|pytest|phpunit|pest)(?:\s|$)|npm\s+(?:run\s+)?test/.test(command)
      ? "running tests"
      : "running a command";
  }
  return `using ${name}`;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  if (!/^(node|bun)(\.exe)?$/.test(execName)) return { command: process.execPath, args };
  return { command: "pi", args };
}

class RpcChild {
  private process?: ChildProcessWithoutNullStreams;
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private nextRequest = 1;
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  private closing = false;
  private stderr = "";

  constructor(
    private readonly cwd: string,
    private readonly spec: Pick<ChildSpec, "model" | "thinking">,
    private readonly tools: string[],
    private readonly onEvent: (event: Record<string, any>) => void,
    private readonly onExit: (diagnostic: string) => void,
  ) {}

  start(): void {
    if (this.process) return;
    const args = [
      "--mode", "rpc",
      "--no-session",
      "--model", this.spec.model,
      "--thinking", this.spec.thinking,
      "--tools", this.tools.join(","),
      "--append-system-prompt", CHILD_CONTRACT,
    ];
    const invocation = getPiInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: this.cwd,
      env: { ...process.env, [CHILD_ENV]: "1" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    child.stdout.on("data", (chunk: Buffer | string) => this.readChunk(chunk));
    child.stdout.on("end", () => this.finishReading());
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-DEFAULT_MAX_BYTES);
    });
    child.stdin.on("error", (error) => this.rejectAll(error));
    child.once("error", (error) => this.handleExit(`Failed to start subagent: ${error.message}`));
    child.once("exit", (code, signal) => {
      const suffix = this.stderr.trim() ? `\n${this.stderr.trim()}` : "";
      this.handleExit(`Subagent exited (${signal ?? code ?? "unknown"})${suffix}`);
    });
  }

  prompt(message: string): Promise<void> {
    return this.send({ type: "prompt", message });
  }

  steer(message: string): Promise<void> {
    return this.send({ type: "steer", message });
  }

  abort(): Promise<void> {
    return this.send({ type: "abort" });
  }

  async terminate(): Promise<void> {
    this.closing = true;
    const child = this.process;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 1000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private send(command: Record<string, unknown>): Promise<void> {
    const child = this.process;
    if (!child?.stdin.writable) return Promise.reject(new Error("Subagent process is not writable"));
    const id = `r${this.nextRequest++}`;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, ...command })}\n`, (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private readChunk(chunk: Buffer | string): void {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.readLine(line);
    }
  }

  private finishReading(): void {
    this.buffer += this.decoder.end();
    if (this.buffer) this.readLine(this.buffer.endsWith("\r") ? this.buffer.slice(0, -1) : this.buffer);
    this.buffer = "";
  }

  private readLine(line: string): void {
    if (!line.trim()) return;
    let event: Record<string, any>;
    try {
      event = JSON.parse(line) as Record<string, any>;
    } catch {
      return;
    }
    if (event.type === "response" && typeof event.id === "string") {
      const pending = this.pending.get(event.id);
      if (!pending) return;
      this.pending.delete(event.id);
      if (event.success === false) pending.reject(new Error(String(event.error ?? `${event.command} failed`)));
      else pending.resolve();
      return;
    }
    if (event.type === "extension_ui_request") {
      if (["select", "confirm", "input", "editor"].includes(String(event.method)) && event.id) {
        this.process?.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: event.id, cancelled: true })}\n`);
      }
      return;
    }
    this.onEvent(event);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private handleExit(diagnostic: string): void {
    if (!this.process) return;
    this.process = undefined;
    this.rejectAll(new Error(diagnostic));
    if (!this.closing) this.onExit(diagnostic);
  }
}

function editorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (text) => theme.fg("accent", text),
    selectList: {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    },
  };
}

class ActiveWidget {
  constructor(
    private readonly theme: Theme,
    private readonly rows: () => Array<{ child: RetainedChild; runtime?: RuntimeChild; selected: boolean }>,
  ) {}

  render(width: number): string[] {
    return this.rows().map(({ child, runtime, selected }) => {
      const running = child.status === "running";
      const marker = selected ? this.theme.fg("accent", "▶") : " ";
      const label = `${preview(child.title, Math.max(12, Math.floor(width / 2)))} (${child.id})`;
      const activity = running ? runtime?.activity ?? "running" : child.status;
      const line = `${marker} ${this.theme.fg(running ? "accent" : "muted", running ? "●" : "○")} ${label} ${this.theme.fg("dim", `· ${activity}`)}`;
      return truncateToWidth(line, Math.max(1, width), "");
    });
  }

  invalidate(): void {}
}

function addAgentNavigation(
  editor: EditorComponent,
  activeIds: () => string[],
  selectedId: () => string | undefined,
  select: (direction: number) => void,
  open: (id: string) => void,
): EditorComponent {
  const handleInput = editor.handleInput.bind(editor);
  editor.handleInput = (data) => {
    const empty = editor.getText().length === 0;
    const ids = activeIds();
    if (ids.length > 0 && (matchesKey(data, Key.alt("j")) || (empty && (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl("n")))))) {
      select(1);
    } else if (ids.length > 0 && (matchesKey(data, Key.alt("k")) || (empty && (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl("p")))))) {
      select(-1);
    } else if (empty && ids.length > 0 && matchesKey(data, Key.enter)) {
      open(selectedId() ?? ids[0]!);
    } else {
      handleInput(data);
    }
  };
  return editor;
}

class AgentListComponent {
  private selected = 0;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly children: () => RetainedChild[],
    private readonly done: (result: { action: "open" | "retry" | "close"; id: string } | null) => void,
  ) {}

  handleInput(data: string): void {
    const children = this.children();
    if (matchesKey(data, Key.escape)) return this.done(null);
    if (children.length === 0) return;
    if (matchesKey(data, Key.up) || matchesKey(data, "k")) this.selected = (this.selected - 1 + children.length) % children.length;
    else if (matchesKey(data, Key.down) || matchesKey(data, "j")) this.selected = (this.selected + 1) % children.length;
    else if (matchesKey(data, Key.enter)) return this.done({ action: "open", id: children[this.selected]!.id });
    else if (matchesKey(data, "r") && children[this.selected]!.status === "failed") return this.done({ action: "retry", id: children[this.selected]!.id });
    else if (matchesKey(data, "d")) return this.done({ action: "close", id: children[this.selected]!.id });
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const children = this.children();
    if (this.selected >= children.length) this.selected = Math.max(0, children.length - 1);
    const lines = [this.theme.fg("accent", this.theme.bold("Retained subagents")), ""];
    if (children.length === 0) lines.push(this.theme.fg("muted", "No retained subagents."));
    children.forEach((child, index) => {
      const selected = index === this.selected;
      const icon = child.status === "failed" ? "✗" : child.status === "running" ? "●" : "○";
      const color = child.status === "failed" ? "error" : child.status === "running" ? "accent" : "muted";
      const line = `${selected ? "▶" : " "} ${this.theme.fg(color, icon)} ${child.title} ${this.theme.fg("accent", `(${child.id})`)} · ${child.status} · ${child.model}:${child.thinking}`;
      lines.push(selected ? this.theme.bg("selectedBg", truncateToWidth(line, width, "")) : truncateToWidth(line, width, ""));
      if (selected && child.error) lines.push(truncateToWidth(this.theme.fg("error", `    ${child.error}`), width, ""));
    });
    while (lines.length < Math.max(3, this.tui.terminal.rows - 1)) lines.push("");
    lines.push(this.theme.fg("dim", "↑↓/jk select • Enter inspect • r retry failed • d close • Esc return"));
    return lines.map((line) => truncateToWidth(line, Math.max(1, width), ""));
  }

  invalidate(): void {}
}

class TranscriptComponent implements Focusable {
  private editor: Editor;
  private _focused = false;
  private showThinking = false;
  private scrollFromBottom = 0;
  private lastHistoryLength = 0;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly child: RuntimeChild,
    private readonly status: () => RetainedChild | undefined,
    private readonly done: (result: "back" | "close") => void,
    private readonly submit: (text: string) => void,
    private readonly abort: () => void,
  ) {
    this.editor = new Editor(tui, editorTheme(theme), { paddingX: 1 });
    this.editor.onSubmit = (text) => {
      if (!text.trim()) return;
      this.submit(text);
      this.editor.setText("");
      this.scrollFromBottom = 0;
      this.tui.requestRender();
    };
  }

  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    this.editor.focused = value;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return this.done("back");
    if (matchesKey(data, Key.ctrl("c"))) {
      this.abort();
      return;
    }
    if (matchesKey(data, Key.ctrl("d"))) return this.done("close");
    if (matchesKey(data, Key.ctrl("t"))) {
      this.showThinking = !this.showThinking;
      this.tui.requestRender();
      return;
    }
    const page = Math.max(3, this.tui.terminal.rows - 8);
    if (matchesKey(data, Key.pageUp)) {
      this.scrollFromBottom += page;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.scrollFromBottom = Math.max(0, this.scrollFromBottom - page);
      this.tui.requestRender();
      return;
    }
    this.editor.handleInput(data);
  }

  render(width: number): string[] {
    const renderWidth = Math.max(1, width);
    const retained = this.status();
    const state = retained?.status ?? "closed";
    const header = `${this.theme.fg("accent", this.theme.bold(this.child.title))} ${this.theme.fg("muted", `(${this.child.id}) · ${state} · ${this.child.model}:${this.child.thinking}`)}`;
    const task = `${this.theme.fg("muted", "Task: ")}${this.child.task}`;
    const inputLines = this.editor.render(renderWidth);
    const fixed = 5 + inputLines.length;
    const viewport = Math.max(1, this.tui.terminal.rows - fixed);
    const history = this.historyLines(renderWidth);
    if (this.scrollFromBottom > 0 && history.length > this.lastHistoryLength) {
      this.scrollFromBottom += history.length - this.lastHistoryLength;
    }
    this.lastHistoryLength = history.length;
    const maxOffset = Math.max(0, history.length - viewport);
    this.scrollFromBottom = Math.min(this.scrollFromBottom, maxOffset);
    const end = history.length - this.scrollFromBottom;
    const start = Math.max(0, end - viewport);
    const visible = history.slice(start, end);
    const activity = state === "running" ? ` · ${this.child.activity}` : "";
    const hints = `Esc back • Ctrl+C interrupt • Ctrl+D close • Ctrl+T thinking ${this.showThinking ? "on" : "off"} • PgUp/PgDn scroll${activity}`;
    const lines = [header, ...wrapTextWithAnsi(task, renderWidth), this.theme.fg("borderMuted", "─".repeat(renderWidth)), ...visible];
    while (lines.length < 3 + viewport) lines.push("");
    lines.push(this.theme.fg("borderMuted", "─".repeat(renderWidth)), ...inputLines, this.theme.fg("dim", hints));
    return lines.map((line) => truncateToWidth(line, renderWidth, ""));
  }

  private historyLines(width: number): string[] {
    const lines: string[] = [];
    const add = (prefix: string, text: string, color: Parameters<Theme["fg"]>[0]) => {
      const styledPrefix = this.theme.fg(color, prefix);
      const available = Math.max(1, width - visibleWidth(prefix));
      const wrapped = wrapTextWithAnsi(text || "(empty)", available);
      wrapped.forEach((line, index) => lines.push(`${index === 0 ? styledPrefix : " ".repeat(visibleWidth(prefix))}${line}`));
    };
    for (const entry of this.child.transcript) {
      if (entry.type === "user") add("You: ", entry.text, "accent");
      else if (entry.type === "assistant") {
        if (this.showThinking && entry.thinking) add("Think: ", entry.thinking, "dim");
        if (entry.text) add("Agent: ", entry.text, "text");
      } else {
        const status = entry.result === undefined ? "…" : entry.error ? "✗" : "✓";
        const suffix = entry.result ? ` ▶ ${entry.result}` : "";
        add(`${status} `, `${entry.summary}${suffix}`, entry.error ? "error" : "muted");
      }
    }
    if (lines.length === 0) lines.push(this.theme.fg("muted", "(no transcript yet)"));
    return lines;
  }

  invalidate(): void { this.editor.invalidate(); }
}

export default function subagentsExtension(pi: ExtensionAPI): void {
  if (process.env[CHILD_ENV] === "1") return;

  let scheduler: SchedulerState = createSchedulerState();
  const runtimes = new Map<string, RuntimeChild>();
  const openTuis = new Set<TUI>();
  let sessionCtx: ExtensionContext | undefined;
  let widgetVisible = false;
  let selectedActiveId: string | undefined;
  let shuttingDown = false;

  const childState = (id: string) => scheduler.children.find((child) => child.id === id);
  const activeChildren = () => scheduler.children.filter((child) => child.status === "queued" || child.status === "running");

  const refreshUI = () => {
    const active = activeChildren();
    if (!active.some((child) => child.id === selectedActiveId)) selectedActiveId = active[0]?.id;
    for (const tui of openTuis) tui.requestRender();
    if (sessionCtx?.mode !== "tui") return;
    if (active.length > 0 && !widgetVisible) {
      widgetVisible = true;
      sessionCtx.ui.setWidget(WIDGET_KEY, (_tui, theme) => new ActiveWidget(theme, () =>
        activeChildren().map((child) => ({ child, runtime: runtimes.get(child.id), selected: child.id === selectedActiveId }))), { placement: "belowEditor" });
    } else if (active.length === 0 && widgetVisible) {
      widgetVisible = false;
      sessionCtx.ui.setWidget(WIDGET_KEY, undefined);
    }
  };

  const launchStarted = (started: StartWork[]) => {
    for (const work of started) void startWork(work);
    refreshUI();
  };

  const emitCard = (runtime: RuntimeChild, run: ActiveRun, success: boolean, fallback?: string) => {
    if (run.cardEmitted) return;
    run.cardEmitted = true;
    const full = run.finalText || run.error || fallback || "(no final answer)";
    const truncated = truncateHead(full, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
    const finalText = truncated.truncated ? `${truncated.content}\n\n[Subagent result truncated for parent context.]` : truncated.content;
    const details: CompletionDetails = {
      id: runtime.id,
      run: run.number,
      title: runtime.title,
      task: runtime.task,
      model: runtime.model,
      thinking: runtime.thinking,
      success,
      finalText,
      usage: run.usage,
    };
    pi.sendMessage({
      customType: MESSAGE_TYPE,
      content: `Subagent ${runtime.title} (${runtime.id}.${run.number}) ${success ? "completed" : "failed"}.\nTask: ${runtime.task}\n\n${finalText}`,
      display: true,
      details,
    }, { deliverAs: "nextTurn" });
  };

  const failRuntime = (id: string, diagnostic: string) => {
    const runtime = runtimes.get(id);
    const retained = childState(id);
    if (!runtime || !retained || retained.status === "failed") return;
    runtime.activity = "failed";
    if (runtime.run && retained.status === "running") {
      runtime.run.error = diagnostic;
      emitCard(runtime, runtime.run, false, diagnostic);
    }
    const transition = failChild(scheduler, id, diagnostic);
    scheduler = transition.state;
    launchStarted(transition.started);
  };

  const handleEvent = (runtime: RuntimeChild, event: Record<string, any>) => {
    if (event.type === "message_start" && event.message?.role === "assistant") {
      const entry: Extract<TranscriptEntry, { type: "assistant" }> = { type: "assistant", text: "", thinking: "", draft: true };
      runtime.transcript.push(entry);
      runtime.assistantDraft = entry;
    } else if (event.type === "message_update") {
      const delta = event.assistantMessageEvent;
      if (!runtime.assistantDraft) {
        runtime.assistantDraft = { type: "assistant", text: "", thinking: "", draft: true };
        runtime.transcript.push(runtime.assistantDraft);
      }
      if (delta?.type === "text_delta") {
        runtime.assistantDraft.text += String(delta.delta ?? "");
        runtime.activity = "responding";
      } else if (delta?.type === "thinking_delta") {
        runtime.assistantDraft.thinking += String(delta.delta ?? "");
        runtime.activity = "thinking";
      }
    } else if (event.type === "message_end" && event.message?.role === "assistant") {
      const message = event.message;
      const entry = runtime.assistantDraft ?? { type: "assistant" as const, text: "", thinking: "" };
      if (!runtime.assistantDraft) runtime.transcript.push(entry);
      entry.text = textContent(message.content);
      entry.thinking = thinkingContent(message.content);
      entry.draft = false;
      runtime.assistantDraft = undefined;
      if (runtime.run) {
        const usage = message.usage;
        runtime.run.usage.turns++;
        runtime.run.usage.input += Number(usage?.input ?? 0);
        runtime.run.usage.output += Number(usage?.output ?? 0);
        runtime.run.usage.cacheRead += Number(usage?.cacheRead ?? 0);
        runtime.run.usage.cacheWrite += Number(usage?.cacheWrite ?? 0);
        runtime.run.usage.cost += Number(usage?.cost?.total ?? 0);
        if (entry.text) runtime.run.finalText = entry.text;
        runtime.run.stopReason = message.stopReason;
        runtime.run.error = message.errorMessage;
      }
    } else if (event.type === "tool_execution_start") {
      const args = event.args && typeof event.args === "object" ? event.args as Record<string, unknown> : {};
      runtime.transcript.push({
        type: "tool",
        id: String(event.toolCallId ?? ""),
        name: String(event.toolName ?? "tool"),
        summary: toolSummary(String(event.toolName ?? "tool"), args),
      });
      runtime.activity = activityForTool(String(event.toolName ?? "tool"), args);
    } else if (event.type === "tool_execution_end") {
      const tool = [...runtime.transcript].reverse().find((entry): entry is Extract<TranscriptEntry, { type: "tool" }> =>
        entry.type === "tool" && entry.id === String(event.toolCallId ?? ""));
      if (tool) {
        tool.result = resultContent(event.result) || (event.isError ? "failed" : "done");
        tool.error = Boolean(event.isError);
      }
      runtime.activity = "responding";
    } else if (event.type === "agent_settled") {
      const retained = childState(runtime.id);
      if (!retained || retained.status !== "running" || !runtime.run) return;
      const failed = runtime.run.stopReason === "error" || runtime.run.stopReason === "aborted" || Boolean(runtime.run.error);
      emitCard(runtime, runtime.run, !failed);
      runtime.activity = "idle";
      const transition = settleChild(scheduler, runtime.id);
      scheduler = transition.state;
      launchStarted(transition.started);
    }
    refreshUI();
  };

  async function startWork(work: StartWork): Promise<void> {
    const runtime = runtimes.get(work.childId);
    if (!runtime || shuttingDown) return;
    runtime.run = { number: work.run, usage: emptyUsage(), finalText: "", cardEmitted: false };
    runtime.activity = "starting";
    if (!runtime.rpc) {
      runtime.rpc = new RpcChild(
        sessionCtx?.cwd ?? process.cwd(),
        { model: runtime.model, thinking: runtime.thinking },
        runtime.tools,
        (event) => handleEvent(runtime, event),
        (diagnostic) => failRuntime(runtime.id, diagnostic),
      );
      runtime.rpc.start();
    }
    refreshUI();
    try {
      await runtime.rpc.prompt(work.prompt);
      runtime.activity = "working";
    } catch (error) {
      failRuntime(runtime.id, error instanceof Error ? error.message : String(error));
    }
    refreshUI();
  }

  const addRuntime = (child: RetainedChild, thinking: ThinkingLevel, tools: string[]) => {
    const runtime: RuntimeChild = {
      id: child.id,
      title: child.title,
      task: child.task,
      model: child.model,
      thinking,
      tools,
      transcript: [{ type: "user", text: child.task }],
      activity: child.status === "queued" ? "queued" : "starting",
    };
    runtimes.set(child.id, runtime);
    return runtime;
  };

  const closeAgent = async (id: string) => {
    const runtime = runtimes.get(id);
    if (runtime) await runtime.rpc?.terminate();
    const transition = closeRetainedChild(scheduler, id);
    scheduler = transition.state;
    runtimes.delete(id);
    launchStarted(transition.started);
  };

  const retryAgent = (id: string): string => {
    const transition = retryChild(scheduler, id);
    scheduler = transition.state;
    addRuntime(
      transition.child,
      transition.child.thinking as ThinkingLevel,
      pi.getActiveTools().filter((name) => name !== TOOL_NAME && name !== "question"),
    );
    launchStarted(transition.started);
    return transition.child.id;
  };

  const submit = (id: string, text: string) => {
    const runtime = runtimes.get(id);
    if (!runtime) throw new Error(`Unknown subagent: ${id}`);
    const result = submitToChild(scheduler, id, text);
    scheduler = result.state;
    runtime.transcript.push({ type: "user", text });
    if (result.action === "steer") {
      runtime.activity = "steering";
      void runtime.rpc?.steer(text).catch((error) => failRuntime(id, error.message));
    } else if (result.action === "queued") runtime.activity = "queued";
    launchStarted(result.started);
  };

  const showTranscript = async (id: string): Promise<void> => {
    const ctx = sessionCtx;
    if (!ctx || ctx.mode !== "tui") return;
    for (;;) {
      const runtime = runtimes.get(id);
      if (!runtime) return;
      const result = await ctx.ui.custom<"back" | "close">((tui, theme, _keybindings, done) => {
        openTuis.add(tui);
        const component = new TranscriptComponent(
          tui,
          theme,
          runtime,
          () => childState(id),
          done,
          (text) => {
            try { submit(id, text); }
            catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
          },
          () => void runtime.rpc?.abort().catch((error) => ctx.ui.notify(error.message, "error")),
        );
        return Object.assign(component, { dispose: () => openTuis.delete(tui) });
      }, {
        overlay: true,
        overlayOptions: { width: "100%", maxHeight: "100%", margin: 0 },
      });
      if (result !== "close") return;
      if (await ctx.ui.confirm(`Close ${id}?`, "This terminates the subagent and removes its in-memory transcript.")) {
        await closeAgent(id);
        return;
      }
    }
  };

  const showManager = async (ctx: ExtensionContext): Promise<void> => {
    for (;;) {
      const result = await ctx.ui.custom<{ action: "open" | "retry" | "close"; id: string } | null>((tui, theme, _keybindings, done) => {
        openTuis.add(tui);
        const component = new AgentListComponent(tui, theme, () => scheduler.children, done);
        return Object.assign(component, { dispose: () => openTuis.delete(tui) });
      }, {
        overlay: true,
        overlayOptions: { width: "100%", maxHeight: "100%", margin: 0 },
      });
      if (!result) return;
      if (result.action === "open") await showTranscript(result.id);
      else if (result.action === "retry") {
        try {
          const newId = retryAgent(result.id);
          ctx.ui.notify(`Retried ${result.id} as ${newId}`, "info");
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
      } else if (await ctx.ui.confirm(`Close ${result.id}?`, "This terminates the subagent and removes its in-memory transcript.")) {
        await closeAgent(result.id);
      }
    }
  };

  pi.registerMessageRenderer(MESSAGE_TYPE, (message, { expanded, outputPad }, theme) => {
    const details = message.details as CompletionDetails | undefined;
    if (!details) return new Text(textContent(message.content), outputPad, 0);
    const icon = details.success ? theme.fg("success", "✓") : theme.fg("error", "✗");
    const header = `${icon} ${theme.fg("toolTitle", theme.bold(details.title ?? preview(details.task)))} ${theme.fg("muted", `(${details.id}.${details.run}) · ${details.model} · ${formatUsage(details.usage)}`)}`;
    if (!expanded) return new Text(header, outputPad, 0);
    const container = new Container();
    container.addChild(new Text(header, outputPad, 0));
    container.addChild(new Markdown(details.finalText, outputPad, 0, getMarkdownTheme()));
    return container;
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Spawn Subagent",
    description: "Spawn one named dynamic subagent and return its handle immediately. Call spawn_subagent only when the current user request explicitly asks for subagent delegation; never delegate automatically. Generate a specific short title for each child. The model and thinking level stay fixed for the child's lifetime.",
    promptSnippet: "Spawn one dynamic subagent only for explicit user-requested delegation",
    promptGuidelines: [
      "Call spawn_subagent only when the current user request explicitly asks for subagent delegation; do not infer or automate delegation.",
      "Use spawn_subagent only to create a new task-specific child; existing children are controlled only through the user UI.",
      "When calling spawn_subagent, generate a concrete 2–5 word sentence-case title of at most 40 characters, without trailing punctuation or agent/subagent boilerplate.",
    ],
    parameters: SpawnSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: SpawnParams, _signal, _onUpdate, ctx) {
      sessionCtx = ctx;
      const available = ctx.scopedModels.length > 0
        ? ctx.scopedModels
        : ctx.modelRegistry.getAvailable().map((model) => ({ model, thinkingLevel: undefined }));
      const scoped = available.find(({ model }) => `${model.provider}/${model.id}` === params.model);
      if (!scoped) throw new Error(`Model is outside the parent session scope: ${params.model}`);
      if (scoped.thinkingLevel && scoped.thinkingLevel !== params.thinking) {
        throw new Error(`Model ${params.model} is scoped to thinking level ${scoped.thinkingLevel}`);
      }
      const supported = getSupportedThinkingLevels(scoped.model);
      if (!supported.includes(params.thinking)) {
        throw new Error(`Thinking level ${params.thinking} is not supported by ${params.model}; choose one of: ${supported.join(", ")}`);
      }
      const title = normalizeTitle(params.title);
      const tools = pi.getActiveTools().filter((name) => name !== TOOL_NAME && name !== "question");
      const transition = addChild(scheduler, { ...params, title });
      scheduler = transition.state;
      addRuntime(transition.child, params.thinking, tools);
      launchStarted(transition.started);
      return {
        content: [{ type: "text" as const, text: `Spawned ${transition.child.title} (${transition.child.id}) · ${transition.child.status}` }],
        details: { id: transition.child.id, status: transition.child.status },
      };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg("toolTitle", theme.bold("spawn_subagent "))}${theme.fg("accent", preview(args.title ?? "", 40))} ${theme.fg("muted", `· ${args.model}:${args.thinking}`)}`, 0, 0);
    },
    renderResult(result, _options, theme) {
      const text = result.content.find((part) => part.type === "text");
      return new Text(theme.fg("success", text?.type === "text" ? text.text : "Subagent spawned"), 0, 0);
    },
  });

  pi.registerCommand("agents", {
    description: "Inspect and manage retained subagents",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return ctx.ui.notify("/agents requires interactive TUI mode", "error");
      sessionCtx = ctx;
      await showManager(ctx);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    sessionCtx = ctx;
    shuttingDown = false;
    if (ctx.mode !== "tui") return;
    const previous = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const base = previous
        ? previous(tui, theme, keybindings)
        : new CustomEditor(tui, theme, keybindings);
      return addAgentNavigation(
        base,
        () => activeChildren().map((child) => child.id),
        () => selectedActiveId,
        (direction) => {
          const ids = activeChildren().map((child) => child.id);
          if (ids.length === 0) return;
          const index = Math.max(0, ids.indexOf(selectedActiveId ?? ids[0]!));
          selectedActiveId = ids[(index + direction + ids.length) % ids.length];
          tui.requestRender();
        },
        (id) => setTimeout(() => void showTranscript(id), 0),
      );
    });
    refreshUI();
  });

  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    sessionCtx?.ui.setWidget(WIDGET_KEY, undefined);
    widgetVisible = false;
    const processes = [...runtimes.values()].map(async (runtime) => runtime.rpc?.terminate());
    await Promise.all(processes);
    runtimes.clear();
    scheduler = createSchedulerState();
    openTuis.clear();
  });
}
