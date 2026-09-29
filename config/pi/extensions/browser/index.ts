import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { createHash, randomUUID } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, devices, type Browser, type BrowserContext, type Page, type Video } from "playwright";
import { activateBrowserTools, BROWSER_TOOL_NAMES, initializeBrowserTools } from "./state.ts";

const VIEWPORT = { width: 1280, height: 720 };
const INTERACTIVE_SELECTOR = "a[href],button,input,select,textarea,[role],[tabindex]";

type ElementDescription = { selector: string; role: string; name: string };
type Recording = { path: string; temporaryDirectory: string; video: Video };
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

type EventSummary = { type: string; text: string };

function formatToolOutput(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "undefined";
  return truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES }).content;
}

function pageUrl(raw: string): string {
  if (raw.startsWith("/") || raw.startsWith(".")) return pathToFileURL(resolve(raw)).href;
  const url = new URL(raw);
  if (!["http:", "https:", "file:"].includes(url.protocol)) throw new Error("URL must use http:, https:, or file:");
  return url.href;
}

async function outputPath(name?: string): Promise<string> {
  const stem = name?.replace(/\.webm$/, "") ?? `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(stem)) throw new Error("Name must be a plain filename with an optional .webm suffix");
  const directory = join(homedir(), "Videos", "Recordings");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${stem}.webm`);
  if (await stat(path).then(() => true, () => false)) throw new Error(`Recording already exists: ${path}; omit name for a unique filename on retry`);
  return path;
}

class BrowserRuntime {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private recording?: Recording;
  private refs = new Map<string, string>();
  private consoleEvents: EventSummary[] = [];
  private networkEvents: EventSummary[] = [];
  private queue = Promise.resolve();
  private projectDirectory = process.cwd();
  private statePath?: Promise<string>;

  constructor(private readonly gitCommonDirectory: (cwd: string) => Promise<string | undefined>) {}

  setProjectDirectory(directory: string): void {
    if (directory === this.projectDirectory) return;
    this.projectDirectory = directory;
    this.statePath = undefined;
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async launch(): Promise<Browser> {
    if (this.browser) return this.browser;
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    this.browser = await chromium.launch({ headless: false, args: ["--class=pi-browser-tools"], ...(executablePath ? { executablePath } : {}) });
    return this.browser;
  }

  private attach(page: Page): void {
    page.on("console", message => this.consoleEvents.push({ type: message.type(), text: message.text() }));
    page.on("pageerror", error => this.consoleEvents.push({ type: "error", text: error.message }));
    page.on("response", response => this.networkEvents.push({ type: String(response.status()), text: response.url() }));
    page.on("requestfailed", request => this.networkEvents.push({ type: "failed", text: `${request.url()}: ${request.failure()?.errorText ?? "request failed"}` }));
  }

  private projectStatePath(): Promise<string> {
    return this.statePath ??= (async () => {
      const cwd = await realpath(this.projectDirectory).catch(() => resolve(this.projectDirectory));
      const commonDirectory = await this.gitCommonDirectory(cwd);
      const identity = commonDirectory
        ? await realpath(isAbsolute(commonDirectory) ? commonDirectory : resolve(cwd, commonDirectory)).catch(() => resolve(cwd, commonDirectory))
        : cwd;
      const stateHome = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
      return join(stateHome, "pi", "browser", `${createHash("sha256").update(identity).digest("hex")}.json`);
    })();
  }

  private async storedState(): Promise<StorageState | undefined> {
    const path = await this.projectStatePath();
    let contents: string;
    try {
      contents = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    try {
      const state = JSON.parse(contents);
      if (!state || !Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw new Error("Invalid browser storage state");
      return state;
    } catch {
      await rm(path, { force: true });
      return undefined;
    }
  }

  private async newPage(options: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
    const browser = await this.launch();
    const storageState = await this.storedState();
    try {
      this.context = await browser.newContext({ viewport: VIEWPORT, ...(storageState ? { storageState } : {}), ...options });
    } catch (error) {
      if (!storageState) throw error;
      const freshContext = await browser.newContext({ viewport: VIEWPORT, ...options });
      await rm(await this.projectStatePath(), { force: true });
      this.context = freshContext;
    }
    this.page = await this.context.newPage();
    this.attach(this.page);
    this.refs.clear();
    return this.page;
  }

  async selectedPage(): Promise<Page> {
    return this.page ?? this.newPage();
  }

  async hasVisiblePasswordField(): Promise<boolean> {
    if (!this.page) return false;
    return this.page.locator('input[type="password"]:visible').first().isVisible();
  }

  async savedProjectStatePath(): Promise<string | undefined> {
    const path = await this.projectStatePath();
    return await stat(path).then(() => path, () => undefined);
  }

  async saveProjectState(): Promise<boolean> {
    if (!this.context) return false;
    const path = await this.projectStatePath();
    const directory = dirname(path);
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const state = await this.context.storageState({ indexedDB: true });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    try {
      await writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
    return true;
  }

  private async closeContext(persist = true): Promise<void> {
    if (!this.context) return;
    if (persist) await this.saveProjectState();
    await this.context.close();
    this.context = undefined;
    this.page = undefined;
  }

  async navigate(raw: string): Promise<{ url: string; status?: number }> {
    const page = await this.selectedPage();
    const response = await page.goto(pageUrl(raw), { waitUntil: "domcontentloaded", timeout: 30_000 });
    this.refs.clear();
    return { url: page.url(), status: response?.status() };
  }

  private selector(value: string): string {
    if (!value.startsWith("@")) return value;
    const selector = this.refs.get(value);
    if (!selector) throw new Error(`Unknown snapshot ref: ${value}; take a new snapshot`);
    return selector;
  }

  async snapshot(): Promise<string> {
    const page = await this.selectedPage();
    const elements = await page.locator(INTERACTIVE_SELECTOR).evaluateAll((nodes) => {
      const uniqueSelector = (element: Element): string => {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const name = element.getAttribute("name");
        if (name) return `${element.tagName.toLowerCase()}[name=${JSON.stringify(name)}]`;
        const parts: string[] = [];
        let current: Element | null = element;
        while (current && current !== document.documentElement) {
          const siblings = current.parentElement ? [...current.parentElement.children].filter(child => child.tagName === current!.tagName) : [];
          parts.unshift(`${current.tagName.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""}`);
          const candidate = parts.join(" > ");
          if (document.querySelectorAll(candidate).length === 1) return candidate;
          current = current.parentElement;
        }
        return parts.join(" > ");
      };
      return nodes.filter(node => {
        const element = node as HTMLElement;
        const style = getComputedStyle(element);
        return style.visibility !== "hidden" && style.display !== "none" && element.getBoundingClientRect().width > 0;
      }).slice(0, 200).map(node => {
        const element = node as HTMLElement;
        return {
          selector: uniqueSelector(element),
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          name: element.getAttribute("aria-label") || (element as HTMLInputElement).name || element.innerText?.trim().slice(0, 120) || "",
        };
      });
    }) as ElementDescription[];
    this.refs.clear();
    return elements.map((element, index) => {
      const ref = `@e${index + 1}`;
      this.refs.set(ref, element.selector);
      return `${ref} ${element.role}${element.name ? ` ${JSON.stringify(element.name)}` : ""}`;
    }).join("\n") || "No interactive elements";
  }

  async action(args: string[]): Promise<unknown> {
    const page = await this.selectedPage();
    const [command, ...values] = args;
    if (command === "goto") {
      if (values.length !== 1) throw new Error("goto needs one URL");
      return this.navigate(values[0]);
    }
    if (command === "snapshot") return this.snapshot();
    if (command === "click") {
      if (values.length !== 1) throw new Error("click needs one selector or ref");
      await page.locator(this.selector(values[0])).click();
      this.refs.clear();
      return "clicked";
    }
    if (command === "fill" || command === "type") {
      if (values.length !== 2) throw new Error(`${command} needs a selector and value`);
      const locator = page.locator(this.selector(values[0]));
      if (command === "fill") await locator.fill(values[1]);
      else await locator.pressSequentially(values[1]);
      this.refs.clear();
      return command === "fill" ? "filled" : "typed";
    }
    if (command === "press") {
      if (values.length === 1) await page.keyboard.press(values[0]);
      else if (values.length === 2) await page.locator(this.selector(values[0])).press(values[1]);
      else throw new Error("press needs a key, or a selector and key");
      this.refs.clear();
      return "pressed";
    }
    if (command === "eval") {
      if (values.length !== 1) throw new Error("eval needs one JavaScript expression");
      const result = await page.evaluate(values[0]);
      this.refs.clear();
      return result;
    }
    if (command === "get" && values[0] === "url" && values.length === 1) return page.url();
    if (command === "wait") {
      if (values.length !== 1) throw new Error("wait needs milliseconds or a selector");
      if (/^\d+$/.test(values[0])) await page.waitForTimeout(Number(values[0]));
      else await page.locator(this.selector(values[0])).waitFor({ state: "visible" });
      return "ready";
    }
    if (command === "set" && values[0] === "viewport" && values.length === 3) {
      const [width, height] = values.slice(1).map(Number);
      if (![width, height].every(value => Number.isInteger(value) && value > 0)) throw new Error("viewport width and height must be positive integers");
      await page.setViewportSize({ width, height });
      return "viewport set";
    }
    if (command === "set" && values[0] === "device" && values.length === 2) {
      if (this.recording) throw new Error("Cannot change device during an active recording");
      const device = devices[values[1]];
      if (!device) throw new Error(`Unknown Playwright device: ${values[1]}`);
      const { defaultBrowserType: _defaultBrowserType, ...options } = device;
      await this.closeContext();
      await this.newPage(options);
      return `device set: ${values[1]}`;
    }
    if (command === "console") return this.consoleEvents;
    if (command === "network") return this.networkEvents;
    if (command === "tab" && values[0] === "list") return [{ selected: true, url: page.url() }];
    throw new Error(`Unsupported browser action: ${args.join(" ")}`);
  }

  invalidateSnapshot(): void {
    this.refs.clear();
  }

  async screenshot(fullPage = false) {
    const path = join(tmpdir(), `browser-screenshot-${randomUUID()}.png`);
    const bytes = await (await this.selectedPage()).screenshot({ path, fullPage, type: "png" });
    return { path, data: Buffer.from(bytes).toString("base64") };
  }

  async startRecording(path: string): Promise<void> {
    if (this.recording) throw new Error(`Recording already active: ${this.recording.path}`);
    await this.closeContext();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "pi-browser-video-"));
    try {
      const page = await this.newPage({ recordVideo: { dir: temporaryDirectory, size: VIEWPORT } });
      const video = page.video();
      if (!video) throw new Error("Playwright did not start video recording");
      this.recording = { path, temporaryDirectory, video };
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async stopRecording(): Promise<string> {
    const recording = this.recording;
    if (!recording) throw new Error("No recording active in this Pi session");
    await this.closeContext();
    await rename(await recording.video.path(), recording.path);
    this.recording = undefined;
    await rm(recording.temporaryDirectory, { recursive: true, force: true });
    return recording.path;
  }

  async clearProjectState(): Promise<void> {
    if (this.recording) throw new Error("Cannot clear browser state during an active recording");
    await this.closeContext(false);
    await rm(await this.projectStatePath(), { force: true });
  }

  async stop(): Promise<void> {
    try {
      if (this.recording) await this.stopRecording();
      else await this.closeContext();
    } finally {
      this.context = undefined;
      this.page = undefined;
      const browser = this.browser;
      this.browser = undefined;
      await browser?.close();
      this.refs.clear();
      this.consoleEvents = [];
      this.networkEvents = [];
    }
  }
}

export default function browserTools(pi: ExtensionAPI) {
  const runtime = new BrowserRuntime(async (cwd) => {
    const result = await pi.exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, timeout: 30_000 });
    return result.code === 0 ? result.stdout.trim() || undefined : undefined;
  });
  const handoffLoginIfNeeded = async (ctx?: { hasUI: boolean; ui: { confirm(title: string, message: string): Promise<boolean> } }): Promise<void> => {
    if (!ctx?.hasUI || !await runtime.hasVisiblePasswordField()) return;
    const confirmed = await ctx.ui.confirm("Login required", "Log in using the visible browser, then choose Yes to continue.");
    if (confirmed) await runtime.saveProjectState();
    runtime.invalidateSnapshot();
  };

  pi.registerTool({
    name: "browser_tools",
    label: "Browser Tools",
    description: "Activate Playwright browser tools by exact name",
    promptSnippet: "Activate the browser tools needed for a browser task",
    promptGuidelines: ["Explore with browser_open/browser_action up to any irreversible action, then write a Cutaway JSON plan and run `cutaway validate <plan>` (schema only). Use stable selector strings, not snapshot refs; scope repeated forms and use `expect` on the actual visible success state. The script runs in a fresh browser and should submit only once. If recording fails, inspect the work directory and re-render completed captures instead of repeating side effects; never switch to live without an explicit user request."],
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
    description: "Open the turn's visible Playwright Chromium page or navigate it",
    parameters: Type.Object({ url: Type.Optional(Type.String({ description: "HTTP(S), file URL, or local HTML path" })) }),
    async execute(_id, { url }, _signal, _update, ctx) {
      return runtime.run(async () => {
        const result = url ? await runtime.navigate(url) : { url: (await runtime.selectedPage()).url() };
        await handoffLoginIfNeeded(ctx);
        return { content: [{ type: "text", text: formatToolOutput(result) }], details: result };
      });
    },
  });

  pi.registerTool({
    name: "browser_action",
    label: "Browser Action",
    description: "Run args such as ['snapshot'], ['get','url'], ['click',selector], ['fill',selector,value], ['press',selector,key], ['eval',expression], ['wait',selector]. Also supports goto, type, set viewport/device, console, network, tab list. Selectors are Playwright selector strings (CSS, text=, role=), not getByRole(...) expressions; @eN snapshot refs are session-only.",
    parameters: Type.Object({ args: Type.Array(Type.String(), { minItems: 1 }) }),
    async execute(_id, { args }, _signal, _update, ctx) {
      return runtime.run(async () => {
        try {
          const result = await runtime.action(args);
          if (args[0] === "goto" || args[0] === "click") await handoffLoginIfNeeded(ctx);
          return { content: [{ type: "text", text: formatToolOutput(result) }], details: { result } };
        } catch (error) {
          const url = await runtime.selectedPage().then(page => page.url()).catch(() => "");
          throw new Error(`${error instanceof Error ? error.message : String(error)}${url ? `; current URL: ${url}` : ""}`);
        }
      });
    },
  });

  pi.registerTool({
    name: "browser_screenshot",
    label: "Browser Screenshot",
    description: "Capture the selected Playwright page to a PNG and return it inline",
    parameters: Type.Object({ fullPage: Type.Optional(Type.Boolean()) }),
    async execute(_id, { fullPage }) {
      return runtime.run(async () => {
        const screenshot = await runtime.screenshot(fullPage);
        return { content: [{ type: "text", text: `Screenshot saved to ${screenshot.path}` }, { type: "image", data: screenshot.data, mimeType: "image/png" }], details: { path: screenshot.path } };
      });
    },
  });

  pi.registerTool({
    name: "browser_record",
    label: "Browser Record",
    description: "Render a native Cutaway JSON journey with cinematic cursor and zoom to WebM. Plans need url and steps (click, type, press, wait, focus, scroll, upload); see the installed Cutaway README/examples. Validate with `cutaway validate <plan>` before recording. Isolated headless 1280x720 standard render.",
    parameters: Type.Object({
      plan: Type.String({ description: "Absolute path to JSON: {\"url\":\"https://...\",\"steps\":[{\"action\":\"click\",\"selector\":\"#submit\",\"expect\":\"#success\"}]}. Cutaway uses type/text, not fill; selectors must be stable and unique." }),
      name: Type.Optional(Type.String({ description: "Plain output filename with optional .webm suffix" })),
      storageState: Type.Optional(Type.String({ description: "Absolute Playwright storage-state JSON path" })),
    }),
    async execute(_id, { plan, name, storageState }, signal) {
      return runtime.run(async () => {
        if (!plan) throw new Error("Provide a Cutaway plan");
        if (!isAbsolute(plan)) throw new Error("Plan must be an absolute path");
        if (storageState && !isAbsolute(storageState)) throw new Error("storageState must be an absolute path");
        await access(plan);
        if (storageState) await access(storageState);
        const validation = await pi.exec("cutaway", ["validate", plan], { signal, timeout: 30_000 });
        if (validation.code !== 0) throw new Error(validation.stderr.trim() || validation.stdout.trim() || "Invalid Cutaway plan");
        const fallback = basename(plan, extname(plan)).replace(/[^A-Za-z0-9._-]/g, "-") || "journey";
        const path = await outputPath(name ?? `${fallback}-${randomUUID().slice(0, 8)}`);
        const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-cutaway-"));
        const work = join(temporaryRoot, "recording");
        try {
          await runtime.saveProjectState();
        } catch (error) {
          await rm(temporaryRoot, { recursive: true, force: true });
          throw error;
        }
        const effectiveStorageState = storageState ?? await runtime.savedProjectStatePath();
        const args = ["record", plan, "--out", work, ...(effectiveStorageState ? ["--storage-state", effectiveStorageState] : []), "--width", "1280", "--height", "720", "--quality", "standard"];
        let motion: { cursorPoints: number; zoomEpisodes: number };
        try {
          const result = await pi.exec("cutaway", args, { signal, timeout: 600_000 });
          if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `Cutaway exited ${result.code}`);
          const mp4 = JSON.parse(result.stdout.trim()).output;
          if (typeof mp4 !== "string") throw new Error("Cutaway returned invalid output");
          const converted = await pi.exec("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-an", "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", path], { signal, timeout: 600_000 });
          if (converted.code !== 0) throw new Error(converted.stderr.trim() || `FFmpeg exited ${converted.code}`);
          if (!(await stat(path)).size) {
            await rm(path);
            throw new Error("Empty recording");
          }
          const timeline = JSON.parse(await readFile(join(work, "timeline.json"), "utf8"));
          const render = JSON.parse(await readFile(join(work, "render.json"), "utf8"));
          if (timeline.status !== "complete") throw new Error("Cutaway capture is incomplete");
          motion = { cursorPoints: timeline.points.length, zoomEpisodes: render.motion.zoomEpisodes };
          if (timeline.steps.some((step: { action: string }) => step.action === "click" || step.action === "type")
            && (motion.cursorPoints < 2 || motion.zoomEpisodes < 1)) throw new Error("Cinematic motion missing from interactive journey");
        } catch (error) {
          await rm(path, { force: true }).catch(() => undefined);
          throw new Error(`${error instanceof Error ? error.message : String(error)}; work directory: ${work}; output path: ${path}`);
        }
        await rm(temporaryRoot, { recursive: true, force: true });
        return { content: [{ type: "text", text: `${path}\nCursor points: ${motion.cursorPoints}; zoom episodes: ${motion.zoomEpisodes}` }], details: { path, motion } };
      });
    },
  });

  pi.registerTool({
    name: "browser_record_live",
    label: "Browser Record Live",
    description: "Opt-in live Playwright WebM recording without cinematic cursor or zoom. Use only when the user explicitly requests a live take.",
    parameters: Type.Object({
      action: StringEnum(["start", "stop"] as const),
      name: Type.Optional(Type.String({ description: "Plain output filename with optional .webm suffix" })),
    }),
    async execute(_id, { action, name }) {
      return runtime.run(async () => {
        if (action === "start") {
          const path = await outputPath(name);
          await runtime.startRecording(path);
          return { content: [{ type: "text", text: `Recording started: ${path}` }], details: { path } };
        }
        const path = await runtime.stopRecording();
        return { content: [{ type: "text", text: path }], details: { path } };
      });
    },
  });

  pi.registerTool({
    name: "browser_clear_state",
    label: "Browser Clear State",
    description: "Delete the current project's saved browser authentication after confirmation",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _update, ctx) {
      return runtime.run(async () => {
        if (!ctx.hasUI) throw new Error("Clearing browser state requires interactive Pi UI");
        const confirmed = await ctx.ui.confirm("Clear browser login?", "Delete saved browser authentication for this project and close its browser context?");
        if (!confirmed) return { content: [{ type: "text", text: "Browser state was not cleared" }], details: { cleared: false } };
        await runtime.clearProjectState();
        return { content: [{ type: "text", text: "Browser state cleared for this project" }], details: { cleared: true } };
      });
    },
  });

  pi.registerTool({
    name: "browser_handoff",
    label: "Browser Handoff",
    description: "Pause while the human operates the visible Playwright browser, then resume on confirmation",
    parameters: Type.Object({ message: Type.String({ description: "What the user should do in the browser" }) }),
    async execute(_id, { message }, _signal, _update, ctx) {
      return runtime.run(async () => {
        if (!ctx.hasUI) throw new Error("Browser handoff requires interactive Pi UI");
        await runtime.selectedPage();
        const confirmed = await ctx.ui.confirm("Your turn in the browser", `${message}\n\nChoose Yes when finished, No to cancel.`);
        if (confirmed) await runtime.saveProjectState();
        runtime.invalidateSnapshot();
        return { content: [{ type: "text", text: confirmed ? "User finished; continue in the visible browser" : "User cancelled browser handoff" }], details: { confirmed } };
      });
    },
  });

  const stopForLifecycle = async (ctx?: { hasUI: boolean; ui: { notify(message: string, level?: "info" | "warning" | "error"): void } }): Promise<void> => {
    try {
      await runtime.run(() => runtime.stop());
    } catch (error) {
      if (ctx?.hasUI) ctx.ui.notify(`Could not save browser authentication: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx?.cwd) runtime.setProjectDirectory(ctx.cwd);
    pi.setActiveTools(initializeBrowserTools(pi.getActiveTools()));
  });
  pi.on("agent_settled", (_event, ctx) => stopForLifecycle(ctx));
  pi.on("session_shutdown", (_event, ctx) => stopForLifecycle(ctx));
}
