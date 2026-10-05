import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";
import { registerBrowserTestLoader } from "./test-loader.mjs";

// Only this lifecycle suite substitutes the Playwright boundary. Safety claims live in real.integration.test.ts.
registerBrowserTestLoader({ playwrightSource: `
  import { mkdir, writeFile } from "node:fs/promises";
  import { dirname, join } from "node:path";
  const mock = () => globalThis.__playwrightMock;
  class Locator {
    constructor(page, selector) { this.page = page; this.selector = selector; }
    async count() { return this.selector === '#missing' ? 0 : 1; }
    async isVisible() { return this.selector !== '#missing'; }
    async evaluate(fn, args) {
      const source = fn.toString();
      if (fn.name === 'evidence') return { unsafe: mock().authBlocked };
      if (fn.name === 'snapshotMetadata') {
        if (mock().failSnapshotMetadataOnce && this.selector.startsWith('aria-ref=')) { mock().failSnapshotMetadataOnce = false; throw new Error('Snapshot ref detached'); }
        return { editable: false, containsEditor: false, field: this.selector === 'aria-ref=e2' };
      }
      if (source.includes('Math.max(0, rect.left)')) return { x: 50, y: 10 };
      if (source.includes('return element.type')) return 'text';
      if (source.includes('element.isConnected')) return true;
      if (source.includes('element.focus()')) { this.page.focusedSelector = this.selector; mock().calls.push(['focus', this.selector]); return; }
      return true;
    }
    async evaluateHandle() { this.page.mouseTarget = this.selector; return this; }
    async elementHandles() { return await this.count() ? [this] : []; }
    asElement() { return this; }
    async dispose() {}
    async ownerFrame() { return this.page; }
    async boundingBox() { return { x: 0, y: 0, width: 100, height: 20 }; }
    async waitForElementState(state, options) { mock().calls.push(['waitForState', this.selector, state]); options?.signal?.throwIfAborted(); }
    async waitFor(options) { mock().calls.push(['waitFor', this.selector, options?.state]); options?.signal?.throwIfAborted(); }
    async click(options) { if (!options?.trial) mock().calls.push(['click', this.selector]); }
    async fill(value) { mock().calls.push(['fill', this.selector, value]); }
    async focus() { mock().calls.push(['focus', this.selector]); }
    async pressSequentially(value) { mock().calls.push(['type', this.selector, value]); }
    async press(value) { mock().calls.push(['press', this.selector, value]); }
    async inputValue() { return 'Demo'; }
    async innerText() { return 'Saved successfully'; }
    async setChecked(value) { mock().calls.push(['checked', this.selector, value]); }
    async selectOption(values) { mock().calls.push(['select', this.selector, values]); }
    async scrollIntoViewIfNeeded() {}
    async ariaSnapshotJSON() { return [{ role: 'textbox', name: 'Title', ref: 'e2', text: 'SYNTHETIC_FIELD_SECRET' }]; }
  }
  class Page {
    constructor(context) {
      this.owner = context; this.currentUrl = 'about:blank'; this.listeners = new Map();
      this.keyboard = {
        press: async value => mock().calls.push(['keyboard', value]),
        insertText: async value => mock().calls.push(['fill', this.focusedSelector, value]),
        type: async value => mock().calls.push(['type', this.focusedSelector, value]),
      };
      this.mouse = {
        wheel: async (x,y) => mock().calls.push(['wheel', x, y]),
        move: async (x,y) => mock().calls.push(['move', x, y]),
        down: async () => mock().calls.push(['down']),
        up: async () => mock().calls.push(['click', this.mouseTarget]),
      };
    }
    on(name, handler) { this.listeners.set(name, handler); }
    context() { return this.owner; }
    frames() { return [this]; }
    parentFrame() { return null; }
    isClosed() { return false; }
    async evaluate(_fn, options) { return options?.focused ? { unsafe: mock().authBlocked } : { gate: mock().authBlocked }; }
    async goto(url) { this.currentUrl = url; mock().calls.push(['goto', url]); this.listeners.get('framenavigated')?.(this); return { status: () => 200 }; }
    url() { return this.currentUrl; }
    async title() { return 'Test page'; }
    locator(selector) { return new Locator(this, selector); }
    async ariaSnapshotJSON() { return [{ role: 'button', name: 'Save', ref: 'e1' }, { role: 'textbox', name: 'Title', ref: 'e2', text: 'SYNTHETIC_FIELD_SECRET' }, { role: 'paragraph', ref: 'e3', text: 'Saved successfully' }]; }
    async setViewportSize(value) { mock().calls.push(['viewport', value]); }
    async screenshot(options) { mock().calls.push(['screenshot.mask', options.mask?.map(locator => locator.selector)]); await writeFile(options.path, 'png'); return Buffer.from('png'); }
    video() { return this.owner.videoPath ? {
      saveAs: async path => { mock().calls.push(['video.saveAs', path]); await mkdir(dirname(path), {recursive:true}); await writeFile(path, Buffer.from('1a45dfa3874282847765626d','hex')); },
    } : null; }
  }
  class Context {
    constructor(options) { this.options = options; this.pagesList = []; this.listeners = new Map(); this.videoPath = options.recordVideo && join(options.recordVideo.dir, 'raw.webm'); }
    on(name, handler) { this.listeners.set(name, handler); }
    setDefaultTimeout() {}
    setDefaultNavigationTimeout() {}
    async newPage() { const page = new Page(this); this.pagesList.push(page); this.listeners.get('page')?.(page); return page; }
    pages() { return this.pagesList; }
    async storageState(options = {}) {
      if (mock().failStorageStateOnce) { mock().failStorageStateOnce = false; throw new Error('state write failed'); }
      mock().calls.push(['storageState', options]);
      return { cookies: [{ name:'session', value:'token', domain:'example.com', path:'/', expires:-1, httpOnly:true, secure:true, sameSite:'Lax' }], origins:[{origin:'https://example.com',localStorage:[],indexedDB:[]}] };
    }
    async close() { mock().calls.push(['context.close']); if (mock().failCloseOnce) { mock().failCloseOnce = false; throw new Error('close failed'); } }
  }
  class Browser {
    async newContext(options = {}) { mock().calls.push(['newContext', options]); if (mock().failContexts) { mock().failContexts--; throw new Error('browser unavailable'); } return new Context(options); }
    async close() { mock().calls.push(['browser.close']); }
  }
  export const chromium = { launch: async options => { mock().calls.push(['launch', options]); return new Browser(); } };
  export const devices = {'Test Phone':{defaultBrowserType:'chromium',viewport:{width:390,height:844},userAgent:'phone',isMobile:true,hasTouch:true}};
` });
const { Value } = await import("typebox/value");
const { default: browserExtension } = await import("./index.ts");

type Mock = { calls: any[][]; authBlocked: boolean; failContexts: number; failCloseOnce: boolean; failStorageStateOnce: boolean; failSnapshotMetadataOnce: boolean };
const mock: Mock = { calls: [], authBlocked: false, failContexts: 0, failCloseOnce: false, failStorageStateOnce: false, failSnapshotMetadataOnce: false };
(globalThis as any).__playwrightMock = mock;
type ExecResult = { code: number; stdout: string; stderr: string };
type Exec = (command: string, args: string[], options?: any) => Promise<ExecResult>;
const noExec: Exec = async command => { throw new Error(`Unexpected external process: ${command}`); };
const noUI = { hasUI: false, ui: {} };
const yesUI = { hasUI: true, ui: { confirm: async () => true } };
let home: string;
let previous: Record<string, string | undefined>;
const sessions: Array<{ handlers: Map<string, any> }> = [];
const ownedWorkRoots = new Set<string>();

test.beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pi-browser-interface-"));
  previous = Object.fromEntries(["HOME", "XDG_STATE_HOME", "TMPDIR", "PI_BROWSER_HEADLESS"].map(key => [key, process.env[key]]));
  process.env.HOME = home; process.env.XDG_STATE_HOME = join(home, "state"); delete process.env.PI_BROWSER_HEADLESS;
  await mkdir(join(home, "tmp"), { mode: 0o700 }); process.env.TMPDIR = join(home, "tmp");
  Object.assign(mock, { authBlocked: false, failContexts: 0, failCloseOnce: false, failStorageStateOnce: false, failSnapshotMetadataOnce: false }); mock.calls.length = 0;
});
test.afterEach(async () => {
  try { for (const session of sessions.splice(0)) await session.handlers.get("session_shutdown")?.({}, noUI); }
  finally {
    for (const root of ownedWorkRoots) await rm(root, { recursive: true, force: true });
    ownedWorkRoots.clear();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(home, { recursive: true, force: true });
  }
});
function extension(exec: Exec = noExec, gitCommonDirectory?: string) {
  const tools = new Map<string, any>(); const handlers = new Map<string, any>(); const entries: any[] = [];
  let active = ["read", "browser_record"];
  browserExtension({
    exec: (command: string, args: string[], options: any) => command === "git" ? Promise.resolve({ code: gitCommonDirectory ? 0 : 1, stdout: gitCommonDirectory ?? "", stderr: "" }) : exec(command, args, options),
    getActiveTools: () => active, setActiveTools: (next: string[]) => { active = next; },
    on: (name: string, handler: any) => handlers.set(name, handler), registerTool: (tool: any) => tools.set(tool.name, tool),
    appendEntry: (customType: string, data: any) => entries.push({ type: "custom", customType, data }),
  } as any);
  const call = async (name: string, params: any, ctx = noUI, signal?: AbortSignal) => {
    const result = await tools.get(name).execute("test", params, signal, undefined, ctx);
    const work = result.structuredContent?.artifacts?.workDirectory;
    if (work?.startsWith(join(tmpdir(), "pi-cutaway-"))) ownedWorkRoots.add(join(work, ".."));
    assert.equal(Value.Check(tools.get(name).outputSchema, result.structuredContent), true, JSON.stringify(result));
    assert.deepEqual(result.details, result.structuredContent);
    if (result.structuredContent.status === "error") assert.equal(result.isError, true);
    return result;
  };
  const session = { tools, handlers, entries, call, active: () => active };
  sessions.push(session);
  handlers.get("session_start")?.({}, { ...noUI, cwd: home, sessionManager: { getBranch: () => [] } });
  return session;
}
function ok(result: any) { assert.equal(result.structuredContent.status, "ok", JSON.stringify(result)); return result.structuredContent.result; }
function error(result: any, code?: string) { assert.equal(result.structuredContent.status, "error"); assert.equal(result.isError, true); if (code) assert.equal(result.structuredContent.errorCode, code); return result.structuredContent; }
async function stateFile() { const directory = join(home, "state", "pi", "browser"); const [name] = (await readdir(directory)).filter(name => name.endsWith(".json")); return join(directory, name); }

// Structural media stands in for external codecs here; export.test.ts separately probes/decodes real media.
const mp4 = Buffer.from("000000186674797069736f6d0000000069736f6d6d703432", "hex");
const webm = Buffer.from("1a45dfa3874282847765626d", "hex");
function pngChunk(type: string, bytes: Buffer) {
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const payload = Buffer.concat([Buffer.from(type), bytes]);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, checksum]);
}
async function captured(work: string, zoomEpisodes = 1) {
  await mkdir(join(work, "frames"), { recursive: true });
  const header = Buffer.alloc(13); header.writeUInt32BE(320, 0); header.writeUInt32BE(320, 4); header[8] = 8; header[9] = 2;
  await writeFile(join(work, "frames/000000.png"), Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(Buffer.alloc(320 * (320 * 3 + 1)))), pngChunk("IEND", Buffer.alloc(0))]));
  await writeFile(join(work, "timeline.json"), JSON.stringify({
    version: 1, status: "complete", viewport: { width: 320, height: 320 }, capture: { scale: 1, format: "png" }, duration: 1,
    frames: [{ t: 0, file: "frames/000000.png" }], points: [{ t: 0, x: 1, y: 1 }, { t: 1, x: 2, y: 2 }], clicks: [], focuses: [], scrolls: [], cursors: [], keys: [],
    steps: [{ action: "click", start: 0, actionStart: 0, interactionEnd: 0.5, expectationEnd: 0.75, end: 1 }],
  }));
  const output = join(work, "video.mp4"); await writeFile(output, mp4);
  await writeFile(join(work, "render.json"), JSON.stringify({ output, duration: 1, capturedDuration: 1, width: 1280, height: 720, fps: 24, capturedFrames: 1, outputFrames: 24, renderSeconds: 0.5, settings: { quality: "standard" }, motion: { zoomEpisodes } }));
  await writeFile(join(work, "workflow.json"), JSON.stringify({ timings: { recordSeconds: 1 } }));
  return output;
}
function codecs(calls: any[][] = []): Exec {
  return async (command, args, options) => {
    calls.push([command, args, options]);
    if (command === "ffprobe") return { code: 0, stdout: JSON.stringify({ streams: [{ codec_type: "video", codec_name: args.at(-1)!.endsWith(".mp4") ? "h264" : "vp9", width: 1280, height: 720 }], format: { format_name: args.at(-1)!.endsWith(".mp4") ? "mp4" : "webm", duration: "1" } }), stderr: "" };
    assert.equal(command, "ffmpeg");
    if (args.at(-1) === "-") return { code: 0, stdout: "0, 0, 0, 1, 12, 0123456789abcdef0123456789abcdef", stderr: "" };
    await writeFile(args.at(-1)!, webm); return { code: 0, stdout: "", stderr: "" };
  };
}
async function plan(steps: any[] = [{ action: "click", selector: "#save", expect: "#success" }]) {
  const path = join(home, "journey.json"); await writeFile(path, JSON.stringify({ url: "https://example.com", steps })); return path;
}

test("registers lazy catalog with genuine typed schemas and human-only/one-submission guidance", () => {
  const { tools, active } = extension();
  assert.deepEqual([...tools.keys()], ["browser_tools", "browser_open", "browser_action", "browser_screenshot", "browser_record", "browser_recover", "browser_record_live", "browser_clear_state", "browser_handoff"]);
  assert.deepEqual(active(), ["read", "browser_tools"]);
  assert.match(tools.get("browser_tools").promptGuidelines[0], /Authentication is human-only/);
  assert.match(tools.get("browser_tools").promptGuidelines[0], /submit only once/);
  const schema = tools.get("browser_action").parameters;
  assert.equal(Value.Check(schema, { action: "fill", selector: "#title", value: "Demo", timeout: 1 }), true);
  assert.equal(Value.Check(schema, { args: ["eval", "1"] }), false);
  assert.equal(Value.Check(schema, { action: "click", selector: "#save", extra: true }), false);
});

test("activation retains unrelated tools and does not launch Chromium", async () => {
  const session = extension();
  const loaded = ok(await session.call("browser_tools", { tools: ["browser_open", "browser_action"] }));
  assert.deepEqual(loaded.loaded, ["browser_open", "browser_action"]);
  assert.deepEqual(session.active(), ["read", "browser_tools", "browser_open", "browser_action"]);
  assert.equal(mock.calls.length, 0);
});

test("persists private IndexedDB-aware auth state and shares it across repository worktrees", async () => {
  const git = join(home, "repo/.git"); const first = extension(noExec, git);
  ok(await first.call("browser_open", { url: "https://example.com" }));
  await first.handlers.get("agent_settled")({}, noUI);
  const file = await stateFile();
  assert.equal((await stat(join(home, "state/pi/browser"))).mode & 0o777, 0o700);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(file, "utf8")).cookies[0].value, "token");
  assert(mock.calls.some(call => call[0] === "storageState" && call[1].indexedDB === true));
  const second = extension(noExec, git);
  second.handlers.get("session_start")({}, { ...noUI, cwd: join(home, "worktree"), sessionManager: { getBranch: () => [] } });
  ok(await second.call("browser_open", { url: "https://example.com/account" }));
  assert(mock.calls.some(call => call[0] === "newContext" && call[1].storageState?.cookies[0].value === "token"));
});

test("quarantines malformed state without importing credentials", async () => {
  const first = extension(); await first.call("browser_open", { url: "https://example.com" }); await first.handlers.get("agent_settled")({}, noUI);
  const file = await stateFile(); await writeFile(file, "null"); mock.calls.length = 0;
  ok(await extension().call("browser_open", { url: "https://example.com" }));
  assert(mock.calls.some(call => call[0] === "newContext" && !call[1].storageState));
  assert.equal((await readdir(join(home, "state/pi/browser"))).filter(name => name.endsWith(".invalid")).length, 1);
});

test("one generic context failure preserves valid state and never retries fresh", async () => {
  const first = extension(); await first.call("browser_open", { url: "https://example.com" }); await first.handlers.get("agent_settled")({}, noUI);
  const file = await stateFile(); const before = await readFile(file, "utf8");
  mock.failContexts = 1; mock.calls.length = 0;
  error(await extension().call("browser_open", { url: "https://example.com" }), "operation_failed");
  assert.equal(mock.calls.filter(call => call[0] === "newContext").length, 1);
  assert.equal(await readFile(file, "utf8"), before);
});

test("persistence-error lifecycle cleanup still closes context and browser", async () => {
  const session = extension(); await session.call("browser_open", { url: "https://example.com" }); mock.failStorageStateOnce = true;
  const notices: string[] = [];
  await session.handlers.get("agent_settled")({}, { hasUI: true, ui: { notify: (message: string) => notices.push(message) } });
  assert.equal(notices.length, 1);
  assert(mock.calls.some(call => call[0] === "context.close"));
  assert(mock.calls.some(call => call[0] === "browser.close"));
});

test("clear-state is confirmation-only and deletes only the current project state", async () => {
  const session = extension(); await session.call("browser_open", { url: "https://example.com" }); await session.handlers.get("agent_settled")({}, noUI);
  const file = await stateFile(); const other = join(home, "state/pi/browser/other.json"); await writeFile(other, "other project");
  assert.equal(ok(await session.call("browser_clear_state", {}, { hasUI: true, ui: { confirm: async () => false } })).cleared, false);
  assert.ok(await stat(file));
  assert.equal(ok(await session.call("browser_clear_state", {}, yesUI)).cleared, true);
  await assert.rejects(stat(file), /ENOENT/); assert.equal(await readFile(other, "utf8"), "other project");
});

test("typed actions use native refs, strict selectors, headed launch and private screenshots", async () => {
  const session = extension(); await session.call("browser_open", { url: "https://example.com" });
  const snapshot = ok(await session.call("browser_action", { action: "snapshot" }));
  assert.deepEqual(JSON.parse(snapshot.snapshot)[0], { role: "button", name: "Save", ref: "e1" });
  assert.doesNotMatch(snapshot.snapshot, /SYNTHETIC_FIELD_SECRET/);
  ok(await session.call("browser_action", { action: "click", selector: "@e1" }));
  ok(await session.call("browser_action", { action: "fill", selector: "input[name=title]", value: "Demo" }));
  error(await session.call("browser_action", { action: "fill", selector: "@e2", value: "stale" }), "stale_ref");
  ok(await session.call("browser_action", { action: "type", selector: "input[name=title]", value: " plus" }));
  const shot = await session.call("browser_screenshot", { fullPage: true });
  assert.equal(shot.content[1].data, Buffer.from("png").toString("base64"));
  assert.equal((await stat(ok(shot).path)).mode & 0o777, 0o600);
  assert.deepEqual(mock.calls.find(call => call[0] === "screenshot.mask")?.[1], ['input,textarea,[contenteditable]']);
  await rm(join(ok(shot).path, ".."), { recursive: true, force: true });
  ok(await session.call("browser_action", { action: "device", name: "Test Phone" }));
  assert(mock.calls.some(call => call[0] === "newContext" && call[1].viewport.width === 390));
  assert(mock.calls.some(call => call[0] === "launch" && !call[1].headless && call[1].args.includes("--class=pi-browser-tools")));
  assert(mock.calls.some(call => call[0] === "click" && call[1] === "aria-ref=e1"));
});

test("snapshot metadata failures return no raw output and invalidate prior refs", async () => {
  const session = extension(); await session.call("browser_open", { url: "https://example.com" });
  ok(await session.call("browser_action", { action: "snapshot" }));
  mock.failSnapshotMetadataOnce = true;
  const failed = await session.call("browser_action", { action: "snapshot" });
  assert.equal(error(failed).snapshotFresh, false);
  assert.doesNotMatch(JSON.stringify(failed), /SYNTHETIC_FIELD_SECRET|Saved successfully/);
  error(await session.call("browser_action", { action: "click", selector: "@e1" }), "stale_ref");
  ok(await session.call("browser_action", { action: "snapshot" }));
  ok(await session.call("browser_action", { action: "click", selector: "@e1" }));
});

test("unsafe auth handoff assumptions are rejected; safe observations remain available", async () => {
  const session = extension(); mock.authBlocked = true;
  error(await session.call("browser_open", { url: "https://example.com/login" }), "auth_required");
  error(await session.call("browser_handoff", { message: "Log in" }, yesUI), "auth_required");
  error(await session.call("browser_action", { action: "fill", selector: "#password", value: "never sent" }), "auth_required");
  ok(await session.call("browser_action", { action: "snapshot" }));
  assert.equal(mock.calls.filter(call => ["fill", "click", "keyboard"].includes(call[0])).length, 0);
  assert.equal(mock.calls.filter(call => call[0] === "storageState").length, 0);
});

test("general non-auth human handoffs remain usable and save private state", async () => {
  const session = extension(); await session.call("browser_open", { url: "https://example.com" });
  let prompt = "";
  const result = ok(await session.call("browser_handoff", { message: "Review the editor" }, { hasUI: true, ui: { confirm: async (_title: string, message: string) => { prompt = message; return true; } } }));
  assert.equal(result.confirmed, true); assert.match(prompt, /Review the editor/); assert.ok(await stat(await stateFile()));
});

test("scoped snapshot and schema validation reject unsafe grammar before browser interaction", async () => {
  const session = extension();
  for (const input of [{ args: ["snapshot"] }, { action: "eval", expression: "1" }, { action: "viewport", width: 0, height: 720 }, { action: "click", selector: "#save", timeout: 30001 }]) error(await session.call("browser_action", input), "invalid_input");
  assert.equal(mock.calls.length, 0);
  const scoped = ok(await session.call("browser_action", { action: "snapshot", selector: "#form", depth: 2 }));
  assert.equal(scoped.omission.scoped, true); assert.match(scoped.omission.reobserve, /full context/);
});

test("plan schema failure returns isError without opening a browser or recording", async () => {
  const path = await plan(); const commands: string[] = [];
  const session = extension(async (command, args) => { commands.push(`${command} ${args[0]}`); return { code: 1, stdout: "", stderr: "invalid schema" }; });
  error(await session.call("browser_record", { plan: path }), "invalid_plan");
  assert.deepEqual(commands, ["cutaway validate"]); assert.equal(mock.calls.length, 0);
});

test("Cutaway plans require stable scoped selectors and a fresh success expectation", async () => {
  const session = extension();
  for (const steps of [[{ action: "click", selector: "@e1", expect: "#success" }], [{ action: "click", selector: "aria-ref=f1e3", expect: "#success" }], [{ action: "click", selector: "#save" }]]) error(await session.call("browser_record", { plan: await plan(steps) }), "invalid_input");
  assert.equal(mock.calls.length, 0);
});

test("cinematic capture stays standard 720p, refreshes state and atomically publishes one WebM", async () => {
  const path = await plan(); const calls: any[][] = []; const codec = codecs(calls); let work = "";
  const session = extension(async (command, args, options) => {
    if (command !== "cutaway") return codec(command, args, options);
    calls.push([command, args, options]);
    if (args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    work = args[args.indexOf("--out") + 1]; const output = await captured(work); return { code: 0, stdout: JSON.stringify({ output }), stderr: "" };
  });
  await session.call("browser_open", { url: "https://example.com" });
  const result = ok(await session.call("browser_record", { plan: path, name: "checkout" }));
  assert.equal(result.path, join(home, "Videos/Recordings/checkout.webm")); assert.deepEqual(await readFile(result.path), webm);
  assert.deepEqual(result.motion, { cursorPoints: 2, zoomEpisodes: 1 }); assert.equal(result.businessOutcome, "unknown");
  const record = calls.find(call => call[0] === "cutaway" && call[1][0] === "record")![1];
  assert.deepEqual(record.slice(-6), ["--width", "1280", "--height", "720", "--quality", "standard"]);
  assert.equal(JSON.parse(await readFile(record[record.indexOf("--storage-state") + 1], "utf8")).cookies[0].value, "token");
  await assert.rejects(stat(work), /ENOENT/);
  assert.equal(session.entries.at(-1).data.captureStatus, "complete");
});

test("an existing output name is rejected before capture can dispatch application input", async () => {
  const directory = join(home, "Videos", "Recordings"); await mkdir(directory, { recursive: true });
  const path = join(directory, "existing.webm"); await writeFile(path, "previous output");
  const calls: string[] = [];
  const session = extension(async (_command, args) => { calls.push(args[0]); return { code: 0, stdout: "", stderr: "" }; });
  const blocked = error(await session.call("browser_record", { plan: await plan(), name: "existing" }), "destination_exists");
  assert.equal(blocked.dispatch, "not-attempted"); assert.deepEqual(calls, ["validate"]);
  assert.equal(await readFile(path, "utf8"), "previous output"); assert.equal(mock.calls.length, 0);
});

test("capture failure preserves artifacts and unknown business outcome without conversion", async () => {
  const path = await plan(); let work = ""; const calls: string[] = [];
  const session = extension(async (command, args) => {
    calls.push(`${command} ${args[0]}`); assert.equal(command, "cutaway");
    if (args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    work = args[args.indexOf("--out") + 1]; await mkdir(work, { recursive: true }); await writeFile(join(work, "manifest.json"), "partial");
    return { code: 1, stdout: "", stderr: "Step failed" };
  });
  const result = error(await session.call("browser_record", { plan: path }), "capture_failed");
  assert.equal(result.artifacts.workDirectory, work); assert.equal(result.businessOutcome, "unknown");
  assert.equal(await readFile(join(work, "manifest.json"), "utf8"), "partial"); assert.deepEqual(calls, ["cutaway validate", "cutaway record"]);
  await rm(join(work, ".."), { recursive: true, force: true });
});

test("missing cinematic motion fails closed and keeps the destination absent", async () => {
  const path = await plan(); const codec = codecs(); let work = "";
  const session = extension(async (command, args, options) => {
    if (command !== "cutaway") return codec(command, args, options);
    if (args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    work = args[args.indexOf("--out") + 1]; return { code: 0, stdout: JSON.stringify({ output: await captured(work, 0) }), stderr: "" };
  });
  error(await session.call("browser_record", { plan: path, name: "no-motion" }), "export_failed");
  await assert.rejects(stat(join(home, "Videos/Recordings/no-motion.webm")), /ENOENT/); assert.ok(await stat(join(work, "timeline.json")));
  await rm(join(work, ".."), { recursive: true, force: true });
});

test("live recording is explicit, uses Video.saveAs, and does not run Cutaway", async () => {
  const calls: any[][] = []; const session = extension(codecs(calls));
  await session.call("browser_open", { url: "https://example.com" });
  assert.equal(ok(await session.call("browser_record_live", { action: "start", name: "live" })).recording, "started");
  const result = ok(await session.call("browser_record_live", { action: "stop" })); assert.deepEqual(await readFile(result.path), webm);
  assert.equal(calls.some(call => call[0] === "cutaway"), false); assert(mock.calls.some(call => call[0] === "video.saveAs"));
});

test("observing an auth gate pauses native video before any no-UI human handoff", async () => {
  const session = extension(codecs()); await session.call("browser_record_live", { action: "start", name: "paused" });
  const closedBefore = mock.calls.filter(call => call[0] === "context.close").length;
  mock.authBlocked = true;
  error(await session.call("browser_open", { url: "https://example.com/login" }), "auth_required");
  assert.equal(mock.calls.filter(call => call[0] === "context.close").length, closedBefore + 1);
  assert.equal(mock.calls.some(call => call[0] === "video.saveAs"), false, "paused take remains retryable, not automatically published/restarted");
  ok(await session.call("browser_record_live", { action: "stop" }));
});

test("even a no-UI human handoff stops live recording before rejecting confirmation", async () => {
  const session = extension(codecs()); await session.call("browser_record_live", { action: "start", name: "handoff" });
  error(await session.call("browser_handoff", { message: "Complete authentication" }), "auth_required");
  error(await session.call("browser_record_live", { action: "stop" }), "no_recording");
  assert.ok(await stat(join(home, "Videos", "Recordings", "handoff.webm")));
  assert(mock.calls.some(call => call[0] === "video.saveAs")); assert(mock.calls.some(call => call[0] === "context.close"));
});

test("live finalization stays retryable after close failure and rejects context-changing tools", async () => {
  const session = extension(codecs()); await session.call("browser_record_live", { action: "start", name: "retry" });
  error(await session.call("browser_action", { action: "device", name: "Test Phone" }), "recording_active");
  error(await session.call("browser_clear_state", {}, yesUI), "recording_active");
  mock.failCloseOnce = true; error(await session.call("browser_record_live", { action: "stop" }), "operation_failed");
  const stopped = ok(await session.call("browser_record_live", { action: "stop" })); assert.deepEqual(await readFile(stopped.path), webm);
});

test("agent settlement publishes an unfinished live take and closes Chromium", async () => {
  const session = extension(codecs()); const started = ok(await session.call("browser_record_live", { action: "start", name: "settled" }));
  await session.handlers.get("agent_settled")({}, noUI);
  assert.deepEqual(await readFile(started.path), webm); assert(mock.calls.some(call => call[0] === "browser.close"));
});

test("active-branch workflow reconstruction preserves cancellation, not live refs or browser objects", async () => {
  const first = extension(); await first.call("browser_open", { url: "https://example.com" });
  error(await first.call("browser_handoff", { message: "Review" }, { hasUI: true, ui: { confirm: async () => false } }), "cancelled");
  const workflow = first.entries.filter(entry => entry.customType === "browser-workflow");
  assert.equal(workflow.at(-1).data.auth.state, "cancelled");
  assert.doesNotMatch(JSON.stringify(workflow), /aria-ref|snapshotFresh|browserContext/);
  const restored = extension();
  restored.handlers.get("session_start")({}, { ...noUI, cwd: home, sessionManager: { getBranch: () => workflow } });
  const blocked = error(await restored.call("browser_action", { action: "fill", selector: "#title", value: "no input" }), "cancelled");
  assert.equal(blocked.dispatch, "not-attempted");
  assert.equal(mock.calls.filter(call => call[0] === "fill").length, 0);
  ok(await restored.call("browser_action", { action: "snapshot" }));
  assert.equal(error(await restored.call("browser_handoff", { message: "Resume" }, yesUI), "auth_required").auth.state, "cancelled");
});

test("failed-capture uncertainty is reconstructed and cannot silently start another take", async () => {
  const session = extension();
  const retained = { workDirectory: join(home, "capture"), path: join(home, "take.webm"), captureStatus: "failed", businessOutcome: "unknown", needsVerification: true };
  session.handlers.get("session_start")({}, { ...noUI, cwd: home, sessionManager: { getBranch: () => [{ type: "custom", customType: "browser-recording", data: retained }] } });
  assert.deepEqual(ok(await session.call("browser_tools", { tools: ["browser_record"] })).retainedRecording, retained);
  error(await session.call("browser_record", { plan: await plan() }), "business_outcome_unknown");
  assert.equal(mock.calls.length, 0);
});

test("recovering an unrelated capture preserves unresolved write uncertainty across reload", async () => {
  const session = extension(codecs());
  const unresolved = { workDirectory: join(home, "uncertain"), captureStatus: "failed", businessOutcome: "unknown", needsVerification: true };
  await session.handlers.get("session_start")({}, { ...noUI, sessionManager: { getBranch: () => [{ type: "custom", customType: "browser-recording", data: unresolved }] } });
  const other = join(home, "unrelated"); await captured(other);
  ok(await session.call("browser_recover", { workDirectory: other, name: "unrelated" }));
  error(await session.call("browser_action", { action: "fill", selector: "#title", value: "never" }), "business_outcome_unknown");
  error(await session.call("browser_record", { plan: await plan(), name: "retry" }), "business_outcome_unknown");
  const recovered = session.entries.filter(entry => entry.customType === "browser-recording").at(-1)!.data;
  assert.equal(recovered.needsVerification, true);
  const restored = extension(); await restored.handlers.get("session_start")({}, { ...noUI, sessionManager: { getBranch: () => [{ type: "custom", customType: "browser-recording", data: recovered }] } });
  error(await restored.call("browser_open", { url: "https://example.com/retry" }), "business_outcome_unknown");
});

test("legacy unrelated recovery entries cannot clear a previous uncertainty latch", async () => {
  const session = extension();
  await session.handlers.get("session_start")({}, { ...noUI, sessionManager: { getBranch: () => [
    { type: "custom", customType: "browser-recording", data: { workDirectory: "failed", captureStatus: "failed", needsVerification: true } },
    { type: "custom", customType: "browser-recording", data: { workDirectory: "unrelated", captureStatus: "complete" } },
  ] } });
  error(await session.call("browser_action", { action: "press", key: "Enter" }), "business_outcome_unknown");
});

test("interrupted initial capture entries block replay even when no catch outcome was persisted", async () => {
  for (const needsVerification of [undefined, true]) {
    const session = extension();
    const retained = { plan: join(home, "plan.json"), workDirectory: join(home, "capture"), phase: "capture", captureStatus: "unknown", businessOutcome: "unknown", ...(needsVerification === undefined ? {} : { needsVerification }) };
    session.handlers.get("session_start")({}, { ...noUI, cwd: home, sessionManager: { getBranch: () => [{ type: "custom", customType: "browser-recording", data: retained }] } });
    error(await session.call("browser_record", { plan: await plan() }), "business_outcome_unknown");
    assert.equal(mock.calls.length, 0, "restoration must not launch a browser or dispatch capture");
  }
});

test("an unverified capture also blocks direct input and navigation, not just another recording", async () => {
  const session = extension();
  session.handlers.get("session_start")({}, { ...noUI, cwd: home, sessionManager: { getBranch: () => [{ type: "custom", customType: "browser-recording", data: { captureStatus: "failed", businessOutcome: "unknown", needsVerification: true } }] } });
  for (const [tool, input] of [["browser_action", { action: "fill", selector: "#title", value: "no replay" }], ["browser_action", { action: "goto", url: "https://example.com" }], ["browser_open", { url: "https://example.com" }]] as const) {
    assert.equal(error(await session.call(tool, input), "business_outcome_unknown").dispatch, "not-attempted");
  }
  assert.equal(mock.calls.length, 0);
  ok(await session.call("browser_action", { action: "snapshot" }));
});

test("human permission after an unknown capture explicitly warns about another possible submission", async () => {
  const session = extension();
  session.handlers.get("session_start")({}, { ...noUI, cwd: home, sessionManager: { getBranch: () => [{ type: "custom", customType: "browser-recording", data: { captureStatus: "failed", businessOutcome: "unknown", needsVerification: true } }] } });
  let prompt = "";
  ok(await session.call("browser_handoff", { message: "Review the application" }, { hasUI: true, ui: { confirm: async (_title: string, message: string) => { prompt = message; return true; } } }));
  assert.match(prompt, /may already have committed a write/); assert.match(prompt, /explicitly permits new input/);
  const retained = ok(await session.call("browser_tools", { tools: ["browser_record"] })).retainedRecording;
  assert.equal(retained.needsVerification, false); assert.equal(retained.businessOutcome, "unknown");
});

test("registered recording propagates abort signals to validation/capture subprocesses and blocks queued retry", async () => {
  const controller = new AbortController(); const commands: string[] = [];
  const session = extension(async (command, args, options) => {
    assert.equal(command, "cutaway"); assert.equal(options.signal, controller.signal); commands.push(args[0]);
    if (args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    controller.abort(); throw Object.assign(new Error("aborted"), { name: "AbortError" });
  });
  const path = await plan();
  const replies = await Promise.all([
    session.call("browser_record", { plan: path }, noUI, controller.signal),
    session.call("browser_record", { plan: path }),
  ]);
  assert.equal(error(replies[0], "cancelled").dispatch, "attempted");
  assert.equal(error(replies[0]).completion, "unknown");
  assert.equal(error(replies[1], "cancelled").dispatch, "not-attempted");
  assert.deepEqual(commands, ["validate", "record"]);
});
