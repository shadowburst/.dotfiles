import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  Text,
  type EditorTheme,
  type TUI,
} from "@earendil-works/pi-tui";
import { renderPrompt, skillAutocomplete } from "./editor.ts";

type KeybindingsManager = ConstructorParameters<typeof CustomEditor>[2];

const PI_FOCUS_AWARE_VAR = "PI_FOCUS_AWARE";
const KITTY_SET_PI_FOCUS_AWARE = `\x1b]1337;SetUserVar=${PI_FOCUS_AWARE_VAR}=MQ==\x07`;
const KITTY_CLEAR_PI_FOCUS_AWARE = `\x1b]1337;SetUserVar=${PI_FOCUS_AWARE_VAR}\x07`;
const PI_FOCUS_IN = "\x1bPpi-focus=1\x1b\\";
const PI_FOCUS_OUT = "\x1bPpi-focus=0\x1b\\";
const FOCUS_SEQUENCES = [PI_FOCUS_IN, PI_FOCUS_OUT] as const;

function isPartialFocusSequence(text: string): boolean {
  return FOCUS_SEQUENCES.some((sequence) => sequence.startsWith(text));
}

class PromptEditor extends CustomEditor {
  private kittyFocused = true;
  private pendingFocusInput = "";

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly pi: ExtensionAPI,
    private readonly getTheme: () => Parameters<typeof renderPrompt>[2],
    private readonly toggleStash: () => void,
  ) {
    super(tui, theme, keybindings, { paddingX: 1 });
  }

  handleInput(data: string): void {
    if (matchesKey(data, "ctrl+s")) {
      this.toggleStash();
      return;
    }
    let input = this.pendingFocusInput + data;
    this.pendingFocusInput = "";
    let handledFocus = false;

    for (;;) {
      const inIndex = input.indexOf(PI_FOCUS_IN);
      const outIndex = input.indexOf(PI_FOCUS_OUT);
      const indexes = [inIndex, outIndex].filter((index) => index >= 0);

      if (indexes.length === 0) {
        break;
      }

      const index = Math.min(...indexes);
      const sequence = input.startsWith(PI_FOCUS_IN, index)
        ? PI_FOCUS_IN
        : PI_FOCUS_OUT;
      const before = input.slice(0, index);
      if (before) {
        super.handleInput(before);
      }

      this.kittyFocused = sequence === PI_FOCUS_IN;
      handledFocus = true;
      input = input.slice(index + sequence.length);
    }

    if (input && isPartialFocusSequence(input)) {
      this.pendingFocusInput = input;
      input = "";
    }

    if (input) {
      super.handleInput(input);
    }

    if (handledFocus) {
      this.focused = this.kittyFocused;
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    this.focused = this.focused && this.kittyFocused;
    return renderPrompt(super.render(width), () => this.pi.getCommands(), this.getTheme(),
      !!this.getExpandedText().trim() && !this.isShowingAutocomplete());
  }
}

export default function (pi: ExtensionAPI) {
  let stash: string | undefined;
  let restoreAfterSubmit = false;

  function setWidget(ctx: ExtensionContext, show: boolean) {
    ctx.ui.setWidget("prompt-stash", show
      ? (_tui, theme) => new Text(theme.fg("muted", stash ?? ""), 1, 0)
      : undefined);
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
    if (process.stdout.isTTY) process.stdout.write(KITTY_SET_PI_FOCUS_AWARE);
    ctx.ui.addAutocompleteProvider((current) => skillAutocomplete(current, () => pi.getCommands()));
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new PromptEditor(tui, theme, keybindings, pi, () => ctx.ui.theme, () => toggle(ctx));
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

  pi.on("agent_settled", (_event, ctx) => tryRestore(ctx));

  pi.on("session_shutdown", () => {
    if (process.stdout.isTTY) process.stdout.write(KITTY_CLEAR_PI_FOCUS_AWARE);
  });
}
