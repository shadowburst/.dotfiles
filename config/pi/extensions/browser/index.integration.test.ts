import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
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
      Number: (options) => schema("number", undefined, options),
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

function extension(exec: (args: string[], command: string) => Promise<{ code: number; stdout: string; stderr: string }>) {
  const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
  const handlers = new Map<string, () => void>();
  let active = ["read", "browser_record"];
  browserExtension({
    exec: (command: string, args: string[]) => exec(args, command),
    getActiveTools: () => active,
    on: (name: string, handler: () => void) => handlers.set(name, handler),
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
    setActiveTools: (next: string[]) => { active = next; },
  });
  return { tools, handlers, active: () => active };
}
const ok = (value: unknown) => ({ code: 0, stdout: JSON.stringify(value), stderr: "" });

test("registers a smaller deferred catalog and recommends scripted recording", () => {
  const { tools, handlers, active } = extension(async () => ok({}));
  assert.deepEqual([...tools.keys()], ["browser_tools", "browser_open", "browser_action", "browser_screenshot", "browser_record", "browser_handoff"]);
  const guidance = String((tools.get("browser_tools") as any).promptGuidelines?.[0]);
  assert.match(guidance, /explore.*JSON.*script.*browser_record.*inspect/i);
  assert.match(guidance, /inspect actual href/i);
  assert.match(guidance, /prefer goto/i);
  assert.match(guidance, /expect-url/);
  assert.match(guidance, /omit name on retries/i);
  assert.doesNotMatch(guidance, /action start.*action stop/i);
  handlers.get("session_start")?.();
  assert.deepEqual(active(), ["read", "browser_tools"]);
});

test("preserves an existing take and suggests a unique retry name", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const recordings = join(directory, "Videos", "Recordings");
  await mkdir(recordings, { recursive: true });
  await writeFile(join(recordings, "demo.mp4"), "original");
  const previous = process.env.HOME;
  process.env.HOME = directory;
  const { tools } = extension(async () => { throw new Error("CLI must not run"); });
  try {
    await assert.rejects(tools.get("browser_record")!.execute("1", { action: "start", name: "demo" }), /Recording already exists: .*demo\.mp4.*omit name.*unique/i);
    assert.equal(await readFile(join(recordings, "demo.mp4"), "utf8"), "original");
  } finally {
    if (previous === undefined) delete process.env.HOME; else process.env.HOME = previous;
    await rm(directory, { recursive: true, force: true });
  }
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
    await tools.get("browser_open")!.execute("3", { url: "/tmp/pi-browser-demo.html" });
    assert.deepEqual(calls, [
      ["ls", "--json"], ["open", "about:blank", "--split", "right"],
      ["ls", "--json"], ["action", "--browser", "owned", "--tab", "1", "--follow", "--", "goto", "https://example.com"],
      ["ls", "--json"], ["action", "--browser", "owned", "--tab", "1", "--follow", "--", "click", "@e3"],
      ["ls", "--json"], ["ls", "--json"], ["action", "--browser", "owned", "--tab", "1", "--follow", "--", "goto", "file:///tmp/pi-browser-demo.html"],
    ]);
  } finally {
    if (old === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = old;
    if (pane === undefined) delete process.env.HERDR_PANE_ID; else process.env.HERDR_PANE_ID = pane;
  }
});

test("failed live browser action reports the current URL", async () => {
  let opened = false;
  const { tools } = extension(async (args) => {
    if (args[0] === "ls") return ok({ browsers: [{ key: "owned", inCurrentTab: true, tabs: [{ id: 1 }, ...(opened ? [{ id: 2 }] : [])] }] });
    if (args[0] === "new-tab") { opened = true; return ok({ openedTab: 2 }); }
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "click") return { code: 1, stdout: "", stderr: "selector missing" };
    if (argv[0] === "get" && argv[1] === "url") return { code: 0, stdout: "https://example.com/issues", stderr: "" };
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  try {
    await assert.rejects(tools.get("browser_action")!.execute("1", { args: ["click", "#missing"] }), /selector missing.*current URL: https:\/\/example\.com\/issues/);
  } finally {
    if (old[0] === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = old[0];
    if (old[1] === undefined) delete process.env.HERDR_PANE_ID; else process.env.HERDR_PANE_ID = old[1];
  }
});

test("replays a script into a fresh Electron tab and restores its viewport", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["goto", "https://example.com"], ["wait", "2000"], ["wait", "#ready"], ["click", "#save"], ["wait", "#saved"]]));
  const calls: string[][] = [];
  let path = "";
  let latestTab = 1;
  const { tools } = extension(async (args, command) => {
    if (command === "ffprobe") return { code: 0, stdout: args.includes("format=duration") ? "2.5\n" : "1280x720\n", stderr: "" };
    if (command === "ffmpeg") { await writeFile(args.at(-1)!, Buffer.from("89504e470d0a1a0a", "hex")); return { code: 0, stdout: "", stderr: "" }; }
    calls.push(args);
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: Array.from({ length: latestTab }, (_, i) => ({ id: i + 1 })) }] });
    if (args[0] === "new-tab") return ok({ openedTab: ++latestTab });
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "eval") return { code: 0, stdout: "900x600", stderr: "" };
    if (argv[0] === "record" && argv[1] === "restart") {
      assert.equal(argv.length, 3, "record restart accepts only an output path");
      path = argv[2];
    }
    if (argv[0] === "record" && argv[1] === "stop") await writeFile(path, "mp4");
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    const result = await tools.get("browser_record")!.execute("1", { script, name: "demo" });
    assert.equal(result.details.path, join(directory, "Videos", "Recordings", "demo.mp4"));
    assert.equal(result.details.bytes, 3);
    assert.equal(result.details.script, join(directory, "Videos", "Recordings", "demo.json"));
    assert.equal(await readFile(result.details.script, "utf8"), await readFile(script, "utf8"));
    assert.match(result.content[0].text, /demo\.json.*1280x720/);
    assert.equal(result.content[1].type, "image", "show sampled frames from the whole video without another tool call");
    assert.equal(result.content[2].type, "image", "show the exact final frame too");
    assert.deepEqual(calls.map((args) => args[0] === "action" ? args.slice(args.indexOf("--") + 1) : args), [
      ["ls", "--json"], ["new-tab", "about:blank", "--browser", "human"],
      ["eval", "[innerWidth, innerHeight].join('x')"],
      ["set", "viewport", "1280", "720"],
      ["goto", "https://example.com"],
      ["record", "restart", result.details.path],
      ["wait", "2000"], ["wait", "#ready"], ["click", "#save"], ["wait", "#saved"],
      ["wait", "1500"], ["record", "stop"], ["set", "viewport", "900", "600"],
    ]);
    assert(calls.filter((args) => args[0] === "action").every((args) => args[4] === "2"));
    await tools.get("browser_record")!.execute("2", { script, name: "second.mp4" });
    assert.equal(latestTab, 3);
    assert(calls.filter((args) => args[0] === "action").slice(-8).every((args) => args[4] === "3"));
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("returns every two-second video segment across multiple contact sheets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["goto", "https://example.com"], ["wait", "#home"], ["wait", "2000"]]));
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  let path = "";
  const { tools } = extension(async (args, command) => {
    if (command === "ffprobe") return { code: 0, stdout: args.includes("format=duration") ? "20\n" : "1280x720\n", stderr: "" };
    if (command === "ffmpeg") {
      const output = args.at(-1)!;
      if (args.some((arg) => arg.includes("tile="))) {
        await writeFile(output.replace("%03d", "001"), png);
        await writeFile(output.replace("%03d", "002"), png);
      } else await writeFile(output, png);
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "eval") return { code: 0, stdout: "900x600", stderr: "" };
    if (argv[0] === "record" && argv[1] === "restart") path = argv[2];
    if (argv[0] === "record" && argv[1] === "stop") await writeFile(path, "mp4");
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    const result = await tools.get("browser_record")!.execute("1", { script, tab: 7 });
    assert.deepEqual(result.content.map((entry: { type: string }) => entry.type), ["text", "image", "image", "image"], "two contact sheets and the final frame");
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("joins separate scripted clips across navigations without recording the loading gap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["goto", "https://example.com"], ["wait", "#home"], ["wait", "2000"], ["goto", "https://example.com/issues"], ["wait", "#issues"], ["wait", "2000"]]));
  const calls: string[][] = [];
  const clips: string[] = [];
  const { tools } = extension(async (args, command) => {
    if (command === "ffprobe") return { code: 0, stdout: args.includes("format=duration") ? "4.8\n" : "1280x720\n", stderr: "" };
    if (command === "ffmpeg") {
      if (args.includes("concat")) await writeFile(args.at(-1)!, (await Promise.all(clips.map((clip) => readFile(clip, "utf8")))).join(""));
      else await writeFile(args.at(-1)!, Buffer.from("89504e470d0a1a0a", "hex"));
      return { code: 0, stdout: "", stderr: "" };
    }
    calls.push(args);
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "eval") return { code: 0, stdout: "900x600", stderr: "" };
    if (argv[0] === "record" && argv[1] === "restart") clips.push(argv[2]);
    if (argv[0] === "record" && argv[1] === "stop") await writeFile(clips.at(-1)!, String(clips.length));
    if (argv[0] === "get" && argv[1] === "url") return { code: 0, stdout: "https://example.com/issues", stderr: "" };
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    const result = await tools.get("browser_record")!.execute("1", { script, tab: 7, expectUrl: "https://example.com/issues" });
    assert.equal(clips.length, 2);
    assert.equal(clips[0], result.details.path);
    assert.equal(await readFile(result.details.path, "utf8"), "12");
    assert.deepEqual(calls.filter((args) => args[0] === "action").map((args) => args.slice(args.indexOf("--") + 1)), [
      ["eval", "[innerWidth, innerHeight].join('x')"], ["set", "viewport", "1280", "720"],
      ["goto", "https://example.com"], ["record", "restart", clips[0]], ["wait", "#home"], ["wait", "2000"], ["record", "stop"],
      ["goto", "https://example.com/issues"], ["record", "restart", clips[1]], ["wait", "#issues"], ["wait", "2000"],
      ["wait", "1500"], ["get", "url"], ["record", "stop"], ["set", "viewport", "900", "600"],
    ]);
    await assert.rejects(readFile(clips[1]), /ENOENT/, "temporary clip must be cleaned up after joining");
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("records exploratory actions in Pi's existing tab without replaying them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const commands: string[][] = [];
  let path = "";
  const { tools } = extension(async (args, command) => {
    if (command === "ffprobe") return { code: 0, stdout: args.includes("format=duration") ? "2.5\n" : "1280x720\n", stderr: "" };
    if (command === "ffmpeg") { await writeFile(args.at(-1)!, Buffer.from("89504e470d0a1a0a", "hex")); return { code: 0, stdout: "", stderr: "" }; }
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }, { id: 8 }] }] });
    if (args[0] === "new-tab") return ok({ openedTab: 8 });
    assert.equal(args[0], "action", "recording must not create another tab");
    assert.equal(args[4], "8");
    const argv = args.slice(args.indexOf("--") + 1);
    commands.push(argv);
    if (argv[0] === "eval") return { code: 0, stdout: "900x600", stderr: "" };
    if (argv[0] === "get" && argv[1] === "url") return { code: 0, stdout: "https://example.com/issues", stderr: "" };
    if (argv[0] === "record" && argv[1] === "restart") path = argv[2];
    if (argv[0] === "record" && argv[1] === "stop") await writeFile(path, "mp4");
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    await tools.get("browser_open")!.execute("0", {});
    const started = await tools.get("browser_record")!.execute("1", { action: "start", name: "journey" });
    assert.match(started.content[0].text, /Recording started/);
    await tools.get("browser_open")!.execute("2", { url: "https://example.com/issues" });
    await tools.get("browser_action")!.execute("3", { args: ["click", "#milestones"] });
    const stopped = await tools.get("browser_record")!.execute("4", { action: "stop" });
    assert.equal(stopped.details.path, join(directory, "Videos", "Recordings", "journey.mp4"));
    assert.deepEqual(commands, [
      ["record", "restart", stopped.details.path], ["goto", "https://example.com/issues"],
      ["click", "#milestones"], ["wait", "1500"], ["record", "stop"],
    ]);
    await tools.get("browser_record")!.execute("5", { action: "start", name: "wrong" });
    await assert.rejects(tools.get("browser_record")!.execute("6", {
      action: "stop", expectUrl: "https://example.com/milestone/1",
    }), /expected URL: https:\/\/example\.com\/milestone\/1.*actual: https:\/\/example\.com\/issues.*partial take: .*wrong\.mp4/);
    assert.equal(await readFile(path, "utf8"), "mp4");
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("stops at a wrong intermediate URL before a later goto can mask it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  const wrong = "https://example.com/issues/milestones";
  const final = "https://example.com/milestone/1";
  await writeFile(script, JSON.stringify([["goto", wrong], ["expect-url", "https://example.com/milestones"], ["goto", final], ["wait", "#final"]]));
  let current = "";
  let path = "";
  const { tools } = extension(async (args, command) => {
    if (command === "ffprobe") return { code: 0, stdout: "2.5\n", stderr: "" };
    if (command === "ffmpeg") { await writeFile(args.at(-1)!, Buffer.from("89504e470d0a1a0a", "hex")); return { code: 0, stdout: "", stderr: "" }; }
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "goto") current = argv[1];
    if (argv[0] === "get" && argv[1] === "url") return { code: 0, stdout: current, stderr: "" };
    if (argv[0] === "record" && argv[1] === "restart") path = argv[2];
    if (argv[0] === "record" && argv[1] === "stop") await writeFile(path, "partial");
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    await assert.rejects(tools.get("browser_record")!.execute("1", { script, tab: 7, expectUrl: final }), /step 2\/4 failed.*expected URL: https:\/\/example\.com\/milestones.*actual: https:\/\/example\.com\/issues\/milestones.*partial take: .*mp4/);
    assert.equal(current, wrong, "must not visit the final URL after a failed checkpoint");
    assert.equal(await readFile(path, "utf8"), "partial");
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not claim success when the scripted destination is wrong", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["goto", "https://example.com/issues"], ["wait", "#issues-heading"]]));
  let path = "";
  const { tools } = extension(async (args) => {
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "record" && argv[1] === "restart") path = argv[2];
    if (argv[0] === "record" && argv[1] === "stop") await writeFile(path, "partial");
    if (argv[0] === "get" && argv[1] === "url") return { code: 0, stdout: "https://example.com/issues", stderr: "" };
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    await assert.rejects(tools.get("browser_record")!.execute("1", {
      script, tab: 7, expectUrl: "https://example.com/milestone/1",
    }), /expected URL: https:\/\/example\.com\/milestone\/1.*actual: https:\/\/example\.com\/issues.*partial take: .*mp4/);
    assert.equal(await readFile(path, "utf8"), "partial");
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a saved take too short to show the requested journey", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["goto", "https://example.com"], ["wait", "#home"], ["goto", "https://example.com/final"], ["wait", "#final"]]));
  let path = "";
  let active = "";
  const { tools } = extension(async (args, command) => {
    if (command === "ffprobe") return { code: 0, stdout: "0.8\n", stderr: "" };
    if (command === "ffmpeg") { await writeFile(args.at(-1)!, "joined"); return { code: 0, stdout: "", stderr: "" }; }
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "record" && argv[1] === "restart") { active = argv[2]; path ||= active; }
    if (argv[0] === "record" && argv[1] === "stop") await writeFile(active, "mp4");
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    await assert.rejects(tools.get("browser_record")!.execute("1", { script, tab: 7 }), (error: Error) => {
      assert.match(error.message, /0\.8s.*too short.*take.*mp4/i);
      return true;
    });
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a video that omits scripted two-second holds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["goto", "https://example.com"], ["wait", "#home"], ["wait", "2000"], ["goto", "https://example.com/final"], ["wait", "#final"], ["wait", "2000"]]));
  let path = "";
  let active = "";
  const { tools } = extension(async (args, command) => {
    if (command === "ffprobe") return { code: 0, stdout: "2.7\n", stderr: "" };
    if (command === "ffmpeg") { await writeFile(args.at(-1)!, "joined"); return { code: 0, stdout: "", stderr: "" }; }
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "record" && argv[1] === "restart") { active = argv[2]; path ||= active; }
    if (argv[0] === "record" && argv[1] === "stop") await writeFile(active, "truncated");
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    await assert.rejects(tools.get("browser_record")!.execute("1", { script, tab: 7 }), /only 2\.7s.*scripted holds need at least 4s.*partial take: .*mp4/);
    assert.equal(await readFile(path, "utf8"), "joined");
    assert.equal(await readFile(path.replace(/\.mp4$/, ".json"), "utf8"), await readFile(script, "utf8"));
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not claim a partial take when recording never starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, "[]");
  const { tools } = extension(async (args) => {
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    const argv = args.slice(args.indexOf("--") + 1);
    if (argv[0] === "record" && argv[1] === "restart") return { code: 1, stdout: "", stderr: "cannot record" };
    if (argv[0] === "record" && argv[1] === "stop") return { code: 1, stdout: "", stderr: "No recording in progress" };
    return { code: 0, stdout: "", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    await assert.rejects(tools.get("browser_record")!.execute("1", { script, tab: 7, name: "broken.mp4" }), (error: Error) => {
      assert.match(error.message, /cannot record/);
      assert.doesNotMatch(error.message, /partial take/);
      return true;
    });
    await assert.rejects(readFile(join(directory, "Videos", "Recordings", "broken.json")), /ENOENT/, "an unstarted recording must leave no stale sidecar");
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires a page checkpoint between scripted navigations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["goto", "https://example.com/issues"], ["wait", "2000"], ["goto", "https://example.com/issues/milestones"], ["wait", "2000"], ["goto", "https://example.com/milestone/1"], ["wait", "2000"]]));
  let called = false;
  const { tools } = extension(async () => { called = true; return ok({}); });
  try {
    await assert.rejects(tools.get("browser_record")!.execute("1", { script }), /Script step 1.*page-specific wait or expect-url/);
    await writeFile(script, JSON.stringify([["goto", "https://example.com/issues"], ["fill", "#search", "query"], ["wait", "#results"]]));
    await assert.rejects(tools.get("browser_record")!.execute("2", { script }), /Script step 1.*page-specific wait or expect-url/);
    await writeFile(script, JSON.stringify([["goto", "https://example.com/issues/milestones"], ["wait", "body"], ["goto", "https://example.com/milestone/1"], ["wait", "#final"]]));
    await assert.rejects(tools.get("browser_record")!.execute("3", { script }), /Script step 1.*page-specific wait or expect-url/);
    assert.equal(called, false, "reject unchecked actions before opening a browser");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects malformed and unsafe script steps before opening a browser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  let called = false;
  const { tools } = extension(async () => { called = true; return ok({}); });
  try {
    for (const [source, message] of [
      ["not json", /step 0.*JSON/], ["{}", /step 0.*array/],
      ['[["goto","https:\/\/example.com"], ["click", ""]]', /step 2/],
      ['[["goto","https:\/\/example.com"], ["record", "stop"]]', /step 2.*not allowed/],
      ['[["open", "https:\/\/example.com"]]', /step 1.*goto/],
      ['[["click", "@e24"]]', /step 1.*snapshot ref.*new tab/],
      ['[["click", "#ok", "--session=another"]]', /step 1.*not allowed/],
    ] as const) {
      const script = join(directory, "invalid.json");
      await writeFile(script, source);
      await assert.rejects(tools.get("browser_record")!.execute("1", { script }), message);
    }
    assert.equal(called, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("keeps a partial take after a failed step in an existing tab", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["goto", "https://example.com"], ["wait", "#home"], ["click", "#missing"], ["wait", "#saved"], ["click", "#never"], ["wait", "#never-saved"]]));
  const commands: string[][] = [];
  let path = "";
  const { tools } = extension(async (args) => {
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    if (args[0] !== "action") throw new Error("Must use the existing tab");
    assert.equal(args[4], "7");
    const argv = args.slice(args.indexOf("--") + 1);
    commands.push(argv);
    if (argv[0] === "eval") return { code: 0, stdout: "800x500", stderr: "" };
    if (argv[1] === "restart") path = argv[2];
    if (argv[0] === "click") return { code: 1, stdout: "", stderr: "selector missing" };
    if (argv[0] === "get" && argv[1] === "url") return { code: 0, stdout: "https://example.com/current", stderr: "" };
    if (argv[1] === "stop") await writeFile(path, "partial");
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    await assert.rejects(tools.get("browser_record")!.execute("1", { script, tab: 7, name: "broken.mp4" }), (error: Error) => {
      assert.match(error.message, /step 3\/6 failed.*#missing.*current URL: https:\/\/example\.com\/current.*partial take: .*broken\.mp4/);
      return true;
    });
    assert.deepEqual(commands.slice(-4), [["click", "#missing"], ["get", "url"], ["record", "stop"], ["set", "viewport", "800", "500"]]);
    assert.equal(await readFile(path, "utf8"), "partial");
    assert.equal(await readFile(path.replace(/\.mp4$/, ".json"), "utf8"), await readFile(script, "utf8"));
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses the first goto host for its filename and warns on large finished takes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-test-"));
  const script = join(directory, "take.json");
  await writeFile(script, JSON.stringify([["set", "device", "Desktop Chrome"], ["goto", "https://example.com/page"], ["wait", "#page"]]));
  const commands: string[][] = [];
  let path = "";
  const { tools } = extension(async (args, command) => {
    if (command === "ffprobe") return args.includes("format=duration")
      ? { code: 0, stdout: "2.5\n", stderr: "" }
      : { code: 1, stdout: "", stderr: "missing" };
    if (command === "ffmpeg") { await writeFile(args.at(-1)!, Buffer.from("89504e470d0a1a0a", "hex")); return { code: 0, stdout: "", stderr: "" }; }
    if (args[0] === "ls") return ok({ browsers: [{ key: "human", inCurrentTab: true, tabs: [{ id: 7 }] }] });
    const argv = args.slice(args.indexOf("--") + 1);
    commands.push(argv);
    if (argv[0] === "eval") return { code: 0, stdout: "800x500", stderr: "" };
    if (argv[1] === "restart") path = argv[2];
    if (argv[1] === "stop") await writeFile(path, Buffer.alloc(10 * 1024 * 1024 + 1));
    return { code: 0, stdout: "done", stderr: "" };
  });
  const old = [process.env.HERDR_ENV, process.env.HERDR_PANE_ID, process.env.HOME];
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "p1";
  process.env.HOME = directory;
  try {
    const result = await tools.get("browser_record")!.execute("1", { script, tab: 7 });
    assert.match(result.details.path, /\/Videos\/Recordings\/example\.com-\d{6}-[a-f0-9]{8}\.mp4$/);
    const next = await tools.get("browser_record")!.execute("2", { script, tab: 7 });
    assert.notEqual(next.details.path, result.details.path, "a repeated take must not collide within the same second");
    assert.equal(result.details.bytes, 10 * 1024 * 1024 + 1);
    assert.match(result.content[0].text, /exceeds 10 MB PR attachment limit/);
    assert(!commands.some((argv) => argv.join(" ") === "set viewport 1280 720"));
    assert.deepEqual(commands.at(-1), ["set", "viewport", "800", "500"]);
  } finally {
    for (const [key, value] of ["HERDR_ENV", "HERDR_PANE_ID", "HOME"].map((key, i) => [key, old[i]] as const)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
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
