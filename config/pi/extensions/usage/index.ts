import { arch, platform, release } from "node:os";

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type TUI, visibleWidth } from "@earendil-works/pi-tui";

import { maskEmail, parseUsagePayload, type UsageSnapshot, type UsageWindow } from "./state.ts";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const JWT_CLAIM = "https://api.openai.com/auth";

type ViewState =
  | { status: "loading" }
  | { status: "ready"; snapshot: UsageSnapshot }
  | { status: "error"; message: string };

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

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round(timestamp - Date.now() / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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
  return `resets in ${relativeTime(window.resetsAt)} · ${local}`;
}

function columns(left: string, right: string, width: number): string {
  const rightWidth = visibleWidth(right);
  const leftWidth = Math.max(0, width - rightWidth - 1);
  const fittedLeft = truncateToWidth(left, leftWidth, "…");
  return `${fittedLeft}${" ".repeat(Math.max(1, width - visibleWidth(fittedLeft) - rightWidth))}${right}`;
}

class UsageOverlay {
  private state: ViewState = { status: "loading" };
  private controller?: AbortController;
  private generation = 0;
  private disposed = false;
  private clock: ReturnType<typeof setInterval>;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: () => void,
    private readonly load: (signal: AbortSignal) => Promise<UsageSnapshot>,
  ) {
    this.clock = setInterval(() => this.tui.requestRender(), 30_000);
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    this.controller?.abort();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.state = { status: "loading" };
    this.tui.requestRender();
    try {
      const snapshot = await this.load(controller.signal);
      if (!this.disposed && generation === this.generation) this.state = { status: "ready", snapshot };
    } catch (error) {
      if (!this.disposed && generation === this.generation && !controller.signal.aborted) {
        this.state = { status: "error", message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (!this.disposed && generation === this.generation) this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
      this.done();
    } else if (matchesKey(data, "r")) {
      void this.refresh();
    } else if (
      matchesKey(data, Key.tab)
      || matchesKey(data, Key.shift("tab"))
      || matchesKey(data, Key.left)
      || matchesKey(data, Key.right)
      || matchesKey(data, "h")
      || matchesKey(data, "l")
    ) {
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const border = (value: string) => this.theme.fg("border", value);
    const line = (value = "") => `${border("│")}${truncateToWidth(value, innerWidth, "", true)}${border("│")}`;
    const lines: string[] = [];

    const title = " Usage limits ";
    const titleWidth = visibleWidth(title);
    const left = Math.max(0, Math.floor((innerWidth - titleWidth) / 2));
    lines.push(`${border(`╭${"─".repeat(left)}`)}${this.theme.fg("accent", this.theme.bold(title))}${border(`${"─".repeat(Math.max(0, innerWidth - left - titleWidth))}╮`)}`);
    lines.push(line(` ${this.theme.bg("selectedBg", this.theme.fg("text", " Codex "))}`));
    lines.push(`${border("├")}${border("─".repeat(innerWidth))}${border("┤")}`);

    if (this.state.status === "loading") {
      lines.push(line());
      lines.push(line(this.theme.fg("muted", " Loading Codex usage…")));
      lines.push(line());
    } else if (this.state.status === "error") {
      lines.push(line());
      lines.push(line(this.theme.fg("error", ` ${this.state.message}`)));
      lines.push(line(this.theme.fg("dim", " Press r to retry.")));
      lines.push(line());
    } else {
      const { snapshot } = this.state;
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
    }

    lines.push(line(this.theme.fg("dim", " Esc/q close · r refresh · Tab/⇧Tab/←→/h/l tabs")));
    lines.push(`${border("╰")}${border("─".repeat(innerWidth))}${border("╯")}`);
    return lines;
  }

  invalidate(): void {}

  dispose(): void {
    this.disposed = true;
    this.controller?.abort();
    clearInterval(this.clock);
  }
}

async function showUsage(ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/usage is available in interactive mode", "warning");
    return;
  }

  const resolved = await ctx.modelRegistry.getProviderAuth("openai-codex");
  const token = resolved?.auth.apiKey;
  const id = token ? accountId(token) : undefined;
  if (!token || !id) {
    ctx.ui.notify("Codex is not logged in. Run /login openai-codex.", "warning");
    return;
  }

  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) => new UsageOverlay(
      tui,
      theme,
      done,
      (signal) => fetchCodexUsage(token, id, resolved.auth.headers, signal),
    ),
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "70%", minWidth: 50, maxHeight: "80%", margin: 1 },
    },
  );
}

export default function usageExtension(pi: ExtensionAPI): void {
  pi.registerCommand("usage", {
    description: "Show subscription usage limits",
    handler: async (_args, ctx) => showUsage(ctx),
  });
}
