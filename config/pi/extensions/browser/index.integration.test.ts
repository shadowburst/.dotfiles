import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
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
const { default: browserExtension } = await import(new URL("./index.ts", import.meta.url).href);

function extension(exec: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>) {
  const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
  const handlers = new Map<string, () => void>();
  let active = ["read", "browser_record"];
  browserExtension({
    exec: (_command: string, args: string[]) => exec(args),
    getActiveTools: () => active,
    on: (name: string, handler: () => void) => handlers.set(name, handler),
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
    setActiveTools: (next: string[]) => { active = next; },
  });
  return { tools, handlers, active: () => active };
}
const ok = (value: unknown) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });

test("registers a smaller deferred catalog", () => {
  const { tools, handlers, active } = extension(async () => ok({}));
  assert.deepEqual([...tools.keys()], ["browser_tools", "browser_open", "browser_action", "browser_screenshot", "browser_record", "browser_handoff"]);
  handlers.get("session_start")?.();
  assert.deepEqual(active(), ["read", "browser_tools"]);
});

test("refuses to control a browser outside Herdr", async () => {
  const { tools } = extension(async () => { throw new Error("CLI must not run"); });
  const old = process.env.HERDR_ENV;
  delete process.env.HERDR_ENV;
  try {
    await assert.rejects(tools.get("browser_open")!.execute("1", {}), /Herdr-managed Pi pane/);
  } finally {
    if (old !== undefined) process.env.HERDR_ENV = old;
  }
});

test("creates one right split and keeps actions pinned to Pi's tab", async () => {
  const calls: string[][] = [];
  let opened = false;
  const { tools } = extension(async (args) => {
    calls.push(args);
    if (args[0] === "ls") return ok({ browsers: opened ? [{ key: "owned", inCurrentTab: true, tabs: [{ id: 1 }] }] : [] });
    if (args[0] === "open") { opened = true; return ok({ key: "owned", tabs: [{ id: 1 }] }); }
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = process.env.HERDR_ENV;
  const pane = process.env.HERDR_PANE_ID;
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  try {
    await tools.get("browser_open")!.execute("1", { url: "https://example.com" });
    await tools.get("browser_action")!.execute("2", { args: ["click", "@e3"] });
    assert.deepEqual(calls, [
      ["ls", "--json"], ["open", "about:blank", "--split", "right"],
      ["ls", "--json"], ["action", "--browser", "owned", "--tab", "1", "--follow", "--", "goto", "https://example.com"],
      ["ls", "--json"], ["action", "--browser", "owned", "--tab", "1", "--follow", "--", "click", "@e3"],
    ]);
  } finally {
    if (old === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = old;
    if (pane === undefined) delete process.env.HERDR_PANE_ID; else process.env.HERDR_PANE_ID = pane;
  }
});

test("records the existing Electron tab without creating a browser context", async () => {
  let opened = false;
  let path = "";
  const calls: string[][] = [];
  const { tools } = extension(async (args) => {
    calls.push(args);
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 1 }, ...(opened ? [{ id: 2 }] : [])] }] });
    if (args[0] === "new-tab") { opened = true; return ok({ openedTab: 2 }); }
    if (args.includes("start")) return { code: 1, stdout: "", stderr: "CDP error (Target.createBrowserContext)" };
    if (args.includes("restart")) path = args.at(-1)!;
    if (args.includes("stop")) await writeFile(path, "webm");
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = process.env.HERDR_ENV;
  const pane = process.env.HERDR_PANE_ID;
  const cache = process.env.XDG_CACHE_HOME;
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.XDG_CACHE_HOME = directory;
  try {
    const start = await tools.get("browser_record")!.execute("1", { action: "start", name: "demo.webm" });
    assert.equal(start.details.path, join(directory, "pi", "browser-recordings", "demo.webm"));
    assert.deepEqual(calls.at(-1)!.slice(-3), ["record", "restart", start.details.path]);
    const stop = await tools.get("browser_record")!.execute("2", { action: "stop" });
    assert.equal(stop.details.bytes, 4);
  } finally {
    if (old === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = old;
    if (pane === undefined) delete process.env.HERDR_PANE_ID; else process.env.HERDR_PANE_ID = pane;
    if (cache === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = cache;
    await rm(directory, { recursive: true, force: true });
  }
});

test("reuses browser without touching its existing tab and returns inline screenshot", async () => {
  const calls: string[][] = [];
  const { tools } = extension(async (args) => {
    calls.push(args);
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 1 }, ...(calls.some((call) => call[0] === "new-tab") ? [{ id: 2 }] : [])] }] });
    if (args[0] === "new-tab") return ok({ openedTab: 2 });
    if (args.includes("screenshot")) await writeFile(args[args.indexOf("screenshot") + 1], Buffer.from("89504e470d0a1a0a", "hex"));
    return { code: 0, stdout: "done", stderr: "" };
  });
  const before = process.env.HERDR_ENV;
  const pane = process.env.HERDR_PANE_ID;
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  try {
    const shot = await tools.get("browser_screenshot")!.execute("1", { fullPage: true });
    assert.equal(shot.content[1].type, "image");
    assert.equal(shot.content[1].data, "iVBORw0KGgo=");
    assert.deepEqual(calls[1], ["new-tab", "about:blank", "--browser", "human"]);
    assert.deepEqual(calls.at(-1)!.slice(0, 8), ["action", "--browser", "human", "--tab", "2", "--follow", "--", "screenshot"]);
    assert.equal(calls.at(-1)!.at(-1), "--full");
    await unlink(shot.details.path);
  } finally {
    if (before === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = before;
    if (pane === undefined) delete process.env.HERDR_PANE_ID; else process.env.HERDR_PANE_ID = pane;
  }
});
