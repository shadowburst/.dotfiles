import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { activateBrowserTools, BROWSER_TOOL_NAMES, initializeBrowserTools } from "./state.ts";

const VIDEO_LIMIT = 10 * 1024 * 1024;

type Browser = { key: string; tabs: { id: number }[]; inCurrentTab: boolean };
type Listing = { browsers: Browser[] };

async function output(text: string): Promise<string> {
  const truncated = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
  if (!truncated.truncated) return truncated.content;
  const path = join(tmpdir(), `terminal-browser-${randomUUID()}.txt`);
  await writeFile(path, text);
  return `${truncated.content}\n[Output truncated: ${truncated.outputLines} of ${truncated.totalLines} lines (${formatSize(truncated.outputBytes)} of ${formatSize(truncated.totalBytes)}). Full output: ${path}]`;
}

export default function browserTools(pi: ExtensionAPI) {
  let selected: { browser: string; tab: number } | undefined;
  let recording: { path: string; browser: string; tab: number } | undefined;
  let queue = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };

  const cli = async (args: string[], signal?: AbortSignal): Promise<string> => {
    if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_PANE_ID) {
      throw new Error("Browser tools require a Herdr-managed Pi pane");
    }
    const result = await pi.exec("terminal-browser", args, { signal, timeout: 120_000 });
    if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `terminal-browser exited ${result.code}`);
    return result.stdout.trim();
  };
  const listing = async (signal?: AbortSignal): Promise<Listing> => JSON.parse(await cli(["ls", "--json"], signal));

  const target = async (signal?: AbortSignal) => {
    const browsers = (await listing(signal)).browsers.filter((browser) => browser.inCurrentTab);
    if (selected) {
      if (!browsers.some((browser) => browser.key === selected!.browser && browser.tabs.some((tab) => tab.id === selected!.tab))) {
        throw new Error("Pi's browser tab was closed; start a new Pi session to create another one");
      }
      return selected;
    }
    if (browsers.length > 1) throw new Error("Multiple browsers in this Herdr tab; close the extras before using browser tools");
    if (browsers.length === 0) {
      const opened = JSON.parse(await cli(["open", "about:blank", "--split", "right"], signal));
      selected = { browser: opened.key, tab: opened.tabs[0].id };
    } else {
      const opened = JSON.parse(await cli(["new-tab", "about:blank", "--browser", browsers[0].key], signal));
      selected = { browser: browsers[0].key, tab: opened.openedTab };
    }
    return selected;
  };
  const action = async (args: string[], signal?: AbortSignal) => {
    const { browser, tab } = await target(signal);
    return cli(["action", "--browser", browser, "--tab", String(tab), "--follow", "--", ...args], signal);
  };
  const recordingPath = async (name: string | undefined, fallback: string) => {
    const filename = `${name ?? fallback}${(name ?? fallback).endsWith(".mp4") ? "" : ".mp4"}`;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/.test(filename)) throw new Error("Name must be a plain filename with an optional .mp4 suffix");
    const directory = join(homedir(), "Videos", "Recordings");
    await mkdir(directory, { recursive: true });
    const path = join(directory, filename);
    if (await stat(path).then(() => true, () => false)) throw new Error(`Recording already exists: ${path}`);
    return path;
  };
  const checkVideo = async (path: string, minimum = 1) => {
    const result = await pi.exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]);
    const duration = Number(result.stdout.trim());
    if (result.code !== 0 || !Number.isFinite(duration)) throw new Error(`Recording saved but video could not be checked: ${path}`);
    // ponytail: a duration floor catches lost capture; inspect frames for visually wrong takes.
    if (duration < minimum) throw new Error(`Video is only ${duration}s, ${minimum > 1 ? `scripted holds need at least ${minimum}s` : "too short to show the journey"}; inspect partial take: ${path}`);
    return duration;
  };
  const lastFrame = async (path: string) => {
    const frame = join(tmpdir(), `browser-frame-${randomUUID()}.png`);
    try {
      const result = await pi.exec("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.2", "-i", path, "-frames:v", "1", "-vf", "scale=960:-1", frame]);
      if (result.code !== 0) throw new Error(result.stderr.trim());
      return { type: "image" as const, data: (await readFile(frame)).toString("base64"), mimeType: "image/png" };
    } catch (error) {
      throw new Error(`Recording saved but its last frame could not be inspected: ${path}; ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await unlink(frame).catch(() => undefined);
    }
  };

  pi.registerTool({
    name: "browser_tools",
    label: "Browser Tools",
    description: "Activate terminal-browser tools by exact name",
    promptSnippet: "Activate the browser tools needed for a Herdr browser task",
    promptGuidelines: ["Activate only the browser tools needed. For a recorded journey, explore with browser_open/browser_action without recording; write a JSON script of stable argv steps (use CSS selectors, not snapshot refs) with ['wait','2000'] between interactions; call browser_record with script and expectUrl, then inspect the full video. The JSON is saved beside the MP4. Use live action start/stop only when explicitly asked for live recording."],
    parameters: Type.Object({ tools: Type.Array(StringEnum(BROWSER_TOOL_NAMES), { minItems: 1, uniqueItems: true }) }),
    async execute(_id, { tools }) {
      const result = activateBrowserTools(pi.getActiveTools(), tools);
      pi.setActiveTools(result.active);
      return { content: [{ type: "text", text: `Loaded: ${result.loaded.join(", ") || "none"}` }], details: result };
    },
  });

  pi.registerTool({
    name: "browser_open",
    label: "Browser Open",
    description: "Open a Pi-owned tab in a right-hand Herdr browser split, or navigate that tab",
    parameters: Type.Object({ url: Type.Optional(Type.String({ description: "URL or local HTML path" })) }),
    async execute(_id, { url }, signal) {
      return serial(async () => {
        const tab = await target(signal);
        const text = url ? await action(["goto", url.startsWith("/") || url.startsWith(".") ? pathToFileURL(resolve(url)).href : url], signal) : `Browser ${tab.browser}, tab ${tab.tab}`;
        return { content: [{ type: "text", text: await output(text) }], details: tab };
      });
    },
  });

  pi.registerTool({
    name: "browser_action",
    label: "Browser Action",
    description: "Run native terminal-browser commands in Pi's dedicated tab (snapshot, click, fill, press, eval, console, network, ['tab','list'], set device/viewport). Pass argv, not a shell command; use browser_open for navigation and tab creation. 'tabs' and 'help' are not commands.",
    parameters: Type.Object({ args: Type.Array(Type.String(), { minItems: 1, description: "Agent-browser command and arguments, e.g. [\"click\", \"@e3\"]" }) }),
    async execute(_id, { args }, signal) {
      return serial(async () => {
        if (args[0] === "open" || (args[0] === "tab" && args[1] !== "list")) {
          throw new Error("Use browser_open for Pi's tab; creating or switching other tabs is not supported");
        }
        let text: string;
        try { text = await action(args, signal); }
        catch (error) {
          const url = await action(["get", "url"], signal).catch(() => "");
          throw new Error(`${error instanceof Error ? error.message : String(error)}${url ? `; current URL: ${url}` : ""}`);
        }
        return { content: [{ type: "text", text: await output(text) }], details: undefined };
      });
    },
  });

  pi.registerTool({
    name: "browser_screenshot",
    label: "Browser Screenshot",
    description: "Capture Pi's tab to a PNG and return it as an inline image",
    parameters: Type.Object({ fullPage: Type.Optional(Type.Boolean()) }),
    async execute(_id, { fullPage }, signal) {
      return serial(async () => {
        const path = join(tmpdir(), `browser-screenshot-${randomUUID()}.png`);
        await action(["screenshot", path, ...(fullPage ? ["--full"] : [])], signal);
        const data = (await readFile(path)).toString("base64");
        return {
          content: [{ type: "text", text: `Screenshot saved to ${path}` }, { type: "image", data, mimeType: "image/png" }],
          details: { path },
        };
      });
    },
  });

  pi.registerTool({
    name: "browser_record",
    label: "Browser Record",
    description: `Record a scripted journey: first explore with browser_open/browser_action, then write a bare JSON array of agent-browser argv arrays (e.g. [["goto","https://example.com"],["wait","2000"],["click","a[href='/issues']"],["wait","2000"]]). Pass its absolute path as script; replay saves <name>.mp4 and <name>.json in ~/Videos/Recordings. Mid-script goto steps are joined as hard cuts (native recording loses frames on full navigations). Use expectUrl to verify the destination. Waits take CSS selectors or milliseconds, not accessibility-tree roles or text; snapshot refs (@e...) do not transfer to a new tab. Inspect the full video before using it as evidence. Live action start/stop remains opt-in only for explicitly requested live recording.`,

    parameters: Type.Object({
      action: Type.Optional(StringEnum(["start", "stop"] as const)),
      script: Type.Optional(Type.String({ description: "Absolute path to an agent-authored JSON script of agent-browser argv arrays; copied beside the MP4" })),
      name: Type.Optional(Type.String({ description: "Plain output filename, with optional .mp4 suffix, without directories" })),
      expectUrl: Type.Optional(Type.String({ description: "Exact destination URL to verify before finishing the take" })),

      tab: Type.Optional(Type.Number({ description: "Record this existing tab instead of opening a fresh one" })),
    }),
    async execute(_id, { action: mode, script, name, tab, expectUrl }, signal) {
      return serial(async () => {
        if (mode && (script || tab !== undefined)) throw new Error("Use action for a live recording or script/tab for a scripted take");
        if (mode === "stop") {
          if (!recording) throw new Error("No recording active in this Pi session");
          const { path, browser, tab } = recording;
          const holdError = await cli(["action", "--browser", browser, "--tab", String(tab), "--follow", "--", "wait", "1500"], signal).then(() => undefined, (error: unknown) => error);
          const actual = expectUrl ? await cli(["action", "--browser", browser, "--tab", String(tab), "--follow", "--", "get", "url"], signal).catch(() => "(unavailable)") : undefined;
          await cli(["action", "--browser", browser, "--tab", String(tab), "--follow", "--", "record", "stop"]);
          recording = undefined;
          if (holdError) throw new Error(`Recording saved but final hold failed: ${String(holdError)}; partial take: ${path}`);
          if (expectUrl && actual !== expectUrl) throw new Error(`expected URL: ${expectUrl}; actual: ${actual}; partial take: ${path}`);
          const bytes = (await stat(path)).size;
          await checkVideo(path);
          return { content: [{ type: "text", text: `${path} (${formatSize(bytes)}); inspect the video before using it as evidence` }, await lastFrame(path)], details: { path, bytes: bytes as number | undefined, script: undefined as string | undefined } };
        }
        if (recording) throw new Error(`Recording already active: ${recording.path}`);
        if (mode === "start") {
          const path = await recordingPath(name, `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`);
          const take = await target(signal);
          await cli(["action", "--browser", take.browser, "--tab", String(take.tab), "--follow", "--", "record", "restart", path], signal);
          recording = { path, ...take };
          return { content: [{ type: "text", text: `Recording started: ${path}` }], details: { path, bytes: undefined as number | undefined, script: undefined as string | undefined } };
        }
        if (!script) throw new Error("Use action start/stop or provide a script");
        if (!isAbsolute(script)) throw new Error("Script must be an absolute path");
        let steps: unknown;
        let source: string;
        try { source = await readFile(script, "utf8"); steps = JSON.parse(source); }
        catch (error) { throw new Error(`Script step 0: cannot read JSON: ${error instanceof Error ? error.message : String(error)}`); }
        if (!Array.isArray(steps)) throw new Error("Script step 0: expected an array of argv arrays");
        const blocked = new Set(["close", "quit", "exit", "install", "launch", "connect", "disconnect", "record", "open", "tab"]);
        const flags = new Set(["--session", "--cdp", "--auto-connect", "--headed", "--executable-path", "--profile", "--provider"]);
        for (const [index, step] of steps.entries()) {
          if (!Array.isArray(step) || !step.length || !step.every((arg) => typeof arg === "string" && arg.trim())) {
            throw new Error(`Script step ${index + 1}: expected a non-empty array of non-empty strings`);
          }
          const command = step.find((arg: string) => !arg.startsWith("-"));
          if (blocked.has(command) || step.some((arg: string) => flags.has(arg.split("=")[0]))) {
            throw new Error(`Script step ${index + 1}: command or flag not allowed; use goto instead of open/tab`);
          }
          if (tab === undefined && step.slice(1).some((arg: string) => /^@e\d+$/.test(arg))) {
            throw new Error(`Script step ${index + 1}: snapshot refs cannot be replayed in a new tab; use CSS selectors`);
          }
        }
        const firstUrl = steps.find((step: string[]) => step[0] === "goto")?.[1];
        let host = "take";
        try { if (firstUrl) host = new URL(firstUrl).hostname.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "") || "take"; }
        catch { /* A relative/local goto uses the fallback name. */ }
        const path = await recordingPath(name, `${host}-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}-${randomUUID().slice(0, 8)}`);
        const scriptPath = path.replace(/\.mp4$/, ".json");

        let take: { browser: string; tab: number };
        if (tab === undefined) {
          const previous = selected;
          take = await target(signal);
          if (previous) {
            const opened = JSON.parse(await cli(["new-tab", "about:blank", "--browser", take.browser], signal));
            selected = take = { browser: take.browser, tab: opened.openedTab };
          }
        } else {
          const browsers = (await listing(signal)).browsers.filter((browser) => browser.inCurrentTab);
          if (!Number.isInteger(tab) || browsers.length !== 1 || !browsers[0].tabs.some((entry) => entry.id === tab)) {
            throw new Error(`Tab ${tab} is not in the current Herdr browser`);
          }
          take = { browser: browsers[0].key, tab };
        }
        const run = (argv: string[], takeSignal?: AbortSignal) => cli(["action", "--browser", take.browser, "--tab", String(take.tab), "--follow", "--", ...argv], takeSignal);
        const native = await run(["eval", "[innerWidth, innerHeight].join('x')"], signal).catch(() => "");
        const size = /^"?(\d+)x(\d+)"?$/.exec(native);
        const customViewport = steps.some((step: string[]) => step[0] === "set" && (step[1] === "viewport" || step[1] === "device"));
        let preloadCount = 0;
        while (steps[preloadCount]?.[0] === "set") preloadCount++;
        if (steps[preloadCount]?.[0] === "goto") preloadCount++;
        else preloadCount = 0;
        const runStep = async (step: string[], index: number) => {
          try { await run(step, signal); }
          catch (error) {
            const url = await run(["get", "url"], signal).catch(() => "");
            throw new Error(`step ${index + 1}/${steps.length} failed: ${JSON.stringify(step)}: ${error instanceof Error ? error.message : String(error)}${url ? `; current URL: ${url}` : ""}`);
          }
        };
        let failure: Error | undefined;
        const clips = [path];
        try {
          if (!customViewport) await run(["set", "viewport", "1280", "720"], signal);
          // terminal-browser clicks can miss after goto during capture; preload the first page before recording.
          for (let index = 0; index < preloadCount; index++) await runStep(steps[index], index);
          // agent-browser's start creates a browser context, which Electron rejects; restart records the current tab.
          await run(["record", "restart", path], signal);
          recording = { path, ...take };
          await writeFile(scriptPath, source, { flag: "wx" });
          for (let index = preloadCount; index < steps.length; index++) {
            const step = steps[index];
            if (step[0] === "goto" && index > 0) {
              // ponytail: cut between navigations while terminal-browser loses capture on full-page loads; remove once fixed upstream.
              await run(["record", "stop"]);
              recording = undefined;
              await runStep(step, index);
              const clip = join(tmpdir(), `browser-clip-${randomUUID()}.mp4`);
              await run(["record", "restart", clip], signal);
              clips.push(clip);
              recording = { path: clip, ...take };
            } else await runStep(step, index);
          }
          await run(["wait", "1500"], signal);
          if (expectUrl) {
            const actual = await run(["get", "url"], signal);
            if (actual !== expectUrl) throw new Error(`expected URL: ${expectUrl}; actual: ${actual}`);
          }
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
        } finally {
          if (recording) {
            try { await run(["record", "stop"]); }
            catch (error) { failure ??= error instanceof Error ? error : new Error(String(error)); }
            recording = undefined;
          }
          if (size) {
            try { await run(["set", "viewport", size[1], size[2]]); }
            catch (error) { failure ??= error instanceof Error ? error : new Error(String(error)); }
          }
        }
        if (clips.length > 1) {
          const manifest = join(tmpdir(), `browser-clips-${randomUUID()}.txt`);
          const joined = path.replace(/\.mp4$/, `.joined-${randomUUID()}.mp4`);
          try {
            await writeFile(manifest, clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join("\n"));
            const result = await pi.exec("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", manifest, "-c", "copy", joined], { timeout: 120_000 });
            if (result.code !== 0) throw new Error(result.stderr.trim() || "ffmpeg concat failed");
            await rename(joined, path);
            await Promise.all(clips.slice(1).map((clip) => unlink(clip).catch(() => undefined)));
          } catch (error) {
            failure ??= new Error(`Joining scripted clips failed: ${error instanceof Error ? error.message : String(error)}; clips: ${clips.join(", ")}`);
          } finally {
            await unlink(manifest).catch(() => undefined);
            await unlink(joined).catch(() => undefined);
          }
        }
        if (failure) throw new Error(`${failure.message}${await stat(path).then(() => `; partial take: ${path}`, () => "")}${await stat(scriptPath).then(() => `; script: ${scriptPath}`, () => "")}`);
        const bytes = await stat(path).then((file) => file.size, () => { throw new Error(`Recording finished but video was not saved: ${path}`); });
        const holdSeconds = steps.reduce((sum: number, step: string[]) => sum + (step[0] === "wait" && /^\d+$/.test(step[1]) ? Number(step[1]) / 1000 : 0), 0);
        await checkVideo(path, Math.max(1, holdSeconds));
        const probe = await pi.exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", path]).catch(() => undefined);
        const dimensions = probe?.code === 0 && /^\d+x\d+$/.test(probe.stdout.trim()) ? `, ${probe.stdout.trim()}` : "";
        const note = bytes > VIDEO_LIMIT ? "; exceeds 10 MB PR attachment limit" : "";
        return { content: [{ type: "text", text: `${path} (${formatSize(bytes)}); script: ${scriptPath}${dimensions}${note}; inspect the full video before using it as evidence` }, await lastFrame(path)], details: { path, script: scriptPath, bytes } };
      });
    },
  });

  pi.registerTool({
    name: "browser_handoff",
    label: "Browser Handoff",
    description: "Pause while the human operates Pi's visible browser tab, then resume on confirmation",
    parameters: Type.Object({ message: Type.String({ description: "What the user should do in the browser" }) }),
    async execute(_id, { message }, signal, _update, ctx) {
      return serial(async () => {
        if (!ctx.hasUI) throw new Error("Browser handoff requires interactive Pi UI");
        await target(signal);
        await cli(["action", "done"], signal);
        const confirmed = await ctx.ui.confirm("Your turn in the browser", `${message}\n\nChoose Yes when finished, No to cancel.`);
        return { content: [{ type: "text", text: confirmed ? "User finished; continue in Pi's browser tab" : "User cancelled browser handoff" }], details: { confirmed } };
      });
    },
  });

  pi.on("session_start", () => pi.setActiveTools(initializeBrowserTools(pi.getActiveTools())));
  pi.on("agent_settled", async () => {
    if (selected) await cli(["action", "done"]).catch(() => undefined);
  });
  pi.on("session_shutdown", () => serial(async () => {
    if (recording) await cli(["action", "--browser", recording.browser, "--tab", String(recording.tab), "--follow", "--", "record", "stop"]);
  }));
}
