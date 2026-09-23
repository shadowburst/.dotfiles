import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
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
  let recording: string | undefined;
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

  pi.registerTool({
    name: "browser_tools",
    label: "Browser Tools",
    description: "Activate terminal-browser tools by exact name",
    promptSnippet: "Activate the browser tools needed for a Herdr browser task",
    promptGuidelines: ["Use browser_tools to activate browser_open, browser_action, browser_screenshot, browser_record, or browser_handoff before using them."],
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
        const text = url ? await action(["goto", url], signal) : `Browser ${tab.browser}, tab ${tab.tab}`;
        return { content: [{ type: "text", text: await output(text) }], details: tab };
      });
    },
  });

  pi.registerTool({
    name: "browser_action",
    label: "Browser Action",
    description: "Run native terminal-browser commands in Pi's dedicated tab (snapshot, click, fill, press, eval, console, network, tab list, set device/viewport). Pass argv, not a shell command; use browser_open for navigation and tab creation.",
    parameters: Type.Object({ args: Type.Array(Type.String(), { minItems: 1, description: "Agent-browser command and arguments, e.g. [\"click\", \"@e3\"]" }) }),
    async execute(_id, { args }, signal) {
      return serial(async () => {
        if (args[0] === "open" || (args[0] === "tab" && args[1] !== "list")) {
          throw new Error("Use browser_open for Pi's tab; creating or switching other tabs is not supported");
        }
        const text = await action(args, signal);
        return { content: [{ type: "text", text: await output(text) }] };
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
    description: "Start/stop WebM recording of Pi's visible tab. Check the saved video before using it as evidence.",
    parameters: Type.Object({
      action: StringEnum(["start", "stop"] as const),
      name: Type.Optional(Type.String({ description: "Plain WebM filename for start, without directories" })),
    }),
    async execute(_id, { action: mode, name }, signal) {
      return serial(async () => {
        if (mode === "start") {
          if (recording) throw new Error(`Recording already active: ${recording}`);
          const filename = name ?? `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}.webm`;
          if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.webm$/.test(filename)) throw new Error("Name must be a plain .webm filename");
          const directory = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "pi", "browser-recordings");
          await mkdir(directory, { recursive: true });
          const path = join(directory, filename);
          if (await stat(path).then(() => true, () => false)) throw new Error(`Recording already exists: ${path}`);
          try {
            // agent-browser's start creates a browser context, which Electron rejects; restart records the current tab.
            await action(["record", "restart", path], signal);
          } catch (error) {
            throw new Error(`Native terminal-browser recording failed: ${error instanceof Error ? error.message : String(error)}`);
          }
          recording = path;
          return { content: [{ type: "text", text: `Recording started: ${path}` }], details: { path } };
        }
        if (!recording) throw new Error("No recording active in this Pi session");
        const path = recording;
        await action(["record", "stop"], signal);
        recording = undefined;
        const bytes = (await stat(path)).size;
        if (bytes > VIDEO_LIMIT) throw new Error(`Recording exceeds 10 MB PR attachment limit: ${path} (${formatSize(bytes)})`);
        return {
          content: [{ type: "text", text: `${path} (${formatSize(bytes)})` }],
          details: { path, bytes },
        };
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
    if (recording) await action(["record", "stop"]);
  }));
}
