export type QuestionOption = {
  label: string;
  description: string;
};

export type Question = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
};

export type EditMode =
  | { type: "browse" }
  | { type: "custom"; questionIndex: number; original: string }
  | { type: "note"; questionIndex: number; optionIndex: number; original: string };

export type QuestionDetails = {
  answers: string[][];
  notes?: Array<Record<string, string>>;
};

export type QuestionState = {
  tab: number;
  highlighted: number;
  answers: number[][];
  custom: string[];
  customDraft: string[];
  notes: Array<Record<number, string>>;
  editMode: EditMode;
  editDraft: string;
  configuredCounts: number[];
  multiple: boolean[];
};

export type QuestionStep = {
  state: QuestionState;
  submit: boolean;
};

export function isSingleFlow(questions: Question[]): boolean {
  return questions.length === 1 && questions[0]?.multiple !== true;
}

export function createQuestionState(questions: Question[]): QuestionState {
  return {
    tab: 0,
    highlighted: 0,
    answers: questions.map(() => []),
    custom: questions.map(() => ""),
    customDraft: questions.map(() => ""),
    notes: questions.map(() => ({})),
    editMode: { type: "browse" },
    editDraft: "",
    configuredCounts: questions.map((question) => question.options.length),
    multiple: questions.map((question) => question.multiple === true),
  };
}

export function isConfirm(state: QuestionState, questions: Question[]): boolean {
  return !isSingleFlow(questions) && state.tab === questions.length;
}

export function setTab(state: QuestionState, questions: Question[], tab: number): QuestionState {
  const total = isSingleFlow(questions) ? 1 : questions.length + 1;
  if (total === 0) return state;
  return {
    ...state,
    tab: (tab + total) % total,
    highlighted: 0,
    editMode: { type: "browse" },
    editDraft: "",
  };
}

export function moveHighlight(state: QuestionState, questions: Question[], direction: -1 | 1): QuestionState {
  const question = questions[state.tab];
  if (!question) return state;
  const total = question.options.length + 1;
  return { ...state, highlighted: (state.highlighted + direction + total) % total };
}

export function beginCustomEdit(state: QuestionState, questions: Question[]): QuestionState {
  const question = questions[state.tab];
  if (!question) return state;
  const original = state.custom[state.tab] ?? "";
  return {
    ...state,
    highlighted: question.options.length,
    editMode: { type: "custom", questionIndex: state.tab, original },
    editDraft: state.customDraft[state.tab] ?? original,
  };
}

export function beginNoteEdit(state: QuestionState, questions: Question[], optionIndex = state.highlighted): QuestionState {
  const question = questions[state.tab];
  if (!question || optionIndex < 0 || optionIndex > question.options.length) return state;
  const original = state.notes[state.tab]?.[optionIndex] ?? "";
  return {
    ...state,
    highlighted: optionIndex,
    editMode: { type: "note", questionIndex: state.tab, optionIndex, original },
    editDraft: original,
  };
}

export function setEditDraft(state: QuestionState, editDraft: string): QuestionState {
  return { ...state, editDraft };
}

export function cancelEdit(state: QuestionState): QuestionState {
  if (state.editMode.type === "browse") return state;
  const customDraft = [...state.customDraft];
  if (state.editMode.type === "custom") customDraft[state.editMode.questionIndex] = state.editDraft;
  return { ...state, customDraft, editMode: { type: "browse" }, editDraft: "" };
}

function storeAnswers(state: QuestionState, questionIndex: number, answers: number[]): QuestionState {
  const all = state.answers.map((answer) => [...answer]);
  all[questionIndex] = answers;
  return { ...state, answers: all };
}

function finishSingleSelection(state: QuestionState, questionIndex: number): QuestionStep {
  const single = state.configuredCounts.length === 1 && !state.multiple[0];
  if (single) return { state, submit: true };
  return {
    state: {
      ...state,
      tab: questionIndex + 1,
      highlighted: 0,
      editMode: { type: "browse" },
      editDraft: "",
    },
    submit: false,
  };
}

export function selectOption(
  state: QuestionState,
  questions: Question[],
  optionIndex = state.highlighted,
): QuestionStep {
  const question = questions[state.tab];
  if (!question) return { state, submit: false };
  if (optionIndex === question.options.length) {
    return { state: beginCustomEdit(state, questions), submit: false };
  }
  if (!question.options[optionIndex]) return { state, submit: false };

  if (question.multiple === true) {
    const answers = [...(state.answers[state.tab] ?? [])];
    const existing = answers.indexOf(optionIndex);
    if (existing === -1) answers.push(optionIndex);
    else answers.splice(existing, 1);
    return { state: storeAnswers(state, state.tab, answers), submit: false };
  }

  const next = storeAnswers(state, state.tab, [optionIndex]);
  return finishSingleSelection(next, state.tab);
}

export function saveEdit(state: QuestionState): QuestionStep {
  const mode = state.editMode;
  if (mode.type === "browse") return { state, submit: false };
  const value = state.editDraft;

  if (mode.type === "note") {
    const notes = state.notes.map((entry) => ({ ...entry }));
    if (value) notes[mode.questionIndex]![mode.optionIndex] = value;
    else delete notes[mode.questionIndex]![mode.optionIndex];
    return {
      state: { ...state, notes, editMode: { type: "browse" }, editDraft: "" },
      submit: false,
    };
  }

  const questionIndex = mode.questionIndex;
  const customIndex = state.configuredCounts[questionIndex]!;
  const custom = [...state.custom];
  const customDraft = [...state.customDraft];
  custom[questionIndex] = value;
  customDraft[questionIndex] = value;
  const wasSelected = state.answers[questionIndex]?.includes(customIndex) ?? false;
  let answers = [...(state.answers[questionIndex] ?? [])];
  if (!value) answers = answers.filter((index) => index !== customIndex);
  else if (state.multiple[questionIndex] && !wasSelected) answers.push(customIndex);
  else if (!state.multiple[questionIndex]) answers = [customIndex];
  const next = storeAnswers({ ...state, custom, customDraft, editMode: { type: "browse" }, editDraft: "" }, questionIndex, answers);
  if (!value || state.multiple[questionIndex]) return { state: next, submit: false };
  return finishSingleSelection(next, questionIndex);
}

export function dismiss(state: QuestionState): { state: QuestionState; cancel: true; submit: false } {
  return { state, cancel: true, submit: false };
}

export function answerLabel(
  state: QuestionState,
  question: Question,
  questionIndex: number,
  optionIndex: number,
): string {
  return optionIndex === question.options.length
    ? state.custom[questionIndex] ?? ""
    : question.options[optionIndex]?.label ?? "";
}

export function recoverQuestionParamsFromLeaf(entry: unknown): { questions: Question[] } | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const message = (entry as { type?: unknown; message?: unknown }).message;
  if ((entry as { type?: unknown }).type !== "message" || !message || typeof message !== "object") return undefined;
  const { content, role } = message as { content?: unknown; role?: unknown };
  if (role !== "assistant" || !Array.isArray(content)) return undefined;

  const call = content.findLast((block) => {
    if (!block || typeof block !== "object") return false;
    const value = block as { type?: unknown; name?: unknown };
    return value.type === "toolCall" && value.name === "question";
  }) as { arguments?: unknown } | undefined;
  if (!call?.arguments || typeof call.arguments !== "object") return undefined;

  const questions = (call.arguments as { questions?: unknown }).questions;
  if (!Array.isArray(questions) || !questions.every((question) => {
    if (!question || typeof question !== "object") return false;
    const value = question as { question?: unknown; header?: unknown; options?: unknown; multiple?: unknown };
    return typeof value.question === "string"
      && typeof value.header === "string"
      && (value.multiple === undefined || typeof value.multiple === "boolean")
      && Array.isArray(value.options)
      && value.options.every((option) => option && typeof option === "object"
        && typeof (option as { label?: unknown }).label === "string"
        && typeof (option as { description?: unknown }).description === "string");
  })) return undefined;

  return { questions: questions as Question[] };
}

export function submit(state: QuestionState, questions: Question[]): { details: QuestionDetails } {
  const answers = questions.map((question, questionIndex) =>
    (state.answers[questionIndex] ?? [])
      .map((optionIndex) => answerLabel(state, question, questionIndex, optionIndex))
      .filter(Boolean),
  );
  const notes = questions.map((question, questionIndex) => {
    const submittedNotes: Record<string, string> = {};
    for (const optionIndex of state.answers[questionIndex] ?? []) {
      const note = state.notes[questionIndex]?.[optionIndex];
      if (!note) continue;
      const label = answerLabel(state, question, questionIndex, optionIndex);
      if (label) submittedNotes[label] = note;
    }
    return submittedNotes;
  });
  const details: QuestionDetails = { answers };
  if (notes.some((entry) => Object.keys(entry).length > 0)) details.notes = notes;
  return { details };
}
