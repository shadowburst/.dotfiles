import { arch, platform, release } from "node:os";

import { readStoredCredential, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type TUI, visibleWidth } from "@earendil-works/pi-tui";

import {
  cycleIndex,
  maskEmail,
  parseCopilotUsagePayload,
  parseUsagePayload,
  resetCountdown,
  selectCopilotUsageWindow,
  selectUsageWindow,
  type UsageSnapshot,
  type UsageWindow,
} from "./state.ts";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user";
const JWT_CLAIM = "https://api.openai.com/auth";
const WIDGET_ID = "usage-current";

type ViewState =
  | { status: "idle" }
  | { status: "loading"; snapshot?: UsageSnapshot }
  | { status: "ready"; snapshot: UsageSnapshot }
  | { status: "error"; message: string };

interface ProviderTab {
  provider: string;
  label: string;
  load(ctx: ExtensionContext, signal: AbortSignal): Promise<UsageSnapshot>;
  selectWindow(snapshot: UsageSnapshot, modelId: string): UsageWindow | undefined;
}

function accountId(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    const value = payload?.[JWT_CLAIM]?.chatgpt_account_id;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function fetchCodexUsage(token: string, id: string, headers: Record<string, string | null> | undefined, signal: AbortSignal): Promise<UsageSnapshot> {
  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value !== null) requestHeaders.set(name, value);
  }
  requestHeaders.set("authorization", `Bearer ${token}`);
  requestHeaders.set("chatgpt-account-id", id);
  requestHeaders.set("originator", "pi");
  requestHeaders.set("user-agent", `pi (${platform()} ${release()}; ${arch()})`);
  requestHeaders.set("accept", "application/json");

  const response = await fetch(CODEX_USAGE_URL, { headers: requestHeaders, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
  if (!response.ok) throw new Error(`Codex usage request failed (${response.status})`);
  return parseUsagePayload(await response.json());
}

async function loadCodexUsage(ctx: ExtensionContext, signal: AbortSignal): Promise<UsageSnapshot> {
  const resolved = await ctx.modelRegistry.getProviderAuth("openai-codex");
  const token = resolved?.auth.apiKey;
  const id = token ? accountId(token) : undefined;
  if (!token || !id) throw new Error("Codex is not logged in. Run /login openai-codex.");
  return fetchCodexUsage(token, id, resolved.auth.headers, signal);
}

async function loadCopilotUsage(_ctx: ExtensionContext, signal: AbortSignal): Promise<UsageSnapshot> {
  const credential = readStoredCredential("github-copilot");
  if (credential?.type !== "oauth") {
    throw new Error("Copilot is not logged in with OAuth. Run /login github-copilot.");
  }
  if (typeof credential.enterpriseUrl === "string" && credential.enterpriseUrl) {
    throw new Error("Copilot usage supports github.com accounts only.");
  }

  const response = await fetch(COPILOT_USAGE_URL, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${credential.refresh}`,
      "user-agent": "GitHubCopilotChat/0.35.0",
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) throw new Error(`Copilot usage request failed (${response.status})`);
  return parseCopilotUsagePayload(await response.json());
}

const PROVIDER_TABS: ProviderTab[] = [
  {
    provider: "openai-codex",
    label: "Codex",
    load: loadCodexUsage,
    selectWindow: selectUsageWindow,
  },
  {
    provider: "github-copilot",
    label: "Copilot",
    load: loadCopilotUsage,
    selectWindow: selectCopilotUsageWindow,
  },
];

function providerTab(provider: string | undefined): ProviderTab | undefined {
  return PROVIDER_TABS.find((tab) => tab.provider === provider);
}

function snapshotFrom(state: ViewState): UsageSnapshot | undefined {
  return state.status === "ready" || state.status === "loading" ? state.snapshot : undefined;
}

class UsageStore {
  private readonly states = new Map<string, ViewState>();
  private readonly jobs = new Map<string, AbortController>();
  private readonly listeners = new Set<() => void>();

  get(tab: ProviderTab): ViewState {
    return this.states.get(tab.provider) ?? { status: "idle" };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  async refresh(tab: ProviderTab, ctx: ExtensionContext): Promise<void> {
    this.jobs.get(tab.provider)?.abort();
    const controller = new AbortController();
    this.jobs.set(tab.provider, controller);
    const snapshot = snapshotFrom(this.get(tab));
    this.states.set(tab.provider, { status: "loading", ...(snapshot ? { snapshot } : {}) });
    this.emit();

    try {
      const next = await tab.load(ctx, controller.signal);
      if (this.jobs.get(tab.provider) === controller) this.states.set(tab.provider, { status: "ready", snapshot: next });
    } catch (error) {
      if (this.jobs.get(tab.provider) === controller && !controller.signal.aborted) {
        this.states.set(tab.provider, { status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (this.jobs.get(tab.provider) === controller) {
      this.jobs.delete(tab.provider);
      this.emit();
    }
  }

  dispose(): void {
    for (const controller of this.jobs.values()) controller.abort();
    this.jobs.clear();
    this.listeners.clear();
  }
}

function resetText(window: UsageWindow): string {
  if (!window.resetsAt) return "reset time unavailable";
  const local = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(window.resetsAt * 1000));
  return `resets in ${resetCountdown(window)} · ${local}`;
}

function columns(left: string, right: string, width: number): string {
  const rightWidth = visibleWidth(right);
  const leftWidth = Math.max(0, width - rightWidth - 1);
  const fittedLeft = truncateToWidth(left, leftWidth, "…");
  return `${fittedLeft}${" ".repeat(Math.max(1, width - visibleWidth(fittedLeft) - rightWidth))}${right}`;
}

class UsageOverlay {
  private readonly clock: ReturnType<typeof setInterval>;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: () => void,
    private readonly ctx: ExtensionCommandContext,
    private readonly store: UsageStore,
    private tab: ProviderTab,
  ) {
    this.clock = setInterval(() => this.tui.requestRender(), 30_000);
    this.unsubscribe = this.store.subscribe(() => this.tui.requestRender());
    void this.store.refresh(this.tab, this.ctx);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
      this.done();
    } else if (matchesKey(data, "r")) {
      void this.store.refresh(this.tab, this.ctx);
    } else if (
      matchesKey(data, Key.shift("tab"))
      || matchesKey(data, Key.left)
      || matchesKey(data, "h")
    ) {
      this.switchTab(-1);
    } else if (
      matchesKey(data, Key.tab)
      || matchesKey(data, Key.right)
      || matchesKey(data, "l")
    ) {
      this.switchTab(1);
    }
  }

  private switchTab(offset: number): void {
    const index = cycleIndex(PROVIDER_TABS.indexOf(this.tab), PROVIDER_TABS.length, offset);
    this.tab = PROVIDER_TABS[index]!;
    void this.store.refresh(this.tab, this.ctx);
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const border = (value: string) => this.theme.fg("border", value);
    const line = (value = "") => `${border("│")}${truncateToWidth(value, innerWidth, "", true)}${border("│")}`;
    const lines: string[] = [];
    const state = this.store.get(this.tab);
    const snapshot = snapshotFrom(state);

    const title = " Usage limits ";
    const titleWidth = visibleWidth(title);
    const left = Math.max(0, Math.floor((innerWidth - titleWidth) / 2));
    lines.push(`${border(`╭${"─".repeat(left)}`)}${this.theme.fg("accent", this.theme.bold(title))}${border(`${"─".repeat(Math.max(0, innerWidth - left - titleWidth))}╮`)}`);
    const tabs = PROVIDER_TABS.map((tab) => tab === this.tab
      ? this.theme.bg("selectedBg", this.theme.fg("text", ` ${tab.label} `))
      : this.theme.fg("muted", ` ${tab.label} `));
    lines.push(line(` ${tabs.join(" ")}`));
    lines.push(`${border("├")}${border("─".repeat(innerWidth))}${border("┤")}`);

    if (snapshot) {
      const metadata = [snapshot.plan, snapshot.email ? maskEmail(snapshot.email) : undefined]
        .filter(Boolean)
        .join(" · ");
      if (metadata) lines.push(line(` ${this.theme.fg("muted", metadata)}`));
      if (snapshot.credits) lines.push(line(` ${this.theme.fg("muted", `Credits · ${snapshot.credits}`)}`));
      lines.push(line());
      if (snapshot.windows.length === 0) {
        lines.push(line(this.theme.fg("muted", " No percentage limits returned.")));
      } else {
        for (const window of snapshot.windows) {
          const remainingPercent = 100 - window.usedPercent;
          const color = remainingPercent <= 10 ? "error" : remainingPercent <= 30 ? "warning" : "accent";
          const percent = this.theme.fg(color, `${Math.round(remainingPercent)}% left`);
          lines.push(line(` ${columns(window.label, percent, Math.max(1, innerWidth - 2))} `));
          const barWidth = Math.max(1, innerWidth - 2);
          const filled = Math.round(barWidth * remainingPercent / 100);
          const bar = this.theme.fg(color, "█".repeat(filled)) + this.theme.fg("dim", "░".repeat(barWidth - filled));
          lines.push(line(` ${bar} `));
          lines.push(line(` ${this.theme.fg("dim", resetText(window))}`));
          lines.push(line());
        }
      }
    } else if (state.status === "error") {
      lines.push(line());
      lines.push(line(this.theme.fg("error", ` ${state.message}`)));
      lines.push(line(this.theme.fg("dim", " Press r to retry.")));
      lines.push(line());
    } else {
      lines.push(line());
      lines.push(line(this.theme.fg("muted", ` Loading ${this.tab.label} usage…`)));
      lines.push(line());
    }

    lines.push(line(this.theme.fg("dim", " Esc/q close · r refresh · Tab/⇧Tab/←→/h/l tabs")));
    lines.push(`${border("╰")}${border("─".repeat(innerWidth))}${border("╯")}`);
    return lines;
  }

  invalidate(): void {}

  dispose(): void {
    this.unsubscribe();
    clearInterval(this.clock);
  }
}

function usageWidget(width: number, theme: Theme, tab: ProviderTab, modelId: string, snapshot: UsageSnapshot): string[] {
  if (width < 1) return [];
  const window = tab.selectWindow(snapshot, modelId);
  if (!window) return [];

  const remainingPercent = 100 - window.usedPercent;
  const color = remainingPercent <= 10 ? "error" : remainingPercent <= 30 ? "warning" : "accent";
  const percent = `${Math.round(remainingPercent)}%`;
  const render = (countdown: string): string | undefined => {
    const separator = theme.fg("border", "│");
    const fixedWidth = visibleWidth(` ${tab.label} │  │ ${percent} │ ${countdown} `);
    const barWidth = width - fixedWidth;
    if (barWidth < 1) return undefined;
    const filled = Math.round(barWidth * remainingPercent / 100);
    const bar = theme.fg(color, "━".repeat(filled)) + theme.fg("dim", "─".repeat(barWidth - filled));
    return ` ${theme.fg("text", tab.label)} ${separator} ${bar} ${separator} ${theme.fg(color, percent)} ${separator} ${theme.fg("dim", countdown)} `;
  };

  const row = render(resetCountdown(window)) ?? render(resetCountdown(window, Date.now() / 1000, true));
  return row ? [row, theme.fg("border", "─".repeat(width))] : [];
}

async function showUsage(ctx: ExtensionCommandContext, store: UsageStore): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/usage is available in interactive mode", "warning");
    return;
  }

  const tab = providerTab(ctx.model?.provider) ?? PROVIDER_TABS[0];
  if (!tab) return;
  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) => new UsageOverlay(tui, theme, done, ctx, store, tab),
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "70%", minWidth: 50, maxHeight: "80%", margin: 1 },
    },
  );
}

export default function usageExtension(pi: ExtensionAPI): void {
  const store = new UsageStore();
  let activeProvider: string | undefined;
  let activeModel = "";
  let requestWidgetRender: (() => void) | undefined;
  let clock: ReturnType<typeof setInterval> | undefined;

  const refreshActive = (ctx: ExtensionContext): void => {
    const tab = providerTab(activeProvider);
    if (tab) void store.refresh(tab, ctx);
  };

  pi.on("session_start", (_event, ctx) => {
    activeProvider = ctx.model?.provider;
    activeModel = ctx.model?.id ?? "";
    if (ctx.mode !== "tui") return;

    ctx.ui.setWidget(WIDGET_ID, (tui, theme) => {
      const render = () => tui.requestRender();
      requestWidgetRender = render;
      const unsubscribe = store.subscribe(render);
      return {
        render(width: number): string[] {
          const tab = providerTab(activeProvider);
          const snapshot = tab ? snapshotFrom(store.get(tab)) : undefined;
          return tab && snapshot ? usageWidget(width, theme, tab, activeModel, snapshot) : [];
        },
        invalidate(): void {},
        dispose(): void {
          unsubscribe();
          if (requestWidgetRender === render) requestWidgetRender = undefined;
        },
      };
    }, { placement: "belowEditor" });
    clock = setInterval(() => requestWidgetRender?.(), 60_000);
    refreshActive(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    activeProvider = event.model.provider;
    activeModel = event.model.id;
    requestWidgetRender?.();
    refreshActive(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => refreshActive(ctx));

  pi.on("session_shutdown", (_event, ctx) => {
    if (clock) clearInterval(clock);
    clock = undefined;
    ctx.ui.setWidget(WIDGET_ID, undefined);
    store.dispose();
  });

  pi.registerCommand("usage", {
    description: "Show subscription usage limits",
    handler: async (_args, ctx) => showUsage(ctx, store),
  });
}
