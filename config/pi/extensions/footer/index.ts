import {
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type FooterItemKind =
  | "input"
  | "output"
  | "cacheRead"
  | "cacheWrite"
  | "cacheHitRate"
  | "cost"
  | "context"
  | "model"
  | "thinking";
type FooterItem = { kind: FooterItemKind; text: string };
type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};
type UsageLike = Omit<Partial<UsageTotals>, "cost"> & { cost?: number | { total?: number } };

const SEPARATOR = " │ ";
const USAGE_DROP_ORDER: FooterItemKind[] = ["cacheHitRate", "cacheWrite", "cacheRead", "cost", "output", "input", "context"];
const USAGE_ITEM_KINDS = new Set<FooterItemKind>(USAGE_DROP_ORDER);

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
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

function itemSeparator(items: FooterItem[], index: number): string {
  if (index === 0) return "";
  return USAGE_ITEM_KINDS.has(items[index - 1]!.kind) && USAGE_ITEM_KINDS.has(items[index]!.kind)
    ? " "
    : SEPARATOR;
}

function itemWidth(items: FooterItem[]): number {
  return items.reduce(
    (total, item, index) => total + visibleWidth(item.text) + visibleWidth(itemSeparator(items, index)),
    0,
  );
}

function joinItems(items: FooterItem[]): string {
  return items.map((item, index) => `${itemSeparator(items, index)}${item.text}`).join("");
}

function fitUsage(items: FooterItem[], width: number): FooterItem[] {
  let selected = [...items];
  for (const kind of USAGE_DROP_ORDER) {
    if (itemWidth(selected) <= width) break;
    selected = selected.filter((item) => item.kind !== kind);
  }
  return selected;
}

function renderGroup(items: FooterItem[], theme: Theme, color: "dim" | "muted"): string {
  return items.map((item, index) => {
    const separator = itemSeparator(items, index);
    const styledSeparator = separator === SEPARATOR ? theme.fg("border", separator) : separator;
    return `${styledSeparator}${theme.fg(color, item.text)}`;
  }).join("");
}

function getAutoCompactionEnabled(ctx: ExtensionContext): boolean | undefined {
  try {
    return SettingsManager.create(ctx.cwd).getCompactionEnabled();
  } catch {
    return undefined;
  }
}

function footerComponent(ctx: ExtensionContext, theme: Theme) {
  return {
    render(width: number): string[] {
      if (width < 1) return [""];

      const { totals, cacheHitRate } = sessionUsage(ctx);
      const contextUsage = ctx.getContextUsage();
      const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
      const contextPercent = contextUsage?.percent === null ? "?" : `${(contextUsage?.percent ?? 0).toFixed(1)}%`;
      const autoCompactionEnabled = getAutoCompactionEnabled(ctx);
      const provider = ctx.model ? ctx.modelRegistry.getProvider(ctx.model.provider) : undefined;
      const usingSubscription = ctx.model?.provider === "kimi-coding"
        || Boolean(
          ctx.model
          && ctx.modelRegistry.isUsingOAuth(ctx.model)
          && provider?.auth.oauth?.isSubscription === true,
        );

      const usage: FooterItem[] = [];
      if (totals.input) usage.push({ kind: "input", text: `↑${formatTokens(totals.input)}` });
      if (totals.output) usage.push({ kind: "output", text: `↓${formatTokens(totals.output)}` });
      if (totals.cacheRead) usage.push({ kind: "cacheRead", text: `R${formatTokens(totals.cacheRead)}` });
      if (totals.cacheWrite) usage.push({ kind: "cacheWrite", text: `W${formatTokens(totals.cacheWrite)}` });
      if ((totals.cacheRead || totals.cacheWrite) && cacheHitRate !== undefined) {
        usage.push({ kind: "cacheHitRate", text: `CH${cacheHitRate.toFixed(1)}%` });
      }
      if (totals.cost || usingSubscription) {
        usage.push({ kind: "cost", text: `$${totals.cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}` });
      }
      usage.push({
        kind: "context",
        text: `${contextPercent}/${formatTokens(contextWindow)}${autoCompactionEnabled === true ? " (auto)" : ""}`,
      });

      let model: FooterItem[] = [{ kind: "model", text: ctx.model?.id || "no-model" }];
      if (ctx.model?.reasoning) model.push({ kind: "thinking", text: ctx.thinkingLevel || "off" });
      if (itemWidth(model) > width) model = model.slice(0, 1);
      if (itemWidth(model) > width) model = [{ kind: "model", text: truncateLeft(model[0]!.text, width) }];

      const fittedUsage = fitUsage(usage, Math.max(0, width - itemWidth(model) - 1));
      const modelText = renderGroup(model, theme, "dim");
      const usageText = renderGroup(fittedUsage, theme, "dim");
      const modelWidth = visibleWidth(joinItems(model));
      const usageWidth = visibleWidth(joinItems(fittedUsage));
      const line = `${modelText}${" ".repeat(Math.max(0, width - modelWidth - usageWidth))}${usageText}`;
      return [truncateToWidth(line, width, "")];
    },
    invalidate(): void {},
  };
}

export default function footerExtension(pi: ExtensionAPI): void {
  let requestRender: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setFooter((tui, theme) => {
      const requestFooterRender = () => tui.requestRender();
      requestRender = requestFooterRender;
      const component = footerComponent(ctx, theme);
      return {
        ...component,
        dispose(): void {
          if (requestRender === requestFooterRender) requestRender = undefined;
        },
      };
    });
  });

  pi.on("model_select", () => requestRender?.());
  pi.on("thinking_level_select", () => requestRender?.());
  pi.on("message_end", () => requestRender?.());
  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setFooter(undefined);
    requestRender = undefined;
  });
}
