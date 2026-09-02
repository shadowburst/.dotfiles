// Derived from tintinweb/pi-subagents 0.19.0. See LICENSE.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";

import { StringEnum } from "@earendil-works/pi-ai";
import { CustomEditor, getMarkdownTheme, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Editor, Key, Markdown, matchesKey, Text, truncateToWidth, type Component, type EditorComponent, type TUI } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

import { AgentPool, EFFORTS, MODELS, transcriptForView, validateAgentRequest, type Effort, type ModelId, type TranscriptEntry } from "./state.ts";

const CHILD_ENV = "PI_LOCAL_SUBAGENT_CHILD";
const WIDGET_KEY = "subagents";
const NOTICE_TYPE = "subagent-completed";
const AGENT_TOOL = "Agent";
const RESULT_TOOL = "get_subagent_result";
const STEER_TOOL = "steer_subagent";

type AgentStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type Worktree = { path: string; workPath: string; baseSha: string; branch: string };

type AgentRecord = {
  id: string;
  description: string;
  prompt: string;
  model: ModelId;
  effort: Effort;
  background: boolean;
  isolation?: "worktree";
  status: AgentStatus;
  startedAt?: number;
  completedAt?: number;
  transcript: TranscriptEntry[];
  latestFinalText: string;
  error?: string;
  rpc?: RpcChild;
  worktree?: Worktree;
  done: Promise<void>;
  resolveDone: () => void;
};

type AgentParams = Static<typeof AgentSchema>;

const AgentSchema = Type.Object({
  prompt: Type.String({ description: "The task for the child." }),
  description: Type.String({ description: "Short label shown in /agents and completion notices." }),
  model: StringEnum(MODELS, { description: "Full provider/model ID." }),
  effort: StringEnum(EFFORTS, { description: "Reasoning effort for the selected model." }),
  run_in_background: Type.Optional(Type.Boolean({ description: "Default true. Set false to wait for completion." })),
  resume: Type.Optional(Type.String({ description: "Completed agent ID to reactivate." })),
  isolation: Type.Optional(StringEnum(["worktree"] as const, { description: "Create an isolated git worktree." })),
});

const ResultSchema = Type.Object({
  agent_id: Type.String({ description: "Agent ID returned by Agent." }),
  wait: Type.Optional(Type.Boolean({ description: "Wait for queued or running work to settle." })),
});

const SteerSchema = Type.Object({
  agent_id: Type.String({ description: "Running agent ID." }),
  prompt: Type.String({ description: "New instruction for the running agent." }),
});

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text"))
    .map((part) => part.text)
    .join("\n");
}

function elapsed(record: AgentRecord): string {
  const end = record.completedAt ?? Date.now();
  const start = record.startedAt ?? end;
  return `${Math.max(0, Math.floor((end - start) / 1000))}s`;
}

function invocation(args: string[]): { command: string; args: string[] } {
  const script = process.argv[1];
  if (script && existsSync(script) && !script.startsWith("/$bunfs/root/")) return { command: process.execPath, args: [script, ...args] };
  return { command: "pi", args };
}

class RpcChild {
  private process?: ChildProcessWithoutNullStreams;
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private nextId = 1;
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  private closing = false;

  constructor(
    private readonly cwd: string,
    private readonly model: ModelId,
    private readonly effort: Effort,
    private readonly tools: string[],
    private readonly onEvent: (event: Record<string, unknown>) => void,
    private readonly onExit: (error: string) => void,
  ) {}

  start(): void {
    if (this.process) return;
    const command = invocation(["--mode", "rpc", "--no-session", "--model", this.model, "--thinking", this.effort, "--tools", this.tools.join(",")]);
    this.process = spawn(command.command, command.args, {
      cwd: this.cwd,
      env: { ...process.env, [CHILD_ENV]: "1" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process.stdout.on("data", (chunk: Buffer | string) => this.read(typeof chunk === "string" ? chunk : this.decoder.write(chunk)));
    this.process.stdout.on("end", () => this.read(this.decoder.end()));
    this.process.once("error", (error) => this.exit(error.message));
    this.process.once("exit", (code, signal) => this.exit(`Subagent exited (${signal ?? code ?? "unknown"})`));
  }

  prompt(message: string): Promise<void> { return this.send({ type: "prompt", message }); }
  steer(message: string): Promise<void> { return this.send({ type: "steer", message }); }

  async terminate(): Promise<void> {
    this.closing = true;
    const child = this.process;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  }

  private send(command: Record<string, unknown>): Promise<void> {
    if (!this.process?.stdin.writable) return Promise.reject(new Error("Subagent process is not writable"));
    const id = `request-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process!.stdin.write(`${JSON.stringify({ id, ...command })}\n`, (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (event.type === "response" && typeof event.id === "string") {
          const pending = this.pending.get(event.id);
          if (!pending) continue;
          this.pending.delete(event.id);
          if (event.success === false) pending.reject(new Error(String(event.error ?? "RPC request failed")));
          else pending.resolve();
        } else if (event.type === "extension_ui_request" && event.id && ["select", "confirm", "input", "editor"].includes(String(event.method))) {
          this.process?.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: event.id, cancelled: true })}\n`);
        } else this.onEvent(event);
      } catch { /* Ignore malformed child output. */ }
    }
  }

  private exit(error: string): void {
    for (const pending of this.pending.values()) pending.reject(new Error(error));
    this.pending.clear();
    this.process = undefined;
    if (!this.closing) this.onExit(error);
  }
}

class AgentWidget implements Component {
  private timer: ReturnType<typeof setInterval>;

  constructor(private readonly tui: TUI, private readonly theme: Theme, private readonly records: () => AgentRecord[]) {
    this.timer = setInterval(() => tui.requestRender(), 1000);
  }

  render(width: number): string[] {
    return this.records()
      .filter((record) => record.status === "queued" || record.status === "running")
      .map((record) => truncateToWidth(`${this.theme.fg(record.status === "running" ? "accent" : "muted", record.status === "running" ? "●" : "○")} ${record.description} · ${record.status} · ${record.model} · ${elapsed(record)}`, width, ""));
  }

  invalidate(): void {}
  dispose(): void { clearInterval(this.timer); }
}

class AgentList implements Component {
  private selected = 0;

  constructor(private readonly tui: TUI, private readonly theme: Theme, private readonly records: () => AgentRecord[], private readonly done: (id?: string) => void) {}

  handleInput(data: string): void {
    const records = this.records();
    if (matchesKey(data, Key.escape)) return this.done();
    if (records.length && (matchesKey(data, Key.up) || matchesKey(data, "k"))) this.selected = (this.selected - 1 + records.length) % records.length;
    else if (records.length && (matchesKey(data, Key.down) || matchesKey(data, "j"))) this.selected = (this.selected + 1) % records.length;
    else if (records.length && matchesKey(data, Key.enter)) this.done(records[this.selected]!.id);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const records = this.records();
    this.selected = Math.min(this.selected, Math.max(0, records.length - 1));
    const lines = [this.theme.fg("accent", this.theme.bold("Agents")), ""];
    if (!records.length) lines.push(this.theme.fg("muted", "No agents in this session."));
    records.forEach((record, index) => {
      const line = `${index === this.selected ? "→" : " "} ${record.description} · ${record.status} · ${record.model} · ${elapsed(record)}`;
      lines.push(index === this.selected ? this.theme.bg("selectedBg", truncateToWidth(line, width, "")) : truncateToWidth(line, width, ""));
    });
    lines.push("", this.theme.fg("dim", "↑↓/jk select • Enter open • Esc back"));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void {}
}

class AgentDetail implements Component {
  private editor: Editor;
  private _focused = false;
  private scrollFromBottom = 0;
  private lastLineCount = 0;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly record: AgentRecord,
    private readonly done: () => void,
    private readonly steer: (prompt: string) => void,
    private readonly cancel: () => void,
  ) {
    this.editor = new Editor(tui, {
      borderColor: (text) => theme.fg("accent", text),
      selectList: {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("warning", text),
      },
    }, { paddingX: 1 });
    this.editor.onSubmit = (prompt) => {
      if (!prompt.trim() || this.record.status !== "running") return;
      this.steer(prompt);
      this.editor.setText("");
      this.scrollFromBottom = 0;
    };
  }

  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    this.editor.focused = value;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return this.done();
    if (matchesKey(data, Key.ctrl("c")) && (this.record.status === "queued" || this.record.status === "running")) return this.cancel();
    const page = Math.max(3, this.tui.terminal.rows - 6);
    if (matchesKey(data, Key.pageUp)) { this.scrollFromBottom += page; this.tui.requestRender(); return; }
    if (matchesKey(data, Key.pageDown)) { this.scrollFromBottom = Math.max(0, this.scrollFromBottom - page); this.tui.requestRender(); return; }
    if (this.record.status === "running") this.editor.handleInput(data);
  }

  render(width: number): string[] {
    const history = this.history(width);
    if (this.scrollFromBottom && history.length > this.lastLineCount) this.scrollFromBottom += history.length - this.lastLineCount;
    this.lastLineCount = history.length;
    const editor = this.record.status === "running" ? this.editor.render(width) : [];
    const viewport = Math.max(1, this.tui.terminal.rows - editor.length - 4);
    this.scrollFromBottom = Math.min(this.scrollFromBottom, Math.max(0, history.length - viewport));
    const end = history.length - this.scrollFromBottom;
    const visible = history.slice(Math.max(0, end - viewport), end);
    const header = `${this.theme.fg("accent", this.theme.bold(this.record.description))} ${this.theme.fg("muted", `(${this.record.id} · ${this.record.status} · ${this.record.model})`)}`;
    const hints = this.record.status === "running"
      ? "Esc back • Ctrl+C cancel • PgUp/PgDn scroll • Enter steer"
      : this.record.status === "queued"
        ? "Esc back • Ctrl+C cancel • PgUp/PgDn scroll"
        : "Esc back • PgUp/PgDn scroll";
    return [header, this.theme.fg("borderMuted", "─".repeat(width)), ...visible, this.theme.fg("borderMuted", "─".repeat(width)), ...editor, this.theme.fg("dim", hints)].map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void { this.editor.invalidate(); }

  private history(width: number): string[] {
    const lines: string[] = [];
    for (const entry of transcriptForView(this.record.prompt, this.record.transcript)) {
      if (lines.length) lines.push("");
      lines.push(...new Markdown(entry.text, 0, 0, getMarkdownTheme()).render(width));
    }
    return lines.length ? lines : [this.theme.fg("muted", "(no transcript yet)")];
  }
}

export default function subagentsExtension(pi: ExtensionAPI): void {
  if (process.env[CHILD_ENV] === "1") return;

  const records = new Map<string, AgentRecord>();
  let pool = new AgentPool();
  const openTuis = new Set<TUI>();
  let context: ExtensionContext | undefined;
  let widgetVisible = false;
  let selectedId: string | undefined;
  let shuttingDown = false;

  const allRecords = () => [...records.values()];
  const activeRecords = () => allRecords().filter((record) => record.status === "queued" || record.status === "running");
  const refresh = () => {
    if (!activeRecords().some((record) => record.id === selectedId)) selectedId = activeRecords()[0]?.id;
    for (const tui of openTuis) tui.requestRender();
    if (!context || context.mode !== "tui") return;
    if (activeRecords().length && !widgetVisible) {
      widgetVisible = true;
      context.ui.setWidget(WIDGET_KEY, (tui, theme) => new AgentWidget(tui, theme, activeRecords));
    } else if (!activeRecords().length && widgetVisible) {
      widgetVisible = false;
      context.ui.setWidget(WIDGET_KEY, undefined);
    }
  };

  const startQueued = (ids: string[]) => { for (const id of ids) void start(id); refresh(); };
  const finish = (record: AgentRecord, status: Exclude<AgentStatus, "queued" | "running">, error?: string) => {
    if (record.status !== "running") return;
    record.status = status;
    record.error = error;
    record.completedAt = Date.now();
    record.resolveDone();
    startQueued(pool.finish(record.id));
    if (record.background) pi.sendMessage({ customType: NOTICE_TYPE, content: `${record.description} (${record.id})`, display: true });
    refresh();
  };

  const event = (record: AgentRecord, value: Record<string, unknown>) => {
    if (value.type === "message_start" && (value.message as { role?: string } | undefined)?.role === "assistant") record.transcript.push({ role: "assistant", text: "" });
    if (value.type === "message_update") {
      const update = value.assistantMessageEvent as { type?: string; delta?: string } | undefined;
      if (update?.type === "text_delta") {
        const latest = record.transcript.at(-1);
        if (latest?.role === "assistant") latest.text += String(update.delta ?? "");
      }
    }
    if (value.type === "message_end" && (value.message as { role?: string } | undefined)?.role === "assistant") {
      const text = textContent((value.message as { content?: unknown }).content);
      const latest = record.transcript.at(-1);
      if (latest?.role === "assistant") latest.text = text;
      else record.transcript.push({ role: "assistant", text });
      if (text) record.latestFinalText = text;
      const message = value.message as { stopReason?: string; errorMessage?: string };
      if (message.errorMessage) record.error = message.errorMessage;
      if (message.stopReason === "error" || message.stopReason === "aborted") record.error ??= `Subagent ${message.stopReason}`;
    }
    if (value.type === "agent_settled") finish(record, record.error ? "failed" : "completed", record.error);
    refresh();
  };

  async function start(id: string): Promise<void> {
    const record = records.get(id);
    if (!record || shuttingDown || record.status !== "queued") return;
    try {
      record.status = "running";
      record.startedAt ??= Date.now();
      if (record.isolation && !record.worktree) record.worktree = await createWorktree(pi, context?.cwd ?? process.cwd(), record.id);
      record.rpc ??= new RpcChild(
        record.worktree?.workPath ?? context?.cwd ?? process.cwd(),
        record.model,
        record.effort,
        pi.getActiveTools().filter((name) => ![AGENT_TOOL, RESULT_TOOL, STEER_TOOL].includes(name)),
        (value) => event(record, value),
        (error) => finish(record, "failed", error),
      );
      record.rpc.start();
      await record.rpc.prompt(record.transcript.at(-1)?.role === "user" ? record.transcript.at(-1)!.text : record.prompt);
    } catch (error) {
      finish(record, "failed", error instanceof Error ? error.message : String(error));
    }
    refresh();
  }

  const cancel = async (record: AgentRecord) => {
    if (record.status === "queued") {
      record.status = "cancelled";
      record.completedAt = Date.now();
      record.resolveDone();
      startQueued(pool.cancel(record.id));
      refresh();
      return;
    }
    if (record.status !== "running") return;
    await record.rpc?.terminate();
    finish(record, "cancelled");
    if (record.worktree) await cleanupWorktree(pi, context?.cwd ?? process.cwd(), record.worktree, record.description);
  };

  const showDetail = async (id: string) => {
    const record = records.get(id);
    const ctx = context;
    if (!record || !ctx || ctx.mode !== "tui") return;
    await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
      openTuis.add(tui);
      const component = new AgentDetail(tui, theme, record, done, (prompt) => {
        if (record.status !== "running") return;
        record.transcript.push({ role: "user", text: prompt });
        void record.rpc?.steer(prompt).catch((error) => finish(record, "failed", error.message));
        refresh();
      }, () => void cancel(record));
      return Object.assign(component, { dispose: () => openTuis.delete(tui) });
    }, { overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", margin: 0 } });
  };

  const showManager = async () => {
    const ctx = context;
    if (!ctx || ctx.mode !== "tui") return;
    for (;;) {
      const id = await ctx.ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
        openTuis.add(tui);
        const component = new AgentList(tui, theme, allRecords, done);
        return Object.assign(component, { dispose: () => openTuis.delete(tui) });
      }, { overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", margin: 0 } });
      if (!id) return;
      await showDetail(id);
    }
  };

  pi.registerMessageRenderer(NOTICE_TYPE, (message) => new Text(textContent(message.content), 0, 0));

  pi.registerTool({
    name: AGENT_TOOL,
    label: "Agent",
    description: "Delegate a task to a fresh neutral Pi session. It returns an ID; use get_subagent_result to retrieve its latest final answer.",
    promptSnippet: "Delegate a bounded task to a fresh subagent",
    promptGuidelines: [
      "Delegate only when a separate context or parallel work saves more than the dispatch costs.",
      "Use Luna/medium for exploration; Luna/high for source-heavy research and tightly specified edits; Terra/high for broad implementation; Sol/high for review and consequential reasoning. Other valid combinations are allowed.",
    ],
    parameters: AgentSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: AgentParams, _signal, _onUpdate, ctx) {
      context = ctx;
      const valid = validateAgentRequest(params.model, params.effort, params.isolation);
      if (!valid.ok) throw new Error(valid.error);
      const scoped = ctx.scopedModels.length ? ctx.scopedModels.map(({ model }) => `${model.provider}/${model.id}`) : ctx.modelRegistry.getAvailable().map((model) => `${model.provider}/${model.id}`);
      if (!scoped.includes(params.model)) throw new Error(`Model is unavailable in this session: ${params.model}`);
      let record: AgentRecord;
      if (params.resume) {
        record = records.get(params.resume) ?? (() => { throw new Error(`Unknown agent: ${params.resume}`); })();
        if (record.status !== "completed") throw new Error(`Only completed agents can resume: ${params.resume}`);
        if (record.model !== params.model || record.effort !== params.effort || record.isolation !== params.isolation) {
          throw new Error("Resume must keep the original model, effort, and isolation");
        }
        record.description = params.description;
        record.background = params.run_in_background ?? true;
        record.status = "queued";
        record.completedAt = undefined;
        record.error = undefined;
        record.transcript.push({ role: "user", text: params.prompt });
        record.done = new Promise<void>((resolve) => { record.resolveDone = resolve; });
      } else {
        const id = randomUUID().slice(0, 8);
        let resolveDone!: () => void;
        record = {
          id,
          description: params.description,
          prompt: params.prompt,
          model: params.model,
          effort: params.effort,
          background: params.run_in_background ?? true,
          isolation: params.isolation,
          status: "queued",
          transcript: [],
          latestFinalText: "",
          done: new Promise<void>((resolve) => { resolveDone = resolve; }),
          resolveDone,
        };
        records.set(id, record);
      }
      startQueued(pool.enqueue(record.id));
      if (!record.background) await record.done;
      return { content: [{ type: "text", text: `${record.status} (${record.id})` }], details: { agent_id: record.id, status: record.status } };
    },
    renderCall(args, theme) { return new Text(`${theme.fg("toolTitle", theme.bold("Agent "))}${theme.fg("accent", String(args.description ?? ""))}`, 0, 0); },
  });

  pi.registerTool({
    name: RESULT_TOOL,
    label: "Get subagent result",
    description: "Return an agent's status and latest final assistant text. Set wait only to wait for it to settle.",
    parameters: ResultSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: Static<typeof ResultSchema>) {
      const record = records.get(params.agent_id);
      if (!record) throw new Error(`Unknown agent: ${params.agent_id}`);
      if (params.wait) await record.done;
      return { content: [{ type: "text", text: JSON.stringify({ status: record.status, result: record.latestFinalText }) }], details: { agent_id: record.id, status: record.status } };
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
      if (record.status !== "running") throw new Error(`Agent is not running: ${params.agent_id}`);
      record.transcript.push({ role: "user", text: params.prompt });
      await record.rpc?.steer(params.prompt);
      refresh();
      return { content: [{ type: "text", text: `Steered ${record.id}` }], details: { agent_id: record.id, status: record.status } };
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
    if (ctx.mode !== "tui") return;
    const previous = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => addAgentNavigation(
      previous ? previous(tui, theme, keybindings) : new CustomEditor(tui, theme, keybindings),
      () => activeRecords().map((record) => record.id),
      () => selectedId,
      (direction) => {
        const ids = activeRecords().map((record) => record.id);
        if (!ids.length) return;
        const index = Math.max(0, ids.indexOf(selectedId ?? ids[0]!));
        selectedId = ids[(index + direction + ids.length) % ids.length];
        tui.requestRender();
      },
      (id) => setTimeout(() => void showDetail(id), 0),
    ));
    refresh();
  });

  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    if (context?.mode === "tui") context.ui.setWidget(WIDGET_KEY, undefined);
    widgetVisible = false;
    await Promise.all(allRecords().map(async (record) => {
      await record.rpc?.terminate();
      if (record.worktree) await cleanupWorktree(pi, context?.cwd ?? process.cwd(), record.worktree, record.description);
    }));
    records.clear();
    pool = new AgentPool();
    openTuis.clear();
  });
}

function addAgentNavigation(editor: EditorComponent, activeIds: () => string[], selectedId: () => string | undefined, select: (direction: number) => void, open: (id: string) => void): EditorComponent {
  const handleInput = editor.handleInput.bind(editor);
  editor.handleInput = (data) => {
    const ids = activeIds();
    const empty = editor.getText().length === 0;
    if (ids.length && (matchesKey(data, Key.alt("j")) || (empty && (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl("n")))))) select(1);
    else if (ids.length && (matchesKey(data, Key.alt("k")) || (empty && (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl("p")))))) select(-1);
    else if (ids.length && empty && matchesKey(data, Key.enter)) open(selectedId() ?? ids[0]!);
    else handleInput(data);
  };
  return editor;
}

async function git(pi: ExtensionAPI, cwd: string, args: string[], timeout: number): Promise<string> {
  const result = await pi.exec("git", args, { cwd, timeout });
  if (result.killed || result.code !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

async function createWorktree(pi: ExtensionAPI, cwd: string, id: string): Promise<Worktree> {
  const baseSha = await git(pi, cwd, ["rev-parse", "HEAD"], 5000);
  const topLevel = await git(pi, cwd, ["rev-parse", "--show-toplevel"], 5000);
  const subdir = relative(realpathSync(topLevel), realpathSync(cwd));
  const path = join(tmpdir(), `pi-agent-${id}-${randomUUID().slice(0, 8)}`);
  await git(pi, cwd, ["worktree", "add", "--detach", path, "HEAD"], 30000);
  return { path, workPath: subdir ? join(path, subdir) : path, baseSha, branch: `pi-agent-${id}` };
}

async function cleanupWorktree(pi: ExtensionAPI, cwd: string, worktree: Worktree, description: string): Promise<void> {
  if (!existsSync(worktree.path)) return;
  const status = await git(pi, worktree.path, ["status", "--porcelain"], 10000);
  const head = await git(pi, worktree.path, ["rev-parse", "HEAD"], 5000);
  if (status) {
    await git(pi, worktree.path, ["add", "-A"], 10000);
    await git(pi, worktree.path, ["commit", "-m", `pi-agent: ${description.slice(0, 200)}`], 10000);
  }
  if (status || head !== worktree.baseSha) await git(pi, worktree.path, ["branch", worktree.branch], 5000);
  await git(pi, cwd, ["worktree", "remove", "--force", worktree.path], 10000);
}
