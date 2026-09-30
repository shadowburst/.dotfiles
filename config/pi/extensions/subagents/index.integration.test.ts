import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const indexUrl = new URL("./index.ts", import.meta.url).href;
const stateUrl = new URL("./state.ts", import.meta.url).href;
const packageSources = {
  "@earendil-works/pi-ai": `
    export const getSupportedThinkingLevels = () => ["off", "low", "high"];
    export const StringEnum = (values) => ({ enum: values });
  `,
  "@earendil-works/pi-coding-agent": `
    export const DEFAULT_MAX_BYTES = 50000;
    export const DEFAULT_MAX_LINES = 2000;
    export const getAgentDir = () => "/mock-agent";
    export const getMarkdownTheme = () => ({});
    export const childRegistrations = [];
    export class SettingsManager { static create() { return {}; } }
    export class SessionManager {
      static inMemory(cwd) {
        return { cwd, messages: [], appendMessage(message) { this.messages.push(message); } };
      }
    }
    export class DefaultResourceLoader {
      constructor(options) { this.options = options; }
      async reload() {
        const { default: extension } = await import(${JSON.stringify(indexUrl)});
        extension(new Proxy({}, { get: (_, name) => (...args) => childRegistrations.push([name, args]) }));
      }
    }
    export const createAgentSession = (options) => options.modelRuntime.createSession(options);
  `,
  "@earendil-works/pi-tui": `
    export class Input {}
    export class Markdown { constructor(text) { this.text = text; } render() { return this.text.split("\\n"); } }
    export class Text { constructor(text) { this.text = text; } render() { return [this.text]; } }
    export const Key = { ctrl: (key) => "ctrl+" + key, enter: "enter", escape: "escape" };
    export const matchesKey = (data, key) => data === key;
    export const truncateToWidth = (text) => text;
    export const visibleWidth = (text) => text.length;
    export const wrapTextWithAnsi = (text) => [text];
  `,
  typebox: `
    export const Type = {
      Object: (properties) => ({ properties }), String: () => ({}),
      Boolean: () => ({}), Optional: (value) => value,
    };
  `,
};

// Like question/index.integration.test.ts: no installed Pi packages or test
// dependencies. Load the actual lifecycle and state; only SDK boundaries are mocked.
register(`data:text/javascript,${encodeURIComponent(`
  const packages = ${JSON.stringify(packageSources)};
  export function resolve(specifier, context, nextResolve) {
    if (packages[specifier] !== undefined) return {
      url: "data:text/javascript," + encodeURIComponent(packages[specifier]), shortCircuit: true,
    };
    return nextResolve(specifier, context);
  }
  export async function load(url, context, nextLoad) {
    if ([${JSON.stringify(indexUrl)}, ${JSON.stringify(stateUrl)}].includes(url)) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const { stripTypeScriptTypes } = await import("node:module");
      let source = await readFile(fileURLToPath(url), "utf8");
      // Keep watchdogs real and their ordering: production 3s/5s -> 12ms/20ms.
      // Git's timeout arguments in state.ts are deliberately not transformed.
      if (url === ${JSON.stringify(indexUrl)}) source = source.replace(
        /(const\\s+\\w*(?:TIMEOUT|GRACE)\\w*\\s*=\\s*)(3_000|5_000|3000|5000)(?=\\s*;)/g,
        (_, declaration, value) => declaration + (value.startsWith("3") ? "12" : "20"),
      );
      return { format: "module", shortCircuit: true,
        source: stripTypeScriptTypes(source, { mode: "transform" }) };
    }
    return nextLoad(url, context);
  }
`)}`, import.meta.url);

const { default: subagentsExtension } = await import(indexUrl);
const sdk = await import("@earendil-works/pi-coding-agent");

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function bounded<T>(promise: Promise<T>, label: string, milliseconds = 500): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not settle within ${milliseconds}ms`)), milliseconds);
    })]);
  } finally { clearTimeout(timer!); }
}

async function eventually(check: () => boolean, label: string) {
  const deadline = Date.now() + 500;
  while (!check()) {
    assert.ok(Date.now() < deadline, `${label} did not occur within 500ms`);
    await delay(1);
  }
}

class MockSession {
  messages: any[] = [];
  promptGate = deferred();
  abortGate = deferred();
  shutdownGate = deferred();
  prompts: string[] = [];
  steers: string[] = [];
  abortCalls = 0;
  disposeCalls = 0;
  unsubscribeCalls = 0;
  shutdownEvents: any[] = [];
  listener?: (event: any) => void;
  steerError?: Error;
  bindError?: Error;
  hangShutdown = false;
  extensionRunner = {
    hasHandlers: (event: string) => event === "session_shutdown",
    emit: (event: any) => {
      this.shutdownEvents.push(event);
      return this.hangShutdown ? this.shutdownGate.promise : Promise.resolve();
    },
  };
  getContextUsage() { return undefined; }
  async bindExtensions(options: any) {
    assert.equal(options.mode, "print");
    if (this.bindError) throw this.bindError;
  }
  subscribe(listener: (event: any) => void) {
    this.listener = listener;
    return () => { this.unsubscribeCalls++; this.listener = undefined; };
  }
  prompt(text: string) {
    this.prompts.push(text);
    this.messages.push({ role: "user", content: text });
    return this.promptGate.promise;
  }
  abort() { this.abortCalls++; return this.abortGate.promise; }
  async steer(text: string) {
    if (this.steerError) throw this.steerError;
    this.steers.push(text);
  }
  dispose() { this.disposeCalls++; }
  finish(text = "child answer") {
    this.messages.push({ role: "assistant", content: [{ type: "text", text }], stopReason: "stop" });
    this.promptGate.resolve();
  }
  release() { this.promptGate.resolve(); this.abortGate.resolve(); this.shutdownGate.resolve(); }
}

type Result = { content: Array<{ text: string }>; details: { agent_id: string; status: string; worktree_path?: string } };
type Handler = (event: any, context: any) => any;

async function harness(t: any) {
  const tools = new Map<string, any>();
  // Both session_start registrations matter: catalog setup AND lifecycle reset.
  const handlers = new Map<string, Handler[]>();
  const sessions: MockSession[] = [];
  const options: any[] = [];
  const creationGates: ReturnType<typeof deferred>[] = [];
  const worktrees: string[] = [];
  const gitCalls: string[][] = [];
  const notices: any[] = [];
  let holdCreate = false;
  let holdWorktree = false;
  let holdCleanup = false;
  const worktreeGate = deferred();
  const cleanupGate = deferred();
  const runtime = {
    async createSession(config: any) {
      assert.equal(config.modelRuntime, runtime, "child must reuse parent's model runtime");
      options.push(config);
      const session = new MockSession();
      sessions.push(session);
      if (holdCreate) {
        const gate = deferred();
        creationGates.push(gate);
        await gate.promise;
      }
      return { session };
    },
  };
  const ctx = {
    cwd: process.cwd(), mode: "print", scopedModels: [],
    modelRegistry: { runtime, getAvailable: () => [{ provider: "mock", id: "model" }] },
    ui: { notify() {}, setWidget() {} },
  };
  const pi = {
    events: { on() {} },
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(tool: any) { tools.set(tool.name, tool); },
    registerCommand() {}, registerMessageRenderer() {},
    sendMessage(message: any) { notices.push(message); },
    async exec(command: string, args: string[]) {
      assert.equal(command, "git");
      gitCalls.push(args);
      let stdout = "";
      if (args[0] === "rev-parse") {
        stdout = args[1] === "--show-toplevel" ? ctx.cwd : args[1] === "--is-inside-work-tree" ? "true" : "base-sha";
      } else if (args[0] === "worktree" && args[1] === "add") {
        worktrees.push(args[3]!);
        await mkdir(args[3]!, { recursive: true });
        if (holdWorktree) await worktreeGate.promise;
      } else if (args[0] === "status") {
        if (holdCleanup) await cleanupGate.promise;
      } else if (args[0] === "worktree" && args[1] === "remove") {
        await rm(args[3]!, { recursive: true, force: true });
      }
      return { stdout, stderr: "", code: 0, killed: false };
    },
  };
  const emit = async (event: string) => {
    for (const handler of handlers.get(event) ?? []) await handler({ type: event }, ctx);
  };
  subagentsExtension(pi);
  assert.equal(handlers.get("session_start")?.length, 2);
  await emit("session_start");
  const call = (name: string, params: any, signal?: AbortSignal): Promise<Result> => {
    const tool = tools.get(name);
    assert.ok(tool, `${name} tool must be registered`);
    return tool.execute("integration-call", params, signal, undefined, ctx);
  };
  const params = { prompt: "do work", description: "integration child", model: "mock/model", effort: "low" };
  const start = (extra = {}, signal?: AbortSignal) => call("Agent", { ...params, ...extra }, signal);
  const result = (id: string, wait = false) => call("get_subagent_result", { agent_id: id, wait });
  const cancel = (id: string) => call("cancel_subagent", { agent_id: id });
  t.after(async () => {
    holdCreate = holdWorktree = holdCleanup = false;
    for (const gate of creationGates) gate.resolve();
    worktreeGate.resolve(); cleanupGate.resolve();
    for (const session of sessions) session.release();
    await delay(1);
    await bounded(emit("session_shutdown"), "harness teardown");
    await Promise.all(worktrees.map((path) => rm(path, { recursive: true, force: true })));
  });
  return {
    tools, handlers, sessions, options, worktrees, gitCalls, notices, start, result, cancel, call, emit,
    holdCreate() { holdCreate = true; }, releaseCreate() { for (const gate of creationGates) gate.resolve(); },
    holdWorktree() { holdWorktree = true; }, releaseWorktree() { worktreeGate.resolve(); },
    holdCleanup() { holdCleanup = true; }, releaseCleanup() { cleanupGate.resolve(); },
  };
}

test("registers dedicated cancellation and excludes every orchestration tool from child sessions", async (t) => {
  const h = await harness(t);
  const started = await h.start();
  assert.ok(h.tools.has("cancel_subagent"), "dedicated cancellation tool missing");
  assert.deepEqual([...h.options[0].excludeTools].sort(), ["Agent", "cancel_subagent", "get_subagent_result", "steer_subagent"].sort());
  assert.deepEqual(sdk.childRegistrations, [], "child resource reload must not register recursive orchestration");
  h.sessions[0]!.finish();
  assert.equal((await h.result(started.details.agent_id, true)).details.status, "completed");
});

test("cooperative cancellation stays stopping until delayed prompt and abort settle, then disposes", async (t) => {
  const h = await harness(t);
  const started = await h.start();
  const id = started.details.agent_id;
  const session = h.sessions[0]!;
  const cancelling = h.cancel(id);
  await eventually(() => session.abortCalls > 0, "abort requested");
  assert.equal((await h.result(id)).details.status, "stopping");
  let waited = false;
  const waiting = h.result(id, true).then((value) => { waited = true; return value; });
  await delay(2);
  assert.equal(waited, false, "wait:true must include stopping agents");
  session.abortGate.resolve();
  session.promptGate.resolve();
  await bounded(cancelling, "cancel tool");
  assert.equal((await bounded(waiting, "cooperative cancellation")).details.status, "cancelled");
  assert.equal(session.disposeCalls, 1);
  assert.equal(session.unsubscribeCalls, 1);
  assert.equal(session.shutdownEvents[0]?.type, "session_shutdown");
});

test("foreground cooperative cancellation disposes the cancelled session", async (t) => {
  const h = await harness(t);
  const controller = new AbortController();
  const foreground = h.start({ run_in_background: false }, controller.signal);
  await eventually(() => h.sessions[0]?.prompts.length === 1, "foreground prompt");
  const session = h.sessions[0]!;
  controller.abort();
  await eventually(() => session.abortCalls > 0, "cooperative abort");
  session.abortGate.resolve(); session.promptGate.resolve();
  assert.equal((await bounded(foreground, "cooperative foreground cancellation")).details.status, "cancelled");
  assert.equal(session.disposeCalls, 1);
  assert.equal(session.unsubscribeCalls, 1);
});

test("hung foreground abort becomes unresponsive and releases a pool slot", async (t) => {
  const h = await harness(t);
  const controller = new AbortController();
  const foreground = h.start({ run_in_background: false }, controller.signal);
  await eventually(() => h.sessions[0]?.prompts.length === 1, "foreground prompt");
  // Fill the remaining slots, leaving one queued agent to prove recovery.
  for (let index = 0; index < 7; index++) await h.start();
  const queued = await h.start();
  assert.equal(queued.details.status, "queued");
  controller.abort();
  const final = await bounded(foreground, "5s cancellation watchdog (20ms in loader)");
  assert.equal(final.details.status, "unresponsive");
  assert.match(final.content[0]!.text, /unresponsive|abort|stop/i);
  await eventually(() => h.sessions.length === 9, "queued work released after watchdog");
  assert.equal(h.sessions[0]!.disposeCalls, 1);
  h.sessions[0]!.finish("late answer must not overwrite unresponsive");
  await delay(2);
  assert.equal((await h.result(final.details.agent_id)).details.status, "unresponsive");
});

test("hung isolated cancellation preserves edits without cleaning a possibly active worktree", async (t) => {
  const h = await harness(t);
  const started = await h.start({ isolation: "worktree" });
  const path = h.worktrees[0]!;
  await writeFile(`${path}/edit.txt`, "unfinished work");
  const stopped = await bounded(h.cancel(started.details.agent_id), "hung isolated cancellation");
  assert.equal(stopped.details.status, "unresponsive");
  assert.equal(stopped.details.worktree_path, path);
  assert.equal(await readFile(`${path}/edit.txt`, "utf8"), "unfinished work");
  assert.equal(h.gitCalls.some((args) => args[0] === "status" || (args[0] === "worktree" && args[1] === "remove")), false);
  await bounded(h.cancel(started.details.agent_id), "repeated cancellation");
  assert.equal(h.sessions[0]!.disposeCalls, 1);
});

test("queued cancellation settles without creating a child or starting it later", async (t) => {
  const h = await harness(t);
  for (let index = 0; index < 8; index++) await h.start();
  const queued = await h.start();
  const id = queued.details.agent_id;
  assert.equal(queued.details.status, "queued");
  await bounded(h.cancel(id), "queued cancellation");
  assert.equal((await h.result(id, true)).details.status, "cancelled");
  h.sessions[0]!.finish();
  await delay(2);
  assert.equal(h.sessions.length, 8);
});

test("extension binding failure disposes the partially created session", async (t) => {
  const h = await harness(t);
  h.holdCreate();
  const foreground = h.start({ run_in_background: false });
  await eventually(() => h.sessions.length === 1, "child creation");
  h.sessions[0]!.bindError = new Error("binding failed");
  h.releaseCreate();
  const result = await bounded(foreground, "failed child binding");
  assert.equal(result.details.status, "failed");
  assert.match(result.content[0]!.text, /binding failed/);
  assert.equal(h.sessions[0]!.disposeCalls, 1);
});

test("a child created after cancellation is disposed and never prompted", async (t) => {
  const h = await harness(t);
  h.holdCreate();
  const controller = new AbortController();
  const foreground = h.start({ run_in_background: false }, controller.signal);
  await eventually(() => h.sessions.length === 1, "pending child creation");
  controller.abort();
  const final = await bounded(foreground, "cancellation during child creation");
  assert.ok(["cancelled", "unresponsive"].includes(final.details.status));
  h.releaseCreate();
  await eventually(() => h.sessions[0]!.disposeCalls === 1, "late child disposal");
  assert.deepEqual(h.sessions[0]!.prompts, []);
  assert.equal((await h.result(final.details.agent_id)).details.status, final.details.status);
});

test("a worktree created after cancellation is preserved, not cleaned up or used", async (t) => {
  const h = await harness(t);
  h.holdWorktree();
  const controller = new AbortController();
  const foreground = h.start({ isolation: "worktree", run_in_background: false }, controller.signal);
  await eventually(() => h.worktrees.length === 1, "pending worktree creation");
  controller.abort();
  const final = await bounded(foreground, "cancellation during worktree creation");
  h.releaseWorktree();
  await delay(10);
  assert.equal(h.sessions.length, 0);
  assert.equal(existsSync(h.worktrees[0]!), true, "late worktree must remain on disk");
  assert.equal(h.gitCalls.some((args) => args[0] === "status" || (args[0] === "worktree" && args[1] === "remove")), false);
  const result = await h.result(final.details.agent_id);
  assert.equal(result.details.worktree_path, h.worktrees[0]);
  assert.match(result.content[0]!.text, /preserved/i);
});

test("parent shutdown is bounded when settlement is already stuck in worktree cleanup", async (t) => {
  const h = await harness(t);
  h.holdCleanup();
  await h.start({ isolation: "worktree" });
  h.sessions[0]!.finish();
  await eventually(() => h.gitCalls.some((args) => args[0] === "status"), "settlement cleanup entered");
  await bounded(h.emit("session_shutdown"), "shutdown with hung settlement cleanup");
  assert.equal(h.sessions[0]!.disposeCalls, 1);
  assert.equal(existsSync(h.worktrees[0]!), true, "hung cleanup must preserve worktree");
  h.releaseCleanup();
});

test("child shutdown hooks cannot block cancellation or parent shutdown", async (t) => {
  const h = await harness(t);
  const controller = new AbortController();
  const foreground = h.start({ run_in_background: false }, controller.signal);
  await eventually(() => h.sessions[0]?.prompts.length === 1, "foreground started");
  const session = h.sessions[0]!;
  session.hangShutdown = true;
  controller.abort();
  session.abortGate.resolve(); session.promptGate.resolve();
  assert.equal((await bounded(foreground, "cancel with hung child shutdown")).details.status, "cancelled");
  assert.equal(session.disposeCalls, 1);
  await bounded(h.emit("session_shutdown"), "bounded parent shutdown");
});

test("steering failure reaches the caller as a diagnostic, without losing the running child", async (t) => {
  const h = await harness(t);
  const started = await h.start();
  const session = h.sessions[0]!;
  session.steerError = new Error("steering transport unavailable");
  await assert.rejects(h.call("steer_subagent", { agent_id: started.details.agent_id, message: "change direction" }), /steering transport unavailable/);
  assert.equal((await h.result(started.details.agent_id)).details.status, "running");
  session.finish();
  assert.equal((await h.result(started.details.agent_id, true)).details.status, "completed");
});
