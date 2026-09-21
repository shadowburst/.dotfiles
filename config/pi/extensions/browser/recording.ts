import { access, mkdir, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  KnownDevices,
  type Page,
} from "puppeteer-core";

export const RECORDING_LIMIT_BYTES = 10 * 1024 * 1024;
export const RECORDING_KEEP = 10;
export const DEFAULT_DELAY_MS = 2_000;
export const VIEWPORTS = ["desktop", "mobile"] as const;
export type ViewportPreset = typeof VIEWPORTS[number];

export type DemonstrationEvent = {
  kind: "click" | "type" | "check" | "select" | "navigate";
  selector?: string;
  value?: string;
  checked?: boolean;
  url?: string;
  secret?: boolean;
  href?: string;
  at: number;
};

export type RecordingResult = {
  path: string;
  bytes: number;
  durationMs: number;
  viewport: ViewportPreset;
  result?: unknown;
  error?: string;
};

type ActionHelper = {
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, value: string): Promise<void>;
  check(selector: string, checked?: boolean): Promise<void>;
  select(selector: string, value: string): Promise<void>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function recordingDirectory(): string {
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "pi", "browser-recordings");
}

export function safeRecordingName(name?: string): string {
  if (!name) return `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}.webm`;
  const filename = name.endsWith(".webm") ? name : `${name}.webm`;
  if (basename(filename) !== filename || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.webm$/.test(filename)) {
    throw new Error("Recording name must be a plain .webm filename using letters, numbers, dots, dashes, or underscores");
  }
  return filename;
}

export async function pruneRecordings(directory: string, keep = RECORDING_KEEP): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".webm"))
    .map(async (entry) => ({
      path: join(directory, entry.name),
      mtimeMs: (await stat(join(directory, entry.name))).mtimeMs,
    })));
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  const removed = files.slice(keep).map((file) => file.path);
  await Promise.all(removed.map((path) => rm(path, { force: true })));
  return removed;
}

export async function applyViewport(page: Page, preset: ViewportPreset): Promise<void> {
  if (preset === "mobile") {
    await page.emulate(KnownDevices["iPhone 13"]);
    return;
  }
  await page.setUserAgent(await page.browser().userAgent());
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
}

async function targetCenter(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const element = await page.waitForSelector(selector, { visible: true, timeout: 5_000 });
  if (!element) throw new Error(`Element not found: ${selector}`);
  await element.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
  const box = await element.boundingBox();
  if (!box) throw new Error(`Element is not visible: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function moveCue(page: Page, point: { x: number; y: number }, preset: ViewportPreset): Promise<void> {
  await page.evaluate(async ({ x, y, mobile }) => {
    const id = "__pi-browser-action-cue";
    let cue = document.getElementById(id) as HTMLDivElement | null;
    if (!cue) {
      cue = document.createElement("div");
      cue.id = id;
      cue.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "z-index:2147483647",
        "pointer-events:none",
        "transition:transform 300ms ease-out",
        mobile
          ? "width:24px;height:24px;border:3px solid #89b4fa;border-radius:50%;background:#89b4fa55"
          : "width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:22px solid #89b4fa;filter:drop-shadow(0 1px 2px #000);transform-origin:top left",
      ].join(";");
      document.documentElement.append(cue);
    }
    cue.style.transform = `translate(${x}px, ${y}px)${mobile ? " translate(-50%, -50%)" : " rotate(-35deg)"}`;
    if (mobile) {
      cue.animate([
        { boxShadow: "0 0 0 0 #89b4faaa" },
        { boxShadow: "0 0 0 18px #89b4fa00" },
      ], { duration: 500 });
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }, { ...point, mobile: preset === "mobile" });
}

function actionHelper(page: Page, preset: ViewportPreset, delayMs: number, signal?: AbortSignal): ActionHelper {
  const pause = async () => {
    signal?.throwIfAborted();
    await sleep(delayMs);
    signal?.throwIfAborted();
  };
  const point = async (selector: string) => {
    const center = await targetCenter(page, selector);
    await moveCue(page, center, preset);
    await page.mouse.move(center.x, center.y);
    return center;
  };

  return {
    async goto(rawUrl) {
      const url = new URL(rawUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http: and https: URLs are allowed");
      await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await pause();
    },
    async click(selector) {
      const center = await point(selector);
      const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5_000 }).catch(() => null);
      await page.mouse.click(center.x, center.y);
      await Promise.race([navigation, sleep(250)]);
      await pause();
    },
    async type(selector, value) {
      const center = await point(selector);
      await page.mouse.click(center.x, center.y, { count: 3 });
      await page.keyboard.press("Backspace");
      await page.keyboard.type(value);
      await pause();
    },
    async check(selector, checked = true) {
      const element = await page.waitForSelector(selector, { visible: true, timeout: 5_000 });
      if (!element) throw new Error(`Element not found: ${selector}`);
      const current = await element.evaluate((node) => (node as HTMLInputElement).checked);
      if (current !== checked) {
        const center = await point(selector);
        await page.mouse.click(center.x, center.y);
      }
      await pause();
    },
    async select(selector, value) {
      await point(selector);
      const selected = await page.select(selector, value);
      if (!selected.includes(value)) throw new Error(`Could not select ${JSON.stringify(value)} in ${selector}`);
      await pause();
    },
  };
}

export async function recordScript(
  page: Page,
  script: string,
  options: { name?: string; viewport: ViewportPreset; delayMs: number; signal?: AbortSignal },
): Promise<RecordingResult> {
  const directory = recordingDirectory();
  await mkdir(directory, { recursive: true });
  const path = join(directory, safeRecordingName(options.name));
  try {
    await access(path, constants.F_OK);
    throw new Error(`Recording already exists: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await applyViewport(page, options.viewport);
  const started = Date.now();
  let result: unknown;
  let scriptError: unknown;
  let recorder;
  try {
    recorder = await page.screencast({
      path: path as `${string}.webm`,
      format: "webm",
      fps: 30,
      ffmpegPath: process.env.PI_BROWSER_FFMPEG || "ffmpeg",
    });
  } catch (error) {
    const bytes = (await stat(path).catch(() => ({ size: 0 }))).size;
    await rm(path, { force: true });
    return {
      path,
      bytes,
      durationMs: Date.now() - started,
      viewport: options.viewport,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  recorder.on("error", (error) => {
    scriptError ??= error;
  });
  try {
    await sleep(options.delayMs);
    options.signal?.throwIfAborted();
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;
    result = await new AsyncFunction("page", "act", script)(
      page,
      actionHelper(page, options.viewport, options.delayMs, options.signal),
    );
  } catch (error) {
    scriptError = error;
  } finally {
    await sleep(options.delayMs);
    try {
      await recorder.stop();
    } catch (error) {
      scriptError ??= error;
    }
  }

  const bytes = (await stat(path).catch(() => ({ size: 0 }))).size;
  if (scriptError) await rm(path, { force: true });
  await pruneRecordings(directory);
  const recording: RecordingResult = {
    path,
    bytes,
    durationMs: Date.now() - started,
    viewport: options.viewport,
    result,
    ...(scriptError ? { error: scriptError instanceof Error ? scriptError.message : String(scriptError) } : {}),
  };
  if (bytes > RECORDING_LIMIT_BYTES) {
    recording.error = `${recording.error ? `${recording.error}; ` : ""}recording exceeds 10 MB (${bytes} bytes)`;
  }
  return recording;
}

export function demonstrationScript(startUrl: string, events: DemonstrationEvent[]): string {
  const lines = [`await act.goto(${JSON.stringify(startUrl)});`];
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (event.kind === "navigate") {
      const previous = events[index - 1];
      if (previous?.kind === "click" && event.at - previous.at < 5_000) continue;
      if (event.url && event.url !== startUrl) lines.push(`await act.goto(${JSON.stringify(event.url)});`);
    } else if (event.kind === "click" && event.selector) {
      lines.push(`await act.click(${JSON.stringify(event.selector)});`);
    } else if (event.kind === "type" && event.selector) {
      const value = event.secret ? "<REPLACE_WITH_SECRET>" : (event.value ?? "");
      lines.push(`await act.type(${JSON.stringify(event.selector)}, ${JSON.stringify(value)});${event.secret ? " // Password value was not recorded." : ""}`);
    } else if (event.kind === "check" && event.selector) {
      lines.push(`await act.check(${JSON.stringify(event.selector)}, ${event.checked ?? true});`);
    } else if (event.kind === "select" && event.selector) {
      lines.push(`await act.select(${JSON.stringify(event.selector)}, ${JSON.stringify(event.value ?? "")});`);
    }
  }
  lines.push("return { url: page.url(), title: await page.title() };");
  return lines.join("\n");
}

function installDemonstrationRecorder(callbackName: string, message: string): void {
  const marker = "__piBrowserDemonstration";
  const existing = (window as unknown as Record<string, (() => void) | undefined>)[marker];
  existing?.();

  const send = (event: Record<string, unknown>) => {
    const callback = (window as unknown as Record<string, (value: unknown) => Promise<void>>)[callbackName];
    void callback(event);
  };
  const selectorFor = (element: Element): string => {
    const testId = element.getAttribute("data-testid");
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    if (element.id) {
      const selector = `#${CSS.escape(element.id)}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    const name = element.getAttribute("name");
    if (name) {
      const selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
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
  const isRecorder = (target: EventTarget | null) => target instanceof Node
    && Boolean((target as Element).parentElement?.closest?.("#__pi-browser-demonstration-banner"));
  const click = (event: MouseEvent) => {
    if (isRecorder(event.target) || !(event.target instanceof Element)) return;
    if (event.target.closest("label")) return;
    const element = event.target.closest("a,button,summary,[role=button],input") ?? event.target;
    if (element instanceof HTMLInputElement && !["button", "submit", "reset", "image"].includes(element.type)) return;
    send({ kind: "click", selector: selectorFor(element), href: element instanceof HTMLAnchorElement ? element.href : undefined });
  };
  const change = (event: Event) => {
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return;
    const selector = selectorFor(element);
    if (element instanceof HTMLSelectElement) send({ kind: "select", selector, value: element.value });
    else if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) send({ kind: "check", selector, checked: element.checked });
    else {
      const autocomplete = element.getAttribute("autocomplete") ?? "";
      const secret = element instanceof HTMLInputElement
        && (element.type === "password" || ["current-password", "new-password"].includes(autocomplete));
      send({ kind: "type", selector, value: secret ? undefined : element.value, secret });
    }
  };
  const addBanner = () => {
    if (document.getElementById("__pi-browser-demonstration-banner")) return;
    const banner = document.createElement("div");
    banner.id = "__pi-browser-demonstration-banner";
    banner.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1e1e2e;color:#cdd6f4;padding:10px 12px;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 12px #0008;display:flex;gap:8px;align-items:center";
    const label = document.createElement("span");
    label.textContent = message;
    const finish = document.createElement("button");
    finish.textContent = "Finish";
    finish.onclick = () => send({ kind: "finish" });
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.onclick = () => send({ kind: "cancel" });
    banner.append(label, finish, cancel);
    document.documentElement.append(banner);
  };
  const cleanup = () => {
    document.removeEventListener("click", click, true);
    document.removeEventListener("change", change, true);
    document.getElementById("__pi-browser-demonstration-banner")?.remove();
    delete (window as unknown as Record<string, unknown>)[marker];
  };
  (window as unknown as Record<string, () => void>)[marker] = cleanup;
  document.addEventListener("click", click, true);
  document.addEventListener("change", change, true);
  if (document.documentElement) addBanner();
  else document.addEventListener("DOMContentLoaded", addBanner, { once: true });
}

export async function demonstrate(
  page: Page,
  options: { message: string; viewport: ViewportPreset; signal?: AbortSignal },
): Promise<{ cancelled: boolean; script?: string; events: DemonstrationEvent[] }> {
  options.signal?.throwIfAborted();
  await applyViewport(page, options.viewport);
  if (/^https?:/.test(page.url())) await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  const startUrl = page.url();
  if (!/^https?:/.test(startUrl)) throw new Error("Navigate to an HTTP(S) page before recording a demonstration");

  const callbackName = `__piBrowserDemonstration_${randomUUID().replaceAll("-", "")}`;
  const events: DemonstrationEvent[] = [];
  let settle!: (cancelled: boolean) => void;
  const done = new Promise<boolean>((resolve) => { settle = resolve; });
  const abort = () => settle(true);
  const close = () => settle(true);
  const navigation = (frame: { parentFrame(): unknown; url(): string }) => {
    if (!frame.parentFrame() && /^https?:/.test(frame.url())) events.push({ kind: "navigate", url: frame.url(), at: Date.now() });
  };
  let exposed = false;
  let preload: { identifier: string } | undefined;
  let cancelled = true;

  try {
    await page.exposeFunction(callbackName, (raw: unknown) => {
      const event = raw as { kind?: string; selector?: string; value?: string; checked?: boolean; secret?: boolean; href?: string };
      if (event.kind === "finish") settle(false);
      else if (event.kind === "cancel") settle(true);
      else if (["click", "type", "check", "select"].includes(event.kind ?? "")) {
        events.push({ ...event, kind: event.kind as DemonstrationEvent["kind"], at: Date.now() });
      }
    });
    exposed = true;
    preload = await page.evaluateOnNewDocument(installDemonstrationRecorder, callbackName, options.message);
    await page.evaluate(installDemonstrationRecorder, callbackName, options.message);
    page.on("framenavigated", navigation);
    page.once("close", close);
    options.signal?.addEventListener("abort", abort, { once: true });
    options.signal?.throwIfAborted();
    cancelled = await done;
    options.signal?.throwIfAborted();
  } finally {
    options.signal?.removeEventListener("abort", abort);
    page.off("close", close);
    page.off("framenavigated", navigation);
    if (preload) await page.removeScriptToEvaluateOnNewDocument(preload.identifier).catch(() => undefined);
    if (exposed) await page.removeExposedFunction(callbackName).catch(() => undefined);
    if (!page.isClosed()) {
      await page.evaluate(() => {
        const cleanup = (window as unknown as Record<string, (() => void) | undefined>).__piBrowserDemonstration;
        cleanup?.();
      }).catch(() => undefined);
    }
  }
  return cancelled ? { cancelled, events } : { cancelled, events, script: demonstrationScript(startUrl, events) };
}
