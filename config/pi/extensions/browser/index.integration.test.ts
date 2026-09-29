import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const rootUrl = new URL("./", import.meta.url).href;
const packageSources = {
  "@earendil-works/pi-coding-agent": `
    export const DEFAULT_MAX_BYTES = 50000;
    export const DEFAULT_MAX_LINES = 2000;
    export const formatSize = String;
    export const truncateHead = (content) => ({ content, truncated: false });
  `,
  "@earendil-works/pi-ai": `export const StringEnum = (values) => ({ values });`,
  typebox: `
    const schema = (kind, value, options) => ({ kind, value, options });
    export const Type = {
      Array: (value, options) => schema("array", value, options),
      Boolean: (options) => schema("boolean", undefined, options),
      Object: (value) => schema("object", value),
      Optional: (value) => schema("optional", value),
      String: (options) => schema("string", undefined, options),
    };
  `,
  playwright: `
    import { mkdir, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    const mock = () => globalThis.__playwrightMock;
    class Locator {
      constructor(page, selector) { this.page = page; this.selector = selector; }
      async click() { mock().calls.push(["click", this.selector]); }
      async fill(value) { mock().calls.push(["fill", this.selector, value]); }
      async pressSequentially(value) { mock().calls.push(["type", this.selector, value]); }
      async press(value) { mock().calls.push(["press", this.selector, value]); }
      async waitFor(options) { mock().calls.push(["waitFor", this.selector, options?.state]); }
      async evaluateAll() { return mock().snapshot; }
    }
    class Page {
      constructor(context) {
        this.context = context;
        this.currentUrl = "about:blank";
        this.keyboard = { press: async value => mock().calls.push(["keyboard", value]) };
      }
      on() {}
      async goto(url) { this.currentUrl = url; mock().calls.push(["goto", url]); return { status: () => 200 }; }
      url() { return this.currentUrl; }
      locator(selector) { return new Locator(this, selector); }
      async evaluate(code) { mock().calls.push(["eval", String(code)]); return "evaluated"; }
      async waitForTimeout(ms) { mock().calls.push(["wait", String(ms)]); }
      async screenshot() { mock().calls.push(["screenshot"]); return Buffer.from("png"); }
      video() { return this.context.videoPath ? { path: async () => this.context.videoPath } : null; }
    }
    class Context {
      constructor(options) {
        this.options = options;
        this.pagesList = [];
        this.videoPath = options.recordVideo ? join(options.recordVideo.dir, "raw.webm") : undefined;
      }
      async newPage() { const page = new Page(this); this.pagesList.push(page); return page; }
      pages() { return this.pagesList; }
      async close() {
        mock().calls.push(["context.close"]);
        if (mock().failCloseOnce) { mock().failCloseOnce = false; throw new Error("close failed"); }
        if (this.videoPath) { await mkdir(this.options.recordVideo.dir, { recursive: true }); await writeFile(this.videoPath, "live-webm"); }
      }
    }
    class Browser {
      async newContext(options = {}) { mock().calls.push(["newContext", JSON.stringify(options)]); return new Context(options); }
      async close() { mock().calls.push(["browser.close"]); }
    }
    export const chromium = { launch: async options => { mock().calls.push(["launch", JSON.stringify(options)]); return new Browser(); } };
    export const devices = { "Test Phone": { defaultBrowserType: "chromium", viewport: { width: 390, height: 844 }, userAgent: "phone", isMobile: true, hasTouch: true } };
  `,
};
const loaderSource = `
  const rootUrl = ${JSON.stringify(rootUrl)};
  const packageSources = ${JSON.stringify(packageSources)};
  export function resolve(specifier, context, nextResolve) {
    const source = packageSources[specifier];
    if (source !== undefined) return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    return nextResolve(specifier, context);
  }
  export async function load(url, context, nextLoad) {
    if (url.startsWith(rootUrl) && url.endsWith(".ts")) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const { stripTypeScriptTypes } = await import("node:module");
      return { format: "module", shortCircuit: true, source: stripTypeScriptTypes(await readFile(fileURLToPath(url), "utf8"), { mode: "transform" }) };
    }
    return nextLoad(url, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

type Mock = { calls: string[][]; snapshot: Array<Record<string, string>>; failCloseOnce?: boolean };
(globalThis as typeof globalThis & { __playwrightMock: Mock }).__playwrightMock = {
  calls: [],
  snapshot: [
    { selector: "#save", role: "button", name: "Save" },
    { selector: "input[name=title]", role: "textbox", name: "Title" },
  ],
};
const mock = (globalThis as typeof globalThis & { __playwrightMock: Mock }).__playwrightMock;
const { default: browserExtension } = await import(new URL("./index.ts", import.meta.url).href);

type ExecResult = { code: number; stdout: string; stderr: string };
function extension(exec: (command: string, args: string[]) => Promise<ExecResult>) {
  const tools = new Map<string, { execute: (...args: any[]) => Promise<any>; promptGuidelines?: string[]; parameters?: any }>();
  const handlers = new Map<string, (...args: any[]) => unknown>();
  let active = ["read", "browser_record"];
  browserExtension({
    exec,
    getActiveTools: () => active,
    on: (name: string, handler: (...args: any[]) => unknown) => handlers.set(name, handler),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    setActiveTools: (next: string[]) => { active = next; },
  } as any);
  return { tools, handlers, active: () => active };
}

async function withHome(run: (home: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const previous = process.env.HOME;
  process.env.HOME = directory;
  try { await run(directory); }
  finally {
    if (previous === undefined) delete process.env.HOME; else process.env.HOME = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

test.beforeEach(() => { mock.calls.length = 0; });

test("registers the compact catalog and recommends native Cutaway plans", () => {
  const { tools, handlers, active } = extension(async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.deepEqual([...tools.keys()], ["browser_tools", "browser_open", "browser_action", "browser_screenshot", "browser_record", "browser_record_live", "browser_handoff"]);
  assert.match(tools.get("browser_tools")!.promptGuidelines![0], /explore.*Cutaway JSON plan.*cutaway validate.*submit only once/i);
  handlers.get("session_start")?.();
  assert.deepEqual(active(), ["read", "browser_tools"]);
});

test("scripted recording is plan-only; live recording uses an explicit tool", async () => withHome(async () => {
  const { tools } = extension(async () => { throw new Error("a live take must not invoke Cutaway"); });
  assert.equal(tools.get("browser_record")!.parameters?.value?.action, undefined);
  const started = await tools.get("browser_record_live")!.execute("1", { action: "start", name: "opt-in" });
  assert.match(started.content[0].text, /Recording started/);
  const stopped = await tools.get("browser_record_live")!.execute("2", { action: "stop" });
  assert.equal(await readFile(stopped.details.path, "utf8"), "live-webm");
}));

test("drives one headed Playwright page with snapshots, refs, locators, and screenshots", async () => {
  const { tools } = extension(async () => { throw new Error("external process must not run"); });
  await tools.get("browser_open")!.execute("1", { url: "https://example.com" });
  const snapshot = await tools.get("browser_action")!.execute("2", { args: ["snapshot"] });
  assert.match(snapshot.content[0].text, /@e1.*button.*Save/);
  assert.match(snapshot.content[0].text, /@e2.*textbox.*Title/);
  await tools.get("browser_action")!.execute("3", { args: ["click", "@e1"] });
  await tools.get("browser_action")!.execute("4", { args: ["fill", "role=textbox[name=Title]", "Demo"] });
  await tools.get("browser_action")!.execute("4b", { args: ["type", "input[name=title]", " plus"] });
  const shot = await tools.get("browser_screenshot")!.execute("5", { fullPage: true });
  assert.equal(shot.content[1].data, Buffer.from("png").toString("base64"));
  await tools.get("browser_action")!.execute("6", { args: ["set", "device", "Test Phone"] });
  assert(mock.calls.some(call => call[0] === "newContext" && call[1].includes('"width":390')));
  assert(mock.calls.some(call => call[0] === "launch" && call[1].includes('"headless":false') && call[1].includes('"--class=pi-browser-tools"')));
  assert.deepEqual(mock.calls.filter(call => ["goto", "click", "fill", "type"].includes(call[0])), [
    ["goto", "https://example.com/"], ["click", "#save"], ["fill", "role=textbox[name=Title]", "Demo"], ["type", "input[name=title]", " plus"],
  ]);
});

test("rejects invalid Cutaway plans before opening a browser", async () => withHome(async home => {
  const plan = join(home, "journey.json");
  await writeFile(plan, JSON.stringify({ url: "https://example.com", steps: [{ action: "fill", selector: "#save" }] }));
  const commands: string[] = [];
  const { tools } = extension(async (command, args) => {
    commands.push(`${command} ${args[0]}`);
    return { code: 1, stdout: "", stderr: "Step 1: unsupported action." };
  });
  await assert.rejects(tools.get("browser_record")!.execute("1", { plan }), /Step 1: unsupported action/);
  assert.deepEqual(commands, ["cutaway validate"]);
  await assert.rejects(stat(join(home, "Videos", "Recordings")), /ENOENT/);
}));

test("runs a native Cutaway plan at standard 720p and leaves one WebM", async () => withHome(async home => {
  const plan = join(home, "journey.json");
  const storageState = join(home, "auth.json");
  await writeFile(plan, JSON.stringify({ url: "https://example.com", steps: [{ action: "click", selector: "#save" }] }));
  await writeFile(storageState, "{}");
  const calls: Array<[string, string[]]> = [];
  const { tools } = extension(async (command, args) => {
    calls.push([command, args]);
    if (command === "cutaway" && args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    if (command === "cutaway") {
      const outputDirectory = args[args.indexOf("--out") + 1];
      await mkdir(outputDirectory, { recursive: true });
      const output = join(outputDirectory, "video.mp4");
      await writeFile(output, "mp4");
      await writeFile(join(outputDirectory, "render.json"), JSON.stringify({ motion: { zoomEpisodes: 2 } }));
      await writeFile(join(outputDirectory, "timeline.json"), JSON.stringify({ status: "complete", steps: [{ action: "click" }], points: [{ t: 0 }, { t: 1 }] }));
      return { code: 0, stdout: JSON.stringify({ output }), stderr: "" };
    }
    if (command === "ffmpeg") {
      await writeFile(args.at(-1)!, "journey-webm");
      return { code: 0, stdout: "", stderr: "" };
    }
    throw new Error(`unexpected command: ${command}`);
  });
  const result = await tools.get("browser_record")!.execute("1", { plan, name: "checkout", storageState });
  const path = join(home, "Videos", "Recordings", "checkout.webm");
  assert.equal(result.details.path, path);
  assert.equal(await readFile(path, "utf8"), "journey-webm");
  assert.match(result.content[0].text, /cursor points: 2.*zoom episodes: 2/i);
  assert.deepEqual(result.details.motion, { cursorPoints: 2, zoomEpisodes: 2 });
  assert.deepEqual(calls[0], ["cutaway", ["validate", plan]]);
  assert.deepEqual(calls[1], ["cutaway", ["record", plan, "--out", calls[1][1][3], "--storage-state", storageState, "--width", "1280", "--height", "720", "--quality", "standard"]]);
  await assert.rejects(stat(calls[1][1][3]), /ENOENT/, "successful Cutaway intermediates are deleted");
}));

test("does not claim a cinematic take when interactive steps have no cursor or zoom", async () => withHome(async home => {
  const plan = join(home, "journey.json");
  await writeFile(plan, JSON.stringify({ url: "https://example.com", steps: [{ action: "click", selector: "#save" }] }));
  const { tools } = extension(async (command, args) => {
    if (command === "cutaway" && args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    if (command === "cutaway") {
      const dir = args[args.indexOf("--out") + 1];
      await mkdir(dir, { recursive: true });
      const output = join(dir, "video.mp4");
      await writeFile(output, "mp4");
      await writeFile(join(dir, "render.json"), JSON.stringify({ motion: { zoomEpisodes: 0 } }));
      await writeFile(join(dir, "timeline.json"), JSON.stringify({ status: "complete", steps: [{ action: "click" }], points: [{ t: 0 }] }));
      return { code: 0, stdout: JSON.stringify({ output }), stderr: "" };
    }
    await writeFile(args.at(-1)!, "webm");
    return { code: 0, stdout: "", stderr: "" };
  });
  await assert.rejects(tools.get("browser_record")!.execute("1", { plan }), /cinematic motion.*work directory/i);
}));

test("does not report an empty render as a finished video", async () => withHome(async home => {
  const plan = join(home, "journey.json");
  await writeFile(plan, JSON.stringify({ url: "https://example.com", steps: [{ action: "click", selector: "#save" }] }));
  const { tools } = extension(async (command, args) => {
    if (command === "cutaway" && args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    if (command === "cutaway") {
      const output = join(args[args.indexOf("--out") + 1], "video.mp4");
      await mkdir(args[args.indexOf("--out") + 1], { recursive: true });
      await writeFile(output, "mp4");
      await writeFile(join(args[args.indexOf("--out") + 1], "render.json"), JSON.stringify({ motion: { zoomEpisodes: 1 } }));
      await writeFile(join(args[args.indexOf("--out") + 1], "timeline.json"), JSON.stringify({ status: "complete", steps: [{ action: "wait" }], points: [{ t: 0 }] }));
      return { code: 0, stdout: JSON.stringify({ output }), stderr: "" };
    }
    assert.equal(command, "ffmpeg");
    await writeFile(args.at(-1)!, "");
    return { code: 0, stdout: "", stderr: "" };
  });
  await assert.rejects(tools.get("browser_record")!.execute("1", { plan }), /empty recording.*work directory/i);
}));

test("removes an incomplete WebM when conversion fails so its name is retryable", async () => withHome(async home => {
  const plan = join(home, "journey.json");
  await writeFile(plan, JSON.stringify({ url: "https://example.com", steps: [{ action: "click", selector: "#save" }] }));
  const { tools } = extension(async (command, args) => {
    if (command === "cutaway" && args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    if (command === "cutaway") {
      const output = join(args[args.indexOf("--out") + 1], "video.mp4");
      await mkdir(args[args.indexOf("--out") + 1], { recursive: true });
      await writeFile(output, "mp4");
      return { code: 0, stdout: JSON.stringify({ output }), stderr: "" };
    }
    await writeFile(args.at(-1)!, "partial");
    return { code: 1, stdout: "", stderr: "conversion failed" };
  });
  await assert.rejects(tools.get("browser_record")!.execute("1", { plan, name: "retry" }), /conversion failed.*work directory/i);
  await assert.rejects(stat(join(home, "Videos", "Recordings", "retry.webm")), /ENOENT/);
}));

test("preserves the Cutaway work directory when a journey fails", async () => withHome(async home => {
  const plan = join(home, "journey.json");
  await writeFile(plan, JSON.stringify({ url: "https://example.com", steps: [{ action: "click", selector: "#missing" }] }));
  let outputDirectory = "";
  const { tools } = extension(async (command, args) => {
    assert.equal(command, "cutaway");
    if (args[0] === "validate") return { code: 0, stdout: "", stderr: "" };
    outputDirectory = args[args.indexOf("--out") + 1];
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(outputDirectory, "manifest.json"), "partial");
    return { code: 1, stdout: "", stderr: "Step 1: selector missing" };
  });
  await assert.rejects(tools.get("browser_record")!.execute("1", { plan }), (error: Error) => {
    assert.match(error.message, /selector missing/);
    assert.match(error.message, new RegExp(outputDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    return true;
  });
  assert.equal(await readFile(join(outputDirectory, "manifest.json"), "utf8"), "partial");
}));

test("starts live recording in a fresh context and saves Playwright WebM", async () => withHome(async home => {
  const { tools } = extension(async () => { throw new Error("external process must not run"); });
  await tools.get("browser_open")!.execute("1", { url: "https://example.com" });
  const started = await tools.get("browser_record_live")!.execute("2", { action: "start", name: "live" });
  assert.match(started.content[0].text, /Recording started/);
  await tools.get("browser_open")!.execute("3", { url: "https://example.com/demo" });
  const stopped = await tools.get("browser_record_live")!.execute("4", { action: "stop" });
  const path = join(home, "Videos", "Recordings", "live.webm");
  assert.equal(stopped.details.path, path);
  assert.equal(await readFile(path, "utf8"), "live-webm");
  assert.equal(mock.calls.filter(call => call[0] === "newContext").length, 2);
  assert(mock.calls.some(call => call[0] === "newContext" && call[1].includes("recordVideo")));
}));

test("keeps a live recording retryable and rejects device changes while recording", async () => withHome(async () => {
  const { tools } = extension(async () => { throw new Error("external process must not run"); });
  await tools.get("browser_record_live")!.execute("1", { action: "start", name: "retry" });
  await assert.rejects(tools.get("browser_action")!.execute("2", { args: ["set", "device", "Test Phone"] }), /active recording/i);
  mock.failCloseOnce = true;
  await assert.rejects(tools.get("browser_record_live")!.execute("3", { action: "stop" }), /close failed/);
  const stopped = await tools.get("browser_record_live")!.execute("4", { action: "stop" });
  assert.equal(await readFile(stopped.details.path, "utf8"), "live-webm");
}));

test("auto-saves an unfinished live recording when the agent settles", async () => withHome(async home => {
  const { tools, handlers } = extension(async () => { throw new Error("external process must not run"); });
  const started = await tools.get("browser_record_live")!.execute("1", { action: "start", name: "settled" });
  await handlers.get("agent_settled")?.();
  assert.equal(await readFile(started.details.path, "utf8"), "live-webm");
  assert(mock.calls.some(call => call[0] === "browser.close"));
}));

test("hands the visible Playwright page to the user", async () => {
  let prompt = "";
  const { tools } = extension(async () => { throw new Error("external process must not run"); });
  const result = await tools.get("browser_handoff")!.execute("1", { message: "Log in" }, undefined, undefined, {
    hasUI: true,
    ui: { confirm: async (_title: string, message: string) => { prompt = message; return true; } },
  });
  assert.match(prompt, /Log in/);
  assert.equal(result.details.confirmed, true);
});
