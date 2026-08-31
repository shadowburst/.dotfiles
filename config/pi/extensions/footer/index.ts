import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type ReadonlyFooterDataProvider,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type FooterItem = { name: string; text: string };
type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};
type UsageLike = Omit<Partial<UsageTotals>, "cost"> & { cost?: number | { total?: number } };

const SEPARATOR = " │ ";
const USAGE_DROP_ORDER = ["cacheHitRate", "cacheWrite", "cacheRead", "cost", "output", "input", "context"];

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

function formatCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return cwd;

  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(home);
  const homeRelative = relative(resolvedHome, resolvedCwd);
  const insideHome = homeRelative === "" ||
    (homeRelative !== ".." && !homeRelative.startsWith(`..${sep}`) && !isAbsolute(homeRelative));
  if (!insideHome) return cwd;
  return homeRelative === "" ? "~" : `~${sep}${homeRelative}`;
}

function truncateLeft(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  if (width <= 0) return "";
  const ellipsis = "…";
  const ellipsisWidth = visibleWidth(ellipsis);
  if (ellipsisWidth >= width) return truncateToWidth(ellipsis, width, "");

  let remaining = width - ellipsisWidth;
  let suffix = "";
  for (const character of Array.from(text).reverse()) {
    const characterWidth = visibleWidth(character);
    if (characterWidth > remaining) break;
    suffix = character + suffix;
    remaining -= characterWidth;
  }
  return ellipsis + suffix;
}

function addUsage(totals: UsageTotals, usage: UsageLike | undefined): void {
  if (!usage) return;
  totals.input += usage.input ?? 0;
  totals.output += usage.output ?? 0;
  totals.cacheRead += usage.cacheRead ?? 0;
  totals.cacheWrite += usage.cacheWrite ?? 0;
  totals.cost += typeof usage.cost === "number" ? usage.cost : usage.cost?.total ?? 0;
}

function sessionUsage(ctx: ExtensionContext): { totals: UsageTotals; cacheHitRate?: number } {
  const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let cacheHitRate: number | undefined;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message") {
      const message = entry.message as { role?: string; usage?: UsageLike };
      if (message.role === "assistant" || message.role === "toolResult") {
        addUsage(totals, message.usage);
        if (message.role === "assistant" && message.usage) {
          const promptTokens = (message.usage.input ?? 0) + (message.usage.cacheRead ?? 0) + (message.usage.cacheWrite ?? 0);
          cacheHitRate = promptTokens > 0 ? ((message.usage.cacheRead ?? 0) / promptTokens) * 100 : undefined;
        }
      }
    } else if (entry.type === "branch_summary" || entry.type === "compaction") {
      addUsage(totals, (entry as { usage?: UsageLike }).usage);
    }
  }
  return { totals, cacheHitRate };
}

function itemWidth(items: FooterItem[]): number {
  return items.reduce((total, item, index) => total + visibleWidth(item.text) + (index ? visibleWidth(SEPARATOR) : 0), 0);
}

function joinItems(items: FooterItem[]): string {
  return items.map((item) => item.text).join(SEPARATOR);
}

function fitLeft(items: FooterItem[], width: number): FooterItem[] {
  let selected = [...items];
  if (itemWidth(selected) <= width) return selected;
  selected = selected.filter((item) => item.name !== "session");

  const fitPath = (candidate: FooterItem[]): FooterItem[] | undefined => {
    const path = candidate.find((item) => item.name === "cwd");
    if (!path) return undefined;
    const fixed = candidate.filter((item) => item.name !== "cwd");
    const availablePath = width - itemWidth(fixed) - (fixed.length ? visibleWidth(SEPARATOR) : 0);
    if (availablePath < 1) return undefined;
    return [{ ...path, text: truncateLeft(path.text, availablePath) }, ...fixed];
  };

  let fitted = fitPath(selected);
  if (fitted) return fitted;

  for (const name of USAGE_DROP_ORDER) {
    selected = selected.filter((item) => item.name !== name);
    fitted = fitPath(selected);
    if (fitted) return fitted;
  }

  // The path yields before a complete branch. A branch longer than the entire
  // available left side is omitted instead of being fragmented.
  selected = selected.filter((item) => item.name !== "cwd");
  const branch = selected.find((item) => item.name === "branch");
  if (branch && visibleWidth(branch.text) > width) {
    selected = selected.filter((item) => item.name !== "branch");
  }
  for (const name of USAGE_DROP_ORDER) {
    if (itemWidth(selected) <= width) break;
    selected = selected.filter((item) => item.name !== name);
  }
  return selected.filter((item) => itemWidth([item]) <= width);
}

function renderGroup(items: FooterItem[], theme: Theme, color: "dim" | "muted"): string {
  return items.map((item, index) => `${index ? theme.fg("border", SEPARATOR) : ""}${theme.fg(color, item.text)}`).join("");
}

function getAutoCompactionEnabled(ctx: ExtensionContext): boolean {
  try {
    return SettingsManager.create(ctx.cwd).getCompactionEnabled();
  } catch {
    return true;
  }
}

function footerComponent(
  ctx: ExtensionContext,
  tui: { requestRender(): void },
  theme: Theme,
  footerData: ReadonlyFooterDataProvider,
  getAutoCompactionEnabled: () => boolean,
) {
  const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

  return {
    render(width: number): string[] {
      if (width < 1) return [""];

      const { totals, cacheHitRate } = sessionUsage(ctx);
      const contextUsage = ctx.getContextUsage();
      const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
      const contextPercent = contextUsage?.percent === null ? "?" : `${(contextUsage?.percent ?? 0).toFixed(1)}%`;
      const autoCompactionEnabled = getAutoCompactionEnabled();
      const usingSubscription = ctx.model?.provider === "kimi-coding"
        || Boolean(ctx.model && ctx.modelRegistry.isUsingOAuth(ctx.model));

      const left: FooterItem[] = [{ name: "cwd", text: formatCwd(ctx.sessionManager.getCwd()) }];
      const branch = footerData.getGitBranch();
      if (branch) left.push({ name: "branch", text: branch });
      const sessionName = ctx.sessionManager.getSessionName();
      if (sessionName) left.push({ name: "session", text: sessionName });
      if (totals.input) left.push({ name: "input", text: `↑${formatTokens(totals.input)}` });
      if (totals.output) left.push({ name: "output", text: `↓${formatTokens(totals.output)}` });
      if (totals.cacheRead) left.push({ name: "cacheRead", text: `R${formatTokens(totals.cacheRead)}` });
      if (totals.cacheWrite) left.push({ name: "cacheWrite", text: `W${formatTokens(totals.cacheWrite)}` });
      if ((totals.cacheRead || totals.cacheWrite) && cacheHitRate !== undefined) {
        left.push({ name: "cacheHitRate", text: `CH${cacheHitRate.toFixed(1)}%` });
      }
      if (totals.cost || usingSubscription) {
        left.push({ name: "cost", text: `$${totals.cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}` });
      }
      left.push({ name: "context", text: `${contextPercent}/${formatTokens(contextWindow)}${autoCompactionEnabled ? " (auto)" : ""}` });

      const statuses = Array.from(footerData.getExtensionStatuses().values()).map((text) => ({ name: "status", text }));
      const right: FooterItem[] = [{ name: "model", text: ctx.model?.id || "no-model" }];
      if (ctx.model?.reasoning) right.push({ name: "thinking", text: ctx.thinkingLevel || "off" });

      let center = statuses;
      let fittedRight = right;
      while (center.length > 0) {
        const centerWidth = itemWidth(center);
        const centerStart = Math.floor((width - centerWidth) / 2);
        if (centerStart + centerWidth + 1 <= width - itemWidth(fittedRight)) break;
        center = center.slice(0, -1);
      }
      if (itemWidth(fittedRight) > width) fittedRight = right.slice(0, 1);
      if (itemWidth(fittedRight) > width) fittedRight = [{ name: "model", text: truncateLeft(fittedRight[0]!.text, width) }];

      const centerWidth = itemWidth(center);
      const centerStart = Math.floor((width - centerWidth) / 2);
      const leftWidth = center.length ? Math.max(0, centerStart - 1) : Math.max(0, width - itemWidth(fittedRight) - 1);
      let fittedLeft = fitLeft(left, leftWidth);
      if (itemWidth(fittedLeft) > leftWidth) fittedLeft = fitLeft(fittedLeft.filter((item) => item.name !== "cwd"), leftWidth);

      const leftText = renderGroup(fittedLeft, theme, "dim");
      const centerText = renderGroup(center, theme, "dim");
      const rightText = renderGroup(fittedRight, theme, "dim");
      const rawLeftWidth = visibleWidth(joinItems(fittedLeft));
      const rawCenterWidth = visibleWidth(joinItems(center));
      const rawRightWidth = visibleWidth(joinItems(fittedRight));
      const line = center.length
        ? `${leftText}${" ".repeat(Math.max(0, centerStart - rawLeftWidth))}${centerText}${" ".repeat(Math.max(0, width - rawRightWidth - centerStart - rawCenterWidth))}${rightText}`
        : `${leftText}${" ".repeat(Math.max(0, width - rawLeftWidth - rawRightWidth))}${rightText}`;
      return [truncateToWidth(line, width, "")];
    },
    invalidate(): void {},
    dispose(): void { unsubscribeBranch(); },
  };
}

export default function footerExtension(pi: ExtensionAPI): void {
  let requestRender: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setFooter((tui, theme, footerData) => {
      const requestFooterRender = () => tui.requestRender();
      requestRender = requestFooterRender;
      const component = footerComponent(ctx, tui, theme, footerData, () => getAutoCompactionEnabled(ctx));
      return {
        ...component,
        dispose(): void {
          component.dispose();
          if (requestRender === requestFooterRender) requestRender = undefined;
        },
      };
    });
  });

  pi.on("model_select", () => requestRender?.());
  pi.on("thinking_level_select", () => requestRender?.());
  pi.on("message_end", () => requestRender?.());
  pi.on("session_info_changed", () => requestRender?.());
  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setFooter(undefined);
    requestRender = undefined;
  });
}
