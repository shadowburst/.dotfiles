import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, Text } from "@earendil-works/pi-tui";

const WIDGET = "prompt-stash";

export default function (pi: ExtensionAPI) {
  let stash: string | undefined;
  let restoreAfterSubmit = false;

  function setWidget(ctx: ExtensionContext, show: boolean) {
    if (!ctx.hasUI) return;
    ctx.ui.setWidget(
      WIDGET,
      show
        ? (_tui, theme) => new Text(theme.fg("muted", stash ?? ""), 1, 0)
        : undefined,
    );
  }

  function restore(ctx: ExtensionContext) {
    if (stash === undefined || !ctx.hasUI) return;
    ctx.ui.setEditorText(stash);
    stash = undefined;
    restoreAfterSubmit = false;
    setWidget(ctx, false);
  }

  function tryRestore(ctx: ExtensionContext) {
    try {
      if (stash !== undefined && restoreAfterSubmit && ctx.isIdle()) restore(ctx);
    } catch {
      // /reload invalidates this ctx; isIdle() throws if we still run after submit
    }
  }

  function toggle(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    const text = ctx.ui.getEditorText();
    if (!text) {
      restore(ctx);
      return;
    }
    stash = text;
    restoreAfterSubmit = false;
    ctx.ui.setEditorText("");
    setWidget(ctx, true);
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const previous = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor =
        previous?.(tui, theme, keybindings) ??
        new CustomEditor(tui, theme, keybindings);
      const handleInput = editor.handleInput.bind(editor);
      editor.handleInput = (data: string) => {
        if (matchesKey(data, "ctrl+s")) {
          toggle(ctx);
          return;
        }
        handleInput(data);
      };
      return new Proxy(editor, {
        set(target, prop, value) {
          if (prop === "onSubmit" && typeof value === "function") {
            return Reflect.set(target, prop, (text: string) => {
              if (stash !== undefined && text.trim()) restoreAfterSubmit = true;
              const result = value(text);
              void Promise.resolve(result).then(() => tryRestore(ctx));
              return result;
            });
          }
          return Reflect.set(target, prop, value);
        },
      });
    });
  });

  pi.on("before_agent_start", () => {
    if (stash !== undefined) restoreAfterSubmit = true;
  });

  pi.on("agent_settled", (_event, ctx) => {
    tryRestore(ctx);
  });
}
