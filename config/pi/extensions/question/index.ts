import { getMarkdownTheme, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  type Focusable,
  Key,
  matchesKey,
  Markdown,
  Text,
  truncateToWidth,
  type TUI,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

import {
  answerLabel,
  beginCustomEdit,
  beginNoteEdit,
  cancelEdit,
  createQuestionState,
  dismiss,
  isConfirm,
  isSingleFlow,
  moveHighlight,
  recoverQuestionParamsFromLeaf,
  saveEdit,
  selectOption,
  setEditDraft,
  setTab,
  submit,
  type Question,
  type QuestionDetails,
  type QuestionState,
} from "./state.ts";

const QuestionSchema = Type.Object({
  question: Type.String(),
  header: Type.String(),
  options: Type.Array(Type.Object({ label: Type.String(), description: Type.String() })),
  multiple: Type.Optional(Type.Boolean()),
});

const QuestionParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema),
});

type QuestionParams = Static<typeof QuestionParamsSchema>;
type DialogResult = { details: QuestionDetails } | null;

function editorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (text) => theme.fg("accent", text),
    selectList: {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    },
  };
}

class QuestionComponent implements Focusable {
  private state: QuestionState;
  private editor: Editor;
  private _focused = false;

  constructor(
    private readonly questions: Question[],
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: (result: DialogResult) => void,
  ) {
    this.state = createQuestionState(questions);
    this.editor = new Editor(tui, editorTheme(theme));
    this.editor.onChange = (value) => {
      this.state = setEditDraft(this.state, value);
      this.refresh();
    };
    this.editor.onSubmit = (value) => this.saveEditor(value);
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.editor.focused = value && this.state.editMode.type !== "browse";
  }

  private refresh(): void {
    this.editor.focused = this._focused && this.state.editMode.type !== "browse";
    this.tui.requestRender();
  }

  private openEditor(state: QuestionState): void {
    this.state = state;
    this.editor.setText(state.editDraft);
    this.refresh();
  }

  private saveEditor(value: string): void {
    const step = saveEdit(setEditDraft(this.state, value));
    this.state = step.state;
    this.editor.setText("");
    if (step.submit) this.finish();
    else this.refresh();
  }

  private finish(): void {
    this.done({ details: submit(this.state, this.questions).details });
  }

  private activate(optionIndex = this.state.highlighted): void {
    const step = selectOption(this.state, this.questions, optionIndex);
    if (step.state.editMode.type !== "browse") this.openEditor(step.state);
    else {
      this.state = step.state;
      if (step.submit) this.finish();
      else this.refresh();
    }
  }

  handleInput(data: string): void {
    if (this.state.editMode.type !== "browse") {
      if (matchesKey(data, Key.escape)) {
        this.state = cancelEdit(setEditDraft(this.state, this.editor.getExpandedText()));
        this.editor.setText("");
        this.refresh();
        return;
      }
      this.editor.handleInput(data);
      this.refresh();
      return;
    }

    if (matchesKey(data, Key.escape)) {
      if (dismiss(this.state).cancel) this.done(null);
      return;
    }

    const single = isSingleFlow(this.questions);
    if (!single) {
      if (matchesKey(data, Key.tab) || matchesKey(data, Key.right) || matchesKey(data, "l")) {
        this.state = setTab(this.state, this.questions, this.state.tab + 1);
        this.refresh();
        return;
      }
      if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left) || matchesKey(data, "h")) {
        this.state = setTab(this.state, this.questions, this.state.tab - 1);
        this.refresh();
        return;
      }
    }

    if (isConfirm(this.state, this.questions)) {
      if (matchesKey(data, Key.enter)) this.finish();
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
      this.state = moveHighlight(this.state, this.questions, -1);
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
      this.state = moveHighlight(this.state, this.questions, 1);
      this.refresh();
      return;
    }
    if (matchesKey(data, "n")) {
      this.openEditor(beginNoteEdit(this.state, this.questions));
      return;
    }
    if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
      this.activate();
      return;
    }

    for (let digit = 1; digit <= 9; digit++) {
      if (matchesKey(data, String(digit) as "1")) {
        const question = this.questions[this.state.tab];
        if (question && digit <= question.options.length + 1) this.activate(digit - 1);
        return;
      }
    }
  }

  render(width: number): string[] {
    const renderWidth = Math.max(1, width);
    const lines: string[] = [];
    const add = (text: string) => lines.push(...wrapTextWithAnsi(text, renderWidth));
    const addPrefixed = (prefix: string, text: string) => {
      const prefixWidth = visibleWidth(prefix);
      if (prefixWidth >= renderWidth) {
        add(prefix + text);
        return;
      }
      const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
      for (let index = 0; index < wrapped.length; index++) {
        lines.push(`${index === 0 ? prefix : " ".repeat(prefixWidth)}${wrapped[index]}`);
      }
    };
    const addMarkdown = (
      text: string,
      color: Parameters<Theme["fg"]>[0],
      prefix = "",
    ) => {
      const prefixWidth = visibleWidth(prefix);
      const availableWidth = Math.max(1, renderWidth - prefixWidth);
      const markdown = new Markdown(
        text,
        0,
        0,
        getMarkdownTheme(),
        { color: (value) => this.theme.fg(color, value) },
      );
      markdown.render(availableWidth).forEach((line, index) => {
        lines.push(`${index === 0 ? prefix : " ".repeat(prefixWidth)}${line.trimEnd()}`);
      });
    };

    lines.push(this.theme.fg("accent", "─".repeat(renderWidth)));
    if (!isSingleFlow(this.questions)) {
      const tabs = this.questions.map((question, index) => {
        const active = this.state.tab === index;
        const answered = (this.state.answers[index]?.length ?? 0) > 0;
        const text = ` ${answered ? "■" : "□"} ${question.header} `;
        return active
          ? this.theme.bg("selectedBg", this.theme.fg("text", text))
          : this.theme.fg(answered ? "success" : "muted", text);
      });
      const confirm = this.state.tab === this.questions.length;
      const confirmText = " Confirm ";
      tabs.push(confirm
        ? this.theme.bg("selectedBg", this.theme.fg("text", confirmText))
        : this.theme.fg("muted", confirmText));
      add(tabs.join(" "));
      lines.push("");
    }

    if (isConfirm(this.state, this.questions)) {
      add(this.theme.fg("accent", this.theme.bold("Review")));
      lines.push("");
      this.questions.forEach((question, questionIndex) => {
        const labels = this.answerLabels(questionIndex);
        const value = labels.length ? labels.join(", ") : "Unanswered";
        addMarkdown(question.question, "text");
        addPrefixed(
          `${this.theme.fg("muted", `${question.header}: `)}`,
          this.theme.fg(labels.length ? "text" : "warning", value),
        );
        for (const optionIndex of this.state.answers[questionIndex] ?? []) {
          const note = this.state.notes[questionIndex]?.[optionIndex];
          if (note) {
            const label = answerLabel(this.state, question, questionIndex, optionIndex);
            addPrefixed("  ", this.theme.fg("muted", `${label} note: ${note}`));
          }
        }
      });
      lines.push("");
      add(this.theme.fg("dim", "Enter submit • Tab/←→/h/l navigate • Esc dismiss"));
    } else {
      const question = this.questions[this.state.tab];
      if (question) {
        addMarkdown(`${question.question}${question.multiple === true ? " (select all that apply)" : ""}`, "text");
        lines.push("");
        for (let optionIndex = 0; optionIndex <= question.options.length; optionIndex++) {
          const custom = optionIndex === question.options.length;
          const highlighted = optionIndex === this.state.highlighted;
          const selected = this.state.answers[this.state.tab]?.includes(optionIndex) ?? false;
          const marker = highlighted ? this.theme.fg("accent", "> ") : "  ";
          const checkbox = question.multiple === true ? `[${selected ? "✓" : " "}] ` : selected ? "✓ " : "";
          const color = highlighted ? "accent" : selected ? "success" : "text";
          const label = custom ? "Type your own answer" : question.options[optionIndex]!.label;
          const prefix = marker + this.theme.fg(color, `${optionIndex + 1}. ${checkbox}`);
          if (custom) addPrefixed(marker, this.theme.fg(color, `${optionIndex + 1}. ${checkbox}${label}`));
          else addMarkdown(label, color, prefix);
          if (!custom) addMarkdown(question.options[optionIndex]!.description, "muted", "    ");
          else if (this.state.customDraft[this.state.tab]) addPrefixed("    ", this.theme.fg("muted", this.state.customDraft[this.state.tab]!));

          const editingHere = this.state.editMode.type !== "browse"
            && this.state.editMode.questionIndex === this.state.tab
            && (this.state.editMode.type === "custom" ? custom : this.state.editMode.optionIndex === optionIndex);
          const savedNote = this.state.notes[this.state.tab]?.[optionIndex];
          if (savedNote && !(editingHere && this.state.editMode.type === "note")) {
            addPrefixed("    ", this.theme.fg("muted", `note: ${savedNote}`));
          }
          if (editingHere) {
            const title = this.state.editMode.type === "note" ? "Option note:" : "Your answer:";
            addPrefixed("    ", this.theme.fg("muted", title));
            for (const editorLine of this.editor.render(Math.max(1, renderWidth - 4))) lines.push(`    ${editorLine}`);
          }
        }
        lines.push("");
        const hint = this.state.editMode.type === "browse"
          ? `${isSingleFlow(this.questions) ? "" : "Tab/←→/h/l tabs • "}↑↓/jk select • Enter/Space act • n add note • Esc dismiss`
          : `Enter save • Esc ${this.state.editMode.type === "note" ? "discard" : "go back"}`;
        add(this.theme.fg("dim", hint));
      }
    }
    lines.push(this.theme.fg("accent", "─".repeat(renderWidth)));
    return lines.map((line) => truncateToWidth(line, renderWidth, ""));
  }

  private answerLabels(questionIndex: number): string[] {
    const question = this.questions[questionIndex];
    if (!question) return [];
    return (this.state.answers[questionIndex] ?? [])
      .map((optionIndex) => answerLabel(this.state, question, questionIndex, optionIndex))
      .filter(Boolean);
  }

  invalidate(): void {
    this.editor.invalidate();
  }
}

function resultText(params: QuestionParams, details: QuestionDetails): string {
  const formatted = params.questions.map((question, index) => {
    const answer = details.answers[index]?.length ? details.answers[index]!.join(", ") : "Unanswered";
    const note = details.notes?.[index];
    const suffix = note && Object.keys(note).length ? ` notes=${JSON.stringify(note)}` : "";
    return `${JSON.stringify(question.question)}=${JSON.stringify(answer)}${suffix}`;
  }).join(", ");
  return `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`;
}

async function showDialog(params: QuestionParams, ctx: ExtensionContext): Promise<DialogResult> {
  if (params.questions.length === 0) return { details: { answers: [] } };
  return ctx.ui.custom<DialogResult>((tui, theme, _keybindings, done) =>
    new QuestionComponent(params.questions, tui, theme, done));
}

export default function questionExtension(pi: ExtensionAPI): void {
  pi.registerTool({
      name: "question",
      label: "Question",
      description: "Ask one or more questions to gather preferences, clarify ambiguity, obtain implementation decisions, or offer valid directions. The UI always allows a custom answer.",
      promptSnippet: "Gather one or more structured decisions from the user",
      promptGuidelines: [
        "Use question to gather preferences, clarify ambiguity, obtain implementation decisions, or offer valid directions.",
        "Do not add an Other or catch-all option to question; its UI adds Type your own answer.",
        "Treat question answers as arrays of labels; multiple: true permits more than one answer.",
        "When recommending a question option, place it first and suffix its label with (Recommended).",
        "Gather enough context before calling question so the user can make an informed choice.",
      ],
      parameters: QuestionParamsSchema,
      executionMode: "sequential",
      async execute(_toolCallId, params, _signal, _onUpdate, executeCtx) {
        if (executeCtx.mode !== "tui") throw new Error("question requires interactive TUI mode");
        const result = await showDialog(params, executeCtx);
        if (!result) throw new Error("User cancelled");
        return {
          content: [{ type: "text" as const, text: resultText(params, result.details) }],
          details: result.details,
        };
      },
      renderCall(args, theme) {
        const count = Array.isArray(args.questions) ? args.questions.length : 0;
        return new Text(
          theme.fg("toolTitle", theme.bold("question "))
            + theme.fg("muted", `${count} question${count === 1 ? "" : "s"}`),
          0,
          0,
        );
      },
      renderResult(result, _options, theme, context) {
        const details = result.details as QuestionDetails | undefined;
        const params = context.args as QuestionParams;
        if (!details || !Array.isArray(params.questions)) return new Text("", 0, 0);
        const lines = params.questions.map((question, questionIndex) => {
          const answers = details.answers[questionIndex] ?? [];
          let line = `${theme.fg(answers.length ? "success" : "warning", answers.length ? "✓" : "!")} ${theme.fg("accent", question.header)}: ${answers.length ? answers.join(", ") : "Unanswered"}`;
          const notes = details.notes?.[questionIndex];
          if (notes && Object.keys(notes).length) line += theme.fg("muted", ` notes=${JSON.stringify(notes)}`);
          return line;
        });
        return new Text(lines.join("\n"), 0, 0);
      },
    });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const params = recoverQuestionParamsFromLeaf(ctx.sessionManager.getLeafEntry());
    if (!params) return;

    const result = await showDialog(params, ctx);
    const message = result
      ? resultText(params, result.details)
      : "The interrupted question was cancelled. Continue without those answers.";
    // Let session_start finish rebinding the resumed runtime before triggering a turn.
    setTimeout(() => pi.sendUserMessage(message), 0);
  });
}
