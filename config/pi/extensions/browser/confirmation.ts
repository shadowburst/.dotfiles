import { getMarkdownTheme, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { CombinedAutocompleteProvider, Editor, type Focusable, Key, matchesKey, Markdown, truncateToWidth, type TUI, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { renderPrompt, skillAutocomplete } from "./note-editor.ts";

export type ConfirmationDetails = { answers: string[][]; additionalNote?: string };
type DialogResult = { details: ConfirmationDetails } | null;

// Browser-owned copy of the fixed-choice question UI; no sibling extension is required.
class ConfirmationComponent implements Focusable {
  private highlighted = 0;
  private additionalNote = "";
  private editing = false;
  private editor: Editor;
  private _focused = false;

  constructor(
    private readonly header: string,
    private readonly question: string,
    private readonly choices: [string, string],
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: (result: DialogResult) => void,
    private readonly getSkills: () => ReturnType<ExtensionAPI["getCommands"]>,
    cwd: string,
  ) {
    this.editor = new Editor(tui, {
      borderColor: text => theme.fg("accent", text),
      selectList: {
        selectedPrefix: text => theme.fg("accent", text),
        selectedText: text => theme.fg("accent", text),
        description: text => theme.fg("muted", text),
        scrollInfo: text => theme.fg("dim", text),
        noMatch: text => theme.fg("warning", text),
      },
    });
    this.editor.setAutocompleteProvider(skillAutocomplete(new CombinedAutocompleteProvider(getSkills(), cwd), getSkills));
    this.editor.onChange = () => this.refresh();
    this.editor.onSubmit = value => {
      this.additionalNote = value.trim();
      this.editing = false;
      this.editor.setText("");
      this.refresh();
    };
  }

  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    this.editor.focused = value && this.editing;
  }

  private refresh(): void {
    this.editor.focused = this._focused && this.editing;
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (this.editing) {
      if (matchesKey(data, Key.ctrl("c"))) this.editor.setText("");
      else if (matchesKey(data, Key.escape)) {
        this.editing = false;
        this.editor.setText("");
      } else this.editor.handleInput(data);
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.escape)) { this.done(null); return; }
    const backwards = matchesKey(data, Key.up) || matchesKey(data, Key.left);
    if (backwards || matchesKey(data, Key.down) || matchesKey(data, Key.right)) {
      this.highlighted = (this.highlighted + (backwards ? -1 : 1) + this.choices.length) % this.choices.length;
      this.refresh();
    } else if (matchesKey(data, "n")) {
      this.editing = true;
      this.editor.setText(this.additionalNote);
      this.refresh();
    } else if (matchesKey(data, Key.enter)) {
      this.done({ details: {
        answers: [[this.choices[this.highlighted]!]],
        ...(this.additionalNote ? { additionalNote: this.additionalNote } : {}),
      } });
    }
  }

  render(width: number): string[] {
    const renderWidth = Math.max(1, width);
    const lines: string[] = [];
    const add = (text: string) => lines.push(...wrapTextWithAnsi(text, renderWidth));
    const addMarkdown = (text: string, color: Parameters<Theme["fg"]>[0], prefix = "") => {
      const prefixWidth = visibleWidth(prefix);
      const markdown = new Markdown(text, 0, 0, getMarkdownTheme(), { color: value => this.theme.fg(color, value) });
      markdown.render(Math.max(1, renderWidth - prefixWidth)).forEach((line, index) => {
        lines.push(`${index === 0 ? prefix : " ".repeat(prefixWidth)}${line.trimEnd()}`);
      });
    };
    lines.push(this.theme.fg("accent", "─".repeat(renderWidth)));
    add(this.theme.bg("selectedBg", this.theme.fg("text", ` □ ${this.header} `)));
    lines.push("");
    addMarkdown(this.question, "text");
    lines.push("");
    this.choices.forEach((label, index) => {
      const highlighted = index === this.highlighted;
      const marker = highlighted ? this.theme.fg("accent", "→ ") : "  ";
      const color = highlighted ? "accent" : "text";
      addMarkdown(label, color, marker + this.theme.fg(color, `${index + 1}. `));
      addMarkdown("", "muted", "    ");
    });
    lines.push("");
    add(this.theme.fg("muted", "GENERAL (optional):"));
    const noteWidth = Math.max(1, renderWidth - 2);
    // Editor needs room for wide characters; the final truncation handles smaller terminals.
    const note = this.editing
      ? renderPrompt(this.editor.render(Math.max(10, noteWidth)), this.getSkills, this.theme,
        !!this.editor.getExpandedText().trim() && !this.editor.isShowingAutocomplete())
      : wrapTextWithAnsi(this.theme.fg("text", this.additionalNote || "No additional note"), noteWidth);
    lines.push(...note.map(line => `  ${line}`), "");
    add(this.theme.fg("dim", this.editing
      ? "Enter save • Ctrl+C clear • Esc discard"
      : "↑↓/←→ select • Enter submit • n add note • Esc dismiss"));
    lines.push(this.theme.fg("accent", "─".repeat(renderWidth)));
    return lines.map(line => truncateToWidth(line, renderWidth, ""));
  }

  invalidate(): void { this.editor.invalidate(); }
}

export async function showConfirmation(
  pi: ExtensionAPI, ctx: ExtensionContext, header: string, question: string, choices: [string, string], signal?: AbortSignal,
): Promise<DialogResult> {
  if (signal?.aborted) return null;
  let onAbort: (() => void) | undefined;
  pi.events.emit("herdr:blocked", { active: true, label: header });
  try {
    return await ctx.ui.custom<DialogResult>((tui, theme, _keybindings, done) => {
      let finished = false;
      const finish = (result: DialogResult) => {
        if (finished) return;
        finished = true;
        done(signal?.aborted ? null : result);
      };
      onAbort = () => finish(null);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) queueMicrotask(onAbort);
      return new ConfirmationComponent(header, question, choices, tui, theme, finish, () => pi.getCommands(), ctx.cwd);
    });
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    pi.events.emit("herdr:blocked", { active: false });
  }
}
