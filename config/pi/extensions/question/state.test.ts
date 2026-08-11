import assert from "node:assert/strict";
import test from "node:test";

import {
  beginCustomEdit,
  beginNoteEdit,
  cancelEdit,
  createQuestionState,
  dismiss,
  moveHighlight,
  recoverQuestionParamsFromLeaf,
  saveEdit,
  selectOption,
  setEditDraft,
  setTab,
  submit,
  type Question,
} from "./state.ts";

const single: Question[] = [
  {
    question: "Choose?",
    header: "Choice",
    options: [
      { label: "A", description: "first" },
      { label: "B", description: "second" },
    ],
  },
];

const multipleQuestions: Question[] = [
  ...single,
  {
    question: "Continue?",
    header: "Next",
    options: [{ label: "C", description: "third" }],
  },
];

test("single configured option selects and completes immediately", () => {
  const step = selectOption(createQuestionState(single), single, 1);
  assert.deepEqual(step.state.answers, [[1]]);
  assert.equal(step.submit, true);
});

test("multi-question single-select advances and preserves earlier answers", () => {
  const first = selectOption(createQuestionState(multipleQuestions), multipleQuestions, 1);
  const second = selectOption(first.state, multipleQuestions, 0);
  assert.equal(first.state.tab, 1);
  assert.deepEqual(second.state.answers, [[1], [0]]);
  assert.equal(second.state.tab, 2);
  assert.equal(second.submit, false);
});

test("multi-select toggles in selection order and removes only its target", () => {
  const questions: Question[] = [{ ...single[0]!, multiple: true }];
  let state = createQuestionState(questions);
  state = selectOption(state, questions, 1).state;
  state = selectOption(state, questions, 0).state;
  assert.deepEqual(state.answers, [[1, 0]]);
  state = selectOption(state, questions, 1).state;
  assert.deepEqual(state.answers, [[0]]);
});

test("question tab navigation wraps, resets focus, and confirm permits unanswered questions", () => {
  let state = createQuestionState(multipleQuestions);
  state = moveHighlight(state, multipleQuestions, -1);
  assert.equal(state.highlighted, 2);
  state = setTab(state, multipleQuestions, -1);
  assert.equal(state.tab, 2);
  assert.equal(state.highlighted, 0);
  assert.deepEqual(submit(state, multipleQuestions).details.answers, [[], []]);
});

test("custom draft survives editor Escape", () => {
  let state = beginCustomEdit(createQuestionState(single), single);
  state = setEditDraft(state, "work in progress");
  state = cancelEdit(state);
  assert.equal(state.customDraft[0], "work in progress");
  assert.equal(state.custom[0], "");
  assert.deepEqual(state.answers, [[]]);
});

test("saving custom text selects it and clearing it removes its selection", () => {
  const questions: Question[] = [{ ...single[0]!, multiple: true }];
  let state = beginCustomEdit(createQuestionState(questions), questions);
  state = saveEdit(setEditDraft(state, "Custom")).state;
  assert.deepEqual(state.answers, [[2]]);
  state = beginCustomEdit(state, questions);
  state = saveEdit(setEditDraft(state, "")).state;
  assert.deepEqual(state.answers, [[]]);
  assert.equal(state.custom[0], "");
});

test("editing a selected custom answer replaces it without changing selection order until saved", () => {
  const questions: Question[] = [{ ...single[0]!, multiple: true }];
  let state = selectOption(createQuestionState(questions), questions, 0).state;
  state = saveEdit(setEditDraft(beginCustomEdit(state, questions), "old custom")).state;
  state = selectOption(state, questions, 1).state;
  assert.deepEqual(state.answers, [[0, 2, 1]]);

  state = cancelEdit(setEditDraft(beginCustomEdit(state, questions), "unsaved custom"));
  assert.deepEqual(submit(state, questions).details.answers, [["A", "old custom", "B"]]);
  state = saveEdit(setEditDraft(beginCustomEdit(state, questions), "new custom")).state;
  assert.deepEqual(state.answers, [[0, 2, 1]]);
  assert.deepEqual(submit(state, questions).details.answers, [["A", "new custom", "B"]]);
});

test("saved custom answers and option notes preserve whitespace", () => {
  const questions: Question[] = [{ ...single[0]!, multiple: true }];
  let state = saveEdit(setEditDraft(beginCustomEdit(createQuestionState(questions), questions), " custom ")).state;
  state = saveEdit(setEditDraft(beginNoteEdit(state, questions, 2), " note ")).state;
  assert.deepEqual(submit(state, questions).details, {
    answers: [[" custom "]],
    notes: [{ " custom ": " note " }],
  });
});

test("configured options and custom row keep independent notes without selecting", () => {
  let state = createQuestionState(single);
  for (const [option, note] of [[0, "note A"], [1, "note B"], [2, "custom note"]] as const) {
    state = beginNoteEdit(state, single, option);
    state = saveEdit(setEditDraft(state, note)).state;
  }
  assert.deepEqual(state.notes, [{ 0: "note A", 1: "note B", 2: "custom note" }]);
  assert.deepEqual(state.answers, [[]]);
});

test("option-note Escape restores the saved note", () => {
  let state = beginNoteEdit(createQuestionState(single), single, 0);
  state = saveEdit(setEditDraft(state, "saved")).state;
  state = beginNoteEdit(state, single, 0);
  state = cancelEdit(setEditDraft(state, "discarded"));
  assert.equal(state.notes[0]?.[0], "saved");
});

test("submission excludes unselected and deselected notes", () => {
  const questions: Question[] = [{ ...single[0]!, multiple: true }];
  let state = createQuestionState(questions);
  state = saveEdit(setEditDraft(beginNoteEdit(state, questions, 0), "keep only while selected")).state;
  state = selectOption(state, questions, 0).state;
  state = selectOption(state, questions, 0).state;
  assert.deepEqual(submit(state, questions).details, { answers: [[]] });
});

test("submitted notes use final configured and custom labels", () => {
  const questions: Question[] = [{ ...single[0]!, multiple: true }];
  let state = createQuestionState(questions);
  state = saveEdit(setEditDraft(beginNoteEdit(state, questions, 0), "configured note")).state;
  state = selectOption(state, questions, 0).state;
  state = saveEdit(setEditDraft(beginNoteEdit(state, questions, 2), "custom note")).state;
  state = saveEdit(setEditDraft(beginCustomEdit(state, questions), "My answer")).state;
  assert.deepEqual(submit(state, questions).details, {
    answers: [["A", "My answer"]],
    notes: [{ A: "configured note", "My answer": "custom note" }],
  });
});

test("recovers only a valid question call from an assistant leaf", () => {
  const params = { questions: single };
  assert.deepEqual(recoverQuestionParamsFromLeaf({
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", name: "question", arguments: params }],
    },
  }), params);
  assert.equal(recoverQuestionParamsFromLeaf({
    type: "message",
    message: { role: "toolResult", content: [] },
  }), undefined);
});

test("zero questions submits an empty result", () => {
  const state = createQuestionState([]);
  assert.deepEqual(submit(state, []).details, { answers: [] });
});

test("zero configured options still exposes a wrapping custom row", () => {
  const questions: Question[] = [{ question: "Write?", header: "Write", options: [] }];
  const state = moveHighlight(createQuestionState(questions), questions, 1);
  assert.equal(state.highlighted, 0);
  assert.equal(beginCustomEdit(state, questions).editMode.type, "custom");
});

test("top-level cancellation never submits", () => {
  const state = cancelEdit(setEditDraft(beginCustomEdit(createQuestionState(single), single), "draft"));
  const step = dismiss(state);
  assert.equal(step.cancel, true);
  assert.equal(step.submit, false);
  assert.equal(step.state, state);
});
