import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { registerBrowserTestLoader } from "./test-loader.mjs";

registerBrowserTestLoader();
const { default: extension } = await import("./index.ts");
const run = promisify(execFile);

async function fixture(check: (session: any) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "pi-recording-interface-"));
  const previous = { HOME: process.env.HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME };
  process.env.HOME = home; process.env.XDG_STATE_HOME = join(home, "state");
  let submissions = 0;
  const server = createServer((request, response) => {
    if (request.url === "/submit") { submissions++; response.end("ok"); return; }
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><title>Public write fixture</title><style>body{font:24px sans-serif;padding:60px}button{margin:100px;padding:20px}p{width:300px}</style><button id="save">Save report</button><p id="receipt" hidden>Report saved</p><script>document.querySelector('#save').onclick=async()=>{await fetch('/submit',{method:'POST'});document.querySelector('#receipt').hidden=false;};</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/`;
  const tools = new Map<string, any>(); const handlers = new Map<string, any>(); const calls: Array<[string, string[]]> = []; const retained = new Set<string>();
  let failRender = false; let failConvert = false; let captureOnly = false;
  const exec = async (command: string, args: string[], options: any = {}) => {
    if (command === "git") return { code: 1, stdout: "", stderr: "not a repository" };
    calls.push([command, [...args]]);
    if (command === "cutaway" && args[0] === "render" && failRender) return { code: 1, stdout: "", stderr: "injected render failure" };
    if (command === "ffmpeg" && args.includes("libvpx-vp9") && failConvert) return { code: 1, stdout: "", stderr: "injected conversion failure" };
    try {
      const actual = command === "cutaway" ? process.env.CUTAWAY_BIN || command : command;
      const result = await run(actual, [...args, ...(command === "cutaway" && args[0] === "record" && captureOnly ? ["--capture-only"] : [])], { ...options, maxBuffer: 5_000_000 });
      return { code: 0, ...result };
    } catch (error: any) {
      if (options.signal?.aborted) throw error;
      return { code: typeof error.code === "number" ? error.code : 1, stdout: error.stdout || "", stderr: error.stderr || "" };
    }
  };
  extension({ exec, registerTool: (tool: any) => tools.set(tool.name, tool), on: (name: string, handler: any) => handlers.set(name, handler), appendEntry: () => {}, getActiveTools: () => [], setActiveTools: () => {} } as any);
  const call = async (name: string, input: any) => {
    const result = await tools.get(name).execute("fixture", input, undefined, undefined, { hasUI: false, ui: {} });
    if (result.structuredContent.artifacts?.workDirectory) retained.add(dirname(result.structuredContent.artifacts.workDirectory));
    return result;
  };
  const plan = join(home, "plan.json");
  const writePlan = (expect: string) => writeFile(plan, JSON.stringify({ url, viewport: { width: 1280, height: 720 }, steps: [{ action: "click", selector: "#save", expect }] }));
  try { await check({ home, url, plan, writePlan, call, calls, submissions: () => submissions, inject: (render: boolean, convert: boolean) => { failRender = render; failConvert = convert; captureOnly = render; } }); }
  finally {
    await handlers.get("session_shutdown")?.({}, { hasUI: false, ui: {} });
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const directory of retained) await rm(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    await rm(home, { recursive: true, force: true });
  }
}

test("a committed POST followed by missing completion evidence cannot be recovered or replayed", { timeout: 120_000 }, async () => fixture(async ({ plan, writePlan, call, calls, submissions }) => {
  await writePlan("#missing-receipt");
  const failed = await call("browser_record", { plan, name: "uncertain" });
  assert.equal(failed.isError, true); assert.equal(failed.structuredContent.phase, "capture"); assert.equal(failed.structuredContent.businessOutcome, "unknown");
  assert.equal(submissions(), 1);
  const workDirectory = failed.structuredContent.artifacts.workDirectory;
  assert.equal(JSON.parse(await readFile(join(workDirectory, "timeline.json"), "utf8")).status, "failed");
  const before = calls.length;
  const recovery = await call("browser_recover", { workDirectory, name: "recovery" });
  assert.equal(recovery.isError, true); assert.equal(recovery.structuredContent.captureStatus, "failed");
  assert.equal(calls.length, before, "failed capture must not render, convert or launch a browser");
  const replay = await call("browser_record", { plan });
  assert.equal(replay.isError, true); assert.equal(replay.structuredContent.errorCode, "business_outcome_unknown");
  assert.equal(calls.length, before); assert.equal(submissions(), 1);
}));

test("exporting an unrelated completed capture cannot unlock a previously committed unknown POST", { timeout: 180_000 }, async () => fixture(async ({ home, url, plan, writePlan, call, calls, submissions }) => {
  const peerPlan = join(home, "peer.json"); const peer = join(home, "peer-capture");
  await writeFile(peerPlan, JSON.stringify({ url, viewport: { width: 1280, height: 720 }, steps: [{ action: "focus", selector: "#save" }] }));
  await run(process.env.CUTAWAY_BIN || "cutaway", ["record", peerPlan, "--out", peer, "--capture-only"], { maxBuffer: 5_000_000 });
  assert.equal(submissions(), 0);
  await writePlan("#missing-receipt");
  const failed = await call("browser_record", { plan, name: "uncertain" });
  assert.equal(failed.isError, true); assert.equal(submissions(), 1);
  const recovered = await call("browser_recover", { workDirectory: peer, name: "peer" });
  assert.equal(recovered.structuredContent.status, "ok", JSON.stringify(recovered));
  const before = calls.length;
  const replay = await call("browser_record", { plan, name: "forbidden-replay" });
  assert.equal(replay.structuredContent.errorCode, "business_outcome_unknown"); assert.equal(calls.length, before); assert.equal(submissions(), 1);
}));

for (const phase of ["render", "convert"]) test(`registered recovery after ${phase} failure exports playable WebM without a second POST`, { timeout: 180_000 }, async t => fixture(async ({ plan, writePlan, call, calls, submissions, inject }) => {
  await writePlan("#receipt"); inject(phase === "render", phase === "convert");
  const started = performance.now();
  const failed = await call("browser_record", { plan, name: "finished" });
  assert.equal(failed.isError, true, JSON.stringify(failed)); assert.equal(failed.structuredContent.captureStatus, "complete"); assert.equal(failed.structuredContent.phase, phase);
  assert.equal(submissions(), 1);
  const workDirectory = failed.structuredContent.artifacts.workDirectory;
  inject(false, false); const before = calls.length;
  const recovered = await call("browser_recover", { workDirectory, name: "finished" });
  assert.equal(recovered.structuredContent.status, "ok", JSON.stringify(recovered));
  assert.equal(recovered.structuredContent.businessOutcome, "unknown", "export success is not a business receipt");
  const recoveryCalls = calls.slice(before);
  assert(!recoveryCalls.some(([command, args]: [string, string[]]) => command === "cutaway" && args[0] === "record"));
  assert.equal(recoveryCalls.some(([command, args]: [string, string[]]) => command === "cutaway" && args[0] === "render"), phase === "render");
  assert.equal(submissions(), 1);
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", recovered.structuredContent.result.path]);
  const video = JSON.parse(stdout);
  assert.equal(video.streams[0].codec_name, "vp9"); assert.equal(video.streams[0].width, 1280); assert.equal(video.streams[0].height, 720); assert(Number(video.format.duration) > 0);
  t.diagnostic(JSON.stringify({ task: `recovery-${phase}`, toolRounds: 2, observationBytes: Buffer.byteLength(JSON.stringify(failed.structuredContent)) + Buffer.byteLength(JSON.stringify(recovered.structuredContent)), elapsedSeconds: (performance.now() - started) / 1000, timings: recovered.structuredContent.timings, submissions: submissions() }));
}));
