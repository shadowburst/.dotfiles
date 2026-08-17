import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import puppeteer, {
  type Browser,
  type ConsoleMessage,
  type HTTPRequest,
  type Page,
} from "puppeteer-core";

import {
  activateBrowserTools,
  appendBounded,
  BROWSER_TOOL_NAMES,
  clearEvents,
  initializeBrowserTools,
  selectEvents,
  type BrowserEvent,
} from "./state.ts";

const EVENT_LIMIT = 200;
const DEFAULT_RESULT_LIMIT = 50;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SELECTOR_TIMEOUT_MS = 5_000;
const WINDOW_CLASS = "pi-browser-tools";

type ConsoleEvent = BrowserEvent & {
  kind: "console" | "error";
  level: string;
  text: string;
  url: string;
  line?: number;
  column?: number;
};

type NetworkEvent = BrowserEvent & {
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  durationMs: number;
  failed?: boolean;
  errorText?: string;
};

function targetId(page: Page): string {
  return (page.target() as unknown as { _targetId: string })._targetId;
}

function validateUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http: and https: URLs are allowed");
  }
  return url.href;
}

async function findBrave(): Promise<string> {
  const configured = process.env.BROWSER || "brave";
  const candidates = isAbsolute(configured)
    ? [configured]
    : (process.env.PATH ?? "").split(":").map((directory) => join(directory, configured));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(`Brave executable not found: ${configured}`);
}

async function jsonOutput(value: unknown, prefix: string): Promise<string> {
  const full = JSON.stringify(value, null, 2) ?? "undefined";
  const truncated = truncateHead(full, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!truncated.truncated) return truncated.content;

  const path = join(tmpdir(), `${prefix}-${randomUUID()}.json`);
  await writeFile(path, full);
  return `${truncated.content}\n\n[Output truncated: ${truncated.outputLines} of ${truncated.totalLines} lines (${formatSize(truncated.outputBytes)} of ${formatSize(truncated.totalBytes)}). Full output saved to: ${path}]`;
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void | Promise<void>,
): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();

  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      Promise.resolve(onAbort()).catch(() => undefined);
      reject(signal.reason ?? new Error("Cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

class BrowserRuntime {
  private browser?: Browser;
  private profileDir?: string;
  private selectedTargetId?: string;
  private consoleEvents: ConsoleEvent[] = [];
  private networkEvents: NetworkEvent[] = [];
  private requestStarted = new Map<HTTPRequest, number>();
  private attachedPages = new WeakSet<Page>();
  private queue: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async start(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.profileDir) await rm(this.profileDir, { recursive: true, force: true });
    this.browser = undefined;
    this.profileDir = undefined;

    const profileDir = await mkdtemp(join(tmpdir(), "pi-browser-"));
    try {
      const browser = await puppeteer.launch({
        executablePath: await findBrave(),
        headless: false,
        userDataDir: profileDir,
        args: [
          `--class=${WINDOW_CLASS}`,
          "--disable-default-apps",
          "--no-default-browser-check",
          "--no-first-run",
        ],
      });
      this.browser = browser;
      this.profileDir = profileDir;
      browser.on("targetcreated", (target) => {
        void target.page().then((page) => {
          if (page) this.attach(page);
        });
      });
      for (const page of await browser.pages()) this.attach(page);
      return browser;
    } catch (error) {
      await rm(profileDir, { recursive: true, force: true });
      throw error;
    }
  }

  private attach(page: Page): void {
    if (this.attachedPages.has(page)) return;
    this.attachedPages.add(page);

    page.on("console", (message) => this.captureConsole(page, message));
    page.on("pageerror", (error) => {
      this.consoleEvents = appendBounded(this.consoleEvents, {
        targetId: targetId(page),
        timestamp: new Date().toISOString(),
        kind: "error",
        level: "error",
        text: error instanceof Error ? error.message : String(error),
        url: page.url(),
      }, EVENT_LIMIT);
    });
    page.on("request", (request) => this.requestStarted.set(request, Date.now()));
    page.on("response", (response) => {
      const request = response.request();
      this.captureNetwork(page, request, {
        status: response.status(),
        statusText: response.statusText(),
      });
    });
    page.on("requestfailed", (request) => {
      this.captureNetwork(page, request, {
        failed: true,
        errorText: request.failure()?.errorText ?? "Request failed",
      });
    });
  }

  private captureConsole(page: Page, message: ConsoleMessage): void {
    const location = message.location();
    this.consoleEvents = appendBounded(this.consoleEvents, {
      targetId: targetId(page),
      timestamp: new Date().toISOString(),
      kind: "console",
      level: message.type(),
      text: message.text(),
      url: location.url || page.url(),
      ...(location.lineNumber === undefined ? {} : { line: location.lineNumber }),
      ...(location.columnNumber === undefined ? {} : { column: location.columnNumber }),
    }, EVENT_LIMIT);
  }

  private captureNetwork(
    page: Page,
    request: HTTPRequest,
    result: Pick<NetworkEvent, "status" | "statusText" | "failed" | "errorText">,
  ): void {
    const started = this.requestStarted.get(request) ?? Date.now();
    this.requestStarted.delete(request);
    this.networkEvents = appendBounded(this.networkEvents, {
      targetId: targetId(page),
      timestamp: new Date().toISOString(),
      method: request.method(),
      url: request.url(),
      durationMs: Date.now() - started,
      ...result,
    }, EVENT_LIMIT);
  }

  private async selectedPage(): Promise<Page> {
    const browser = await this.start();
    const pages = await browser.pages();
    let page = pages.find((candidate) => targetId(candidate) === this.selectedTargetId);
    page ??= pages.at(-1);
    page ??= await browser.newPage();
    this.attach(page);
    this.selectedTargetId = targetId(page);
    return page;
  }

  async navigate(rawUrl: string): Promise<Record<string, unknown>> {
    const page = await this.selectedPage();
    const url = validateUrl(rawUrl);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    return {
      targetId: targetId(page),
      title: await page.title(),
      url: page.url(),
      status: response?.status(),
    };
  }

  async evaluate(code: string): Promise<unknown> {
    const page = await this.selectedPage();
    return page.evaluate((source) => {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      return new AsyncFunction(`return (${source})`)();
    }, code);
  }

  async screenshot(fullPage: boolean): Promise<{ path: string; data: string; targetId: string }> {
    const page = await this.selectedPage();
    const path = join(tmpdir(), `browser-screenshot-${randomUUID()}.png`);
    const bytes = await page.screenshot({ path, fullPage, type: "png" });
    return { path, data: Buffer.from(bytes).toString("base64"), targetId: targetId(page) };
  }

  async input(action: "click" | "type" | "press", selector: string, value?: string): Promise<string> {
    const page = await this.selectedPage();
    const element = await page.waitForSelector(selector, {
      timeout: SELECTOR_TIMEOUT_MS,
      visible: true,
    });
    if (!element) throw new Error(`Element not found: ${selector}`);

    if (action === "click" || action === "type") {
      await element.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
      const box = await element.boundingBox();
      if (!box) throw new Error(`Element is not clickable: ${selector}`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
        count: action === "type" ? 3 : 1,
      });
    }
    if (action === "type") {
      if (value === undefined) throw new Error("browser_input type requires value");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(value);
    } else if (action === "press") {
      if (!value) throw new Error("browser_input press requires a key value");
      await element.focus();
      await page.keyboard.press(value as never);
    }
    return `${action} on ${selector}`;
  }

  async pick(message: string, signal?: AbortSignal): Promise<unknown> {
    const page = await this.selectedPage();
    const picking = page.evaluate((prompt) => new Promise<unknown>((resolve) => {
      const root = document.documentElement;
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none";
      const highlight = document.createElement("div");
      highlight.style.cssText = "position:fixed;border:2px solid #89b4fa;background:#89b4fa22;pointer-events:none";
      overlay.append(highlight);

      const banner = document.createElement("div");
      banner.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1e1e2e;color:#cdd6f4;padding:12px 18px;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 12px #0008";
      const selected: Element[] = [];
      const outlines = new Map<HTMLElement, string>();

      const selectorFor = (element: Element): string => {
        if (element === root) return "html";
        if (element.id) {
          const selector = `#${CSS.escape(element.id)}`;
          if (document.querySelectorAll(selector).length === 1) return selector;
        }
        const parts: string[] = [];
        let current: Element | null = element;
        while (current && current !== root) {
          let part = current.tagName.toLowerCase();
          const siblings = current.parentElement
            ? [...current.parentElement.children].filter((child) => child.tagName === current!.tagName)
            : [];
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          parts.unshift(part);
          const selector = parts.join(" > ");
          if (document.querySelectorAll(selector).length === 1) return selector;
          current = current.parentElement;
        }
        return parts.join(" > ");
      };

      const info = (element: Element) => ({
        selector: selectorFor(element),
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim().slice(0, 200) || undefined,
        attributes: Object.fromEntries(["type", "name", "role", "aria-label", "href"]
          .map((name) => [name, element.getAttribute(name)])
          .filter(([, value]) => value !== null)),
      });
      const updateBanner = () => {
        banner.textContent = `${prompt} (${selected.length} selected; Ctrl-click adds, Enter finishes, Esc cancels)`;
      };
      const cleanup = () => {
        document.removeEventListener("mousemove", move, true);
        document.removeEventListener("click", click, true);
        document.removeEventListener("keydown", key, true);
        for (const [element, outline] of outlines) element.style.outline = outline;
        overlay.remove();
        banner.remove();
        delete (window as unknown as { __piBrowserCancelPicker?: () => void }).__piBrowserCancelPicker;
      };
      const finish = (value: unknown) => {
        cleanup();
        resolve(value);
      };
      const move = (event: MouseEvent) => {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element || element === banner) return;
        const rect = element.getBoundingClientRect();
        highlight.style.cssText = `position:fixed;border:2px solid #89b4fa;background:#89b4fa22;pointer-events:none;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px`;
      };
      const click = (event: MouseEvent) => {
        if (event.target === banner) return;
        event.preventDefault();
        event.stopPropagation();
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element || element === banner) return;
        if (event.ctrlKey || event.metaKey) {
          if (!selected.includes(element)) {
            selected.push(element);
            const html = element as HTMLElement;
            outlines.set(html, html.style.outline);
            html.style.outline = "3px solid #a6e3a1";
            updateBanner();
          }
        } else {
          finish(selected.length ? selected.map(info) : info(element));
        }
      };
      const key = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(null);
        }
        if (event.key === "Enter" && selected.length) {
          event.preventDefault();
          event.stopPropagation();
          finish(selected.map(info));
        }
      };

      (window as unknown as { __piBrowserCancelPicker?: () => void }).__piBrowserCancelPicker = () => finish(null);
      updateBanner();
      document.body.append(banner, overlay);
      document.addEventListener("mousemove", move, true);
      document.addEventListener("click", click, true);
      document.addEventListener("keydown", key, true);
    }), message);

    return withAbort(picking, signal, () => page.evaluate(() => {
      (window as unknown as { __piBrowserCancelPicker?: () => void }).__piBrowserCancelPicker?.();
    }));
  }

  async tabs(
    action: "list" | "create" | "select" | "close",
    id?: string,
    rawUrl?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const browser = await this.start();
    if (action === "list" || (action === "close" && !id)) await this.selectedPage();
    if (action === "create") {
      const page = await browser.newPage();
      this.attach(page);
      this.selectedTargetId = targetId(page);
      if (rawUrl) await page.goto(validateUrl(rawUrl), {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await page.bringToFront();
    } else if (action === "select") {
      if (!id) throw new Error("browser_tabs select requires targetId");
      const page = (await browser.pages()).find((candidate) => targetId(candidate) === id);
      if (!page) throw new Error(`Unknown tab: ${id}`);
      this.selectedTargetId = id;
      await page.bringToFront();
    } else if (action === "close") {
      const closeId = id ?? this.selectedTargetId;
      if (!closeId) throw new Error("No tab selected");
      const page = (await browser.pages()).find((candidate) => targetId(candidate) === closeId);
      if (!page) throw new Error(`Unknown tab: ${closeId}`);
      await page.close();
      if (this.selectedTargetId === closeId) this.selectedTargetId = undefined;
      await (await this.selectedPage()).bringToFront();
    }

    return Promise.all((await browser.pages()).map(async (page) => ({
      targetId: targetId(page),
      selected: targetId(page) === this.selectedTargetId,
      title: await page.title(),
      url: page.url(),
    })));
  }

  async observe(options: {
    kind: "console" | "network";
    allTabs?: boolean;
    query?: string;
    limit?: number;
    clear?: boolean;
  }): Promise<BrowserEvent[]> {
    const page = await this.selectedPage();
    const selectedId = options.allTabs ? undefined : targetId(page);
    const filter = {
      targetId: selectedId,
      query: options.query,
      limit: options.limit ?? DEFAULT_RESULT_LIMIT,
    };
    const events: BrowserEvent[] = options.kind === "console"
      ? selectEvents(this.consoleEvents, filter)
      : selectEvents(this.networkEvents, filter);
    if (options.clear) {
      if (options.kind === "console") this.consoleEvents = clearEvents(this.consoleEvents, selectedId);
      else this.networkEvents = clearEvents(this.networkEvents, selectedId);
    }
    return events;
  }

  async stop(): Promise<void> {
    const browser = this.browser;
    const profileDir = this.profileDir;
    this.browser = undefined;
    this.profileDir = undefined;
    this.selectedTargetId = undefined;
    this.consoleEvents = [];
    this.networkEvents = [];
    this.requestStarted.clear();
    this.attachedPages = new WeakSet();
    try {
      await browser?.close();
    } finally {
      if (profileDir) await rm(profileDir, { recursive: true, force: true });
    }
  }
}

export default function browserTools(pi: ExtensionAPI) {
  const runtime = new BrowserRuntime();

  pi.registerTool({
    name: "browser_tools",
    label: "Browser Tools",
    description: "Activate one or more registered browser tools by exact name",
    promptSnippet: "Activate browser capabilities by exact tool name",
    promptGuidelines: [
      "Use browser_tools to activate the browser capabilities needed for a browser task.",
    ],
    parameters: Type.Object({
      tools: Type.Array(StringEnum(BROWSER_TOOL_NAMES), {
        minItems: 1,
        uniqueItems: true,
        description: "Browser tools to activate",
      }),
    }),
    async execute(_id, { tools }) {
      const result = activateBrowserTools(pi.getActiveTools(), tools);
      pi.setActiveTools(result.active);
      return {
        content: [{
          type: "text",
          text: [
            result.loaded.length ? `Loaded: ${result.loaded.join(", ")}` : "Loaded: none",
            result.alreadyActive.length
              ? `Already active: ${result.alreadyActive.join(", ")}`
              : "Already active: none",
          ].join("\n"),
        }],
        details: { loaded: result.loaded, alreadyActive: result.alreadyActive },
      };
    },
  });

  pi.registerTool({
    name: "browser_navigate",
    label: "Browser Navigate",
    description: "Navigate the selected browser tab to an HTTP(S) URL and wait up to 30 seconds for DOMContentLoaded",
    parameters: Type.Object({ url: Type.String({ description: "HTTP(S) URL" }) }),
    async execute(_id, { url }) {
      const result = await runtime.run(() => runtime.navigate(url));
      return { content: [{ type: "text", text: await jsonOutput(result, "browser-navigate") }], details: result };
    },
  });

  pi.registerTool({
    name: "browser_evaluate",
    label: "Browser Evaluate",
    description: "Evaluate one async JavaScript expression in the selected tab and return its serializable value; output is limited to 50KB or 2000 lines",
    parameters: Type.Object({ code: Type.String({ description: "JavaScript expression; wrap statements in an async IIFE" }) }),
    async execute(_id, { code }) {
      const result = await runtime.run(() => runtime.evaluate(code));
      return { content: [{ type: "text", text: await jsonOutput(result, "browser-evaluate") }], details: { result } };
    },
  });

  pi.registerTool({
    name: "browser_screenshot",
    label: "Browser Screenshot",
    description: "Capture the selected tab as an inline PNG and save the same image to a temporary path",
    parameters: Type.Object({ fullPage: Type.Optional(Type.Boolean({ description: "Capture the full page instead of the viewport" })) }),
    async execute(_id, { fullPage }) {
      const screenshot = await runtime.run(() => runtime.screenshot(fullPage ?? false));
      return {
        content: [
          { type: "text", text: `Screenshot saved to ${screenshot.path}` },
          { type: "image", data: screenshot.data, mimeType: "image/png" },
        ],
        details: { path: screenshot.path, targetId: screenshot.targetId },
      };
    },
  });

  pi.registerTool({
    name: "browser_pick",
    label: "Browser Pick",
    description: "Ask the user to select elements in the visible selected tab; Ctrl-click adds, Enter finishes, and Esc cancels",
    parameters: Type.Object({ message: Type.String({ description: "Instruction shown in the browser" }) }),
    async execute(_id, { message }, signal) {
      const result = await runtime.run(() => runtime.pick(message, signal));
      return { content: [{ type: "text", text: await jsonOutput(result, "browser-pick") }], details: { result } };
    },
  });

  pi.registerTool({
    name: "browser_input",
    label: "Browser Input",
    description: "Click, replace text in, or press a key on a visible element selected by CSS selector",
    parameters: Type.Object({
      action: StringEnum(["click", "type", "press"] as const),
      selector: Type.String({ description: "CSS selector" }),
      value: Type.Optional(Type.String({ description: "Text for type, or key name for press" })),
    }),
    async execute(_id, { action, selector, value }) {
      const result = await runtime.run(() => runtime.input(action, selector, value));
      return { content: [{ type: "text", text: result }], details: { action, selector } };
    },
  });

  pi.registerTool({
    name: "browser_observe",
    label: "Browser Observe",
    description: "Read bounded console/runtime errors or network request summaries; excludes bodies, headers, HAR, and interception",
    parameters: Type.Object({
      kind: StringEnum(["console", "network"] as const),
      allTabs: Type.Optional(Type.Boolean({ description: "Include every tab instead of only the selected tab" })),
      query: Type.Optional(Type.String({ description: "Case-insensitive text filter" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: EVENT_LIMIT, description: "Newest events to return" })),
      clear: Type.Optional(Type.Boolean({ description: "Clear the selected event log after reading it" })),
    }),
    async execute(_id, options) {
      const events = await runtime.run(() => runtime.observe(options));
      return { content: [{ type: "text", text: await jsonOutput(events, "browser-observe") }], details: { events } };
    },
  });

  pi.registerTool({
    name: "browser_tabs",
    label: "Browser Tabs",
    description: "List, create, select, or close automation tabs; all page tools operate on the selected tab",
    parameters: Type.Object({
      action: StringEnum(["list", "create", "select", "close"] as const),
      targetId: Type.Optional(Type.String({ description: "Target for select or close; close defaults to selected" })),
      url: Type.Optional(Type.String({ description: "Optional HTTP(S) URL when creating a tab" })),
    }),
    async execute(_id, { action, targetId: id, url }) {
      const tabs = await runtime.run(() => runtime.tabs(action, id, url));
      return { content: [{ type: "text", text: await jsonOutput(tabs, "browser-tabs") }], details: { tabs } };
    },
  });

  pi.on("session_start", () => {
    pi.setActiveTools(initializeBrowserTools(pi.getActiveTools()));
  });
  pi.on("agent_settled", () => runtime.run(() => runtime.stop()));
  pi.on("session_shutdown", () => runtime.run(() => runtime.stop()));
}
