import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const WIDGET_ID = "pi-header";

const PI_HEADER = [
  "        ████████████████████████",
  "       ██████████████████████████",
  "             ██████      ██████ ",
  "             ██████      ██████",
  "             ██████      ██████",
  "             ██████      ██████",
  "             ██████      ██████",
  "            ██████      ██████",
  "           ██████      ███████",
  "         ███████        ████████",
];

function isFreshConversation(ctx: ExtensionContext): boolean {
  const entries = ctx.sessionManager.getEntries();

  return !entries.some((entry: any) => {
    if (entry.type === "message" || entry.type === "custom_message" || entry.type === "branch_summary" || entry.type === "compaction") {
      return true;
    }

    // Extension custom entries are explicitly non-context, but if some other extension has
    // already put durable state in this session, don't treat that as a conversation.
    return false;
  });
}

function renderCenteredHeader(width: number, color: (text: string) => string): string[] {
  const maxHeaderWidth = Math.max(...PI_HEADER.map((line) => visibleWidth(line)));
  const leftPad = width > maxHeaderWidth ? Math.floor((width - maxHeaderWidth) / 2) : 0;

  return [
    "",
    ...PI_HEADER.map((line) => {
      const padded = `${" ".repeat(leftPad)}${line}`;
      return color(truncateToWidth(padded, width, ""));
    }),
    "",
  ];
}

function clearHeader(ctx: ExtensionContext): void {
  if (ctx.hasUI) ctx.ui.setWidget(WIDGET_ID, undefined);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    if (!ctx.hasUI) return;

    if ((event.reason !== "startup" && event.reason !== "new") || !isFreshConversation(ctx)) {
      clearHeader(ctx);
      return;
    }

    // setWidget is deliberately used instead of a custom message: widgets never enter
    // the LLM context. This preserves the hard safety rule for the decorative header.
    ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
      render: (width: number) => renderCenteredHeader(width, (text) => theme.fg("accent", text)),
      invalidate: () => {},
    }));
  });

  pi.on("input", async (_event, ctx) => {
    clearHeader(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearHeader(ctx);
  });
}
