import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const indexUrl = new URL("./index.ts", import.meta.url).href;
const packageSources = {
  "@earendil-works/pi-coding-agent": `
    export const getMarkdownTheme = () => ({});
  `,
  "@earendil-works/pi-tui": `
    export class Editor {}
    export class Markdown {}
    export class Text {}
    export const Key = {};
    export const matchesKey = () => false;
    export const truncateToWidth = (text) => text;
    export const visibleWidth = (text) => text.length;
    export const wrapTextWithAnsi = (text) => [text];
  `,
  typebox: `
    const schema = (kind, value) => ({ kind, value });
    export const Type = {
      String: () => schema("string"),
      Boolean: () => schema("boolean"),
      Array: (value) => schema("array", value),
      Object: (value) => schema("object", value),
      Optional: (value) => schema("optional", value),
    };
  `,
};

// The extension loader normally gives jiti aliases for these packages. Keep
// this test runnable with node --test as well, without making the repository
// depend on Pi's installed package tree.
const loaderSource = `
  const indexUrl = ${JSON.stringify(indexUrl)};
  const packageSources = ${JSON.stringify(packageSources)};

  export function resolve(specifier, context, nextResolve) {
    const source = packageSources[specifier];
    if (source !== undefined) {
      return {
        url: "data:text/javascript," + encodeURIComponent(source),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  }

  export async function load(url, context, nextLoad) {
    if (url === indexUrl) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const { stripTypeScriptTypes } = await import("node:module");
      const source = await readFile(fileURLToPath(url), "utf8");
      return {
        format: "module",
        shortCircuit: true,
        source: stripTypeScriptTypes(source, { mode: "transform" }),
      };
    }
    return nextLoad(url, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { default: questionExtension } = await import(indexUrl);

type Send = {
  message: string;
  options?: { deliverAs?: string; expandPromptTemplates?: boolean };
};

type Handler = (...args: unknown[]) => unknown;

type Harness = {
  tool: {
    execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
  };
  handlers: Map<string, Handler>;
  sends: Send[];
  emit: (event: string, ...args: unknown[]) => Promise<unknown>;
};

function createHarness(commands: unknown[]): Harness {
  const tools: Array<Harness["tool"]> = [];
  const handlers = new Map<string, Handler>();
  const sends: Send[] = [];
  const events = { emit: () => undefined };
  let runState: "idle" | "running" = "idle";

  const pi = {
    events,
    getCommands: () => commands,
    registerTool: (tool: Harness["tool"]) => tools.push(tool),
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    sendUserMessage: (message: string, options?: Send["options"]) => {
      if (options === undefined) assert.equal(runState, "idle");
      if (options?.deliverAs === "followUp") assert.equal(runState, "running");
      sends.push({ message, options });
    },
  };

  questionExtension(pi);
  const tool = tools.find((candidate) => candidate && (candidate as { name?: string }).name === "question");
  assert.ok(tool, "question tool should be registered");

  const emit = async (event: string, ...args: unknown[]) => {
    if (event === "agent_start") runState = "running";
    return handlers.get(event)?.(...args);
  };

  return { tool, handlers, sends, emit };
}

const questions = {
  questions: [{
    question: "Which work should continue?",
    header: "Work",
    options: [{ label: "Configured", description: "A configured choice" }],
  }],
};

const commands = [
  { name: "skill:deploy", source: "skill" },
  { name: "skill:disabled", source: "skill", disableModelInvocation: true },
  { name: "skill:not-a-skill", source: "extension" },
];

test("the registered question tool filters commands and steers unique skill mentions", async () => {
  const details = {
    answers: [[
      "literal answer /skill:deploy /skill:deploy /skill:disabled /skill:not-a-skill /skill:missing",
      "second literal answer  /skill:disabled",
    ]],
    notes: [{ choice: "literal note /skill:deploy /skill:missing" }],
  };
  const originalDetails = structuredClone(details);
  const harness = createHarness(commands);

  const result = await harness.tool.execute("call", questions, undefined, undefined, {
    mode: "tui",
    abort: () => undefined,
    ui: { custom: async () => ({ details }) },
  });

  assert.deepEqual(harness.sends, [
    { message: "/skill:deploy", options: { deliverAs: "steer", expandPromptTemplates: true } },
    { message: "/skill:disabled", options: { deliverAs: "steer", expandPromptTemplates: true } },
  ]);
  assert.deepEqual(details, originalDetails);
  assert.equal(result.content[0]!.text, [
    'User has answered your questions: "Which work should continue?"='
      + '"literal answer /skill:deploy /skill:deploy /skill:disabled /skill:not-a-skill /skill:missing, second literal answer  /skill:disabled"'
      + ' notes={"choice":"literal note /skill:deploy /skill:missing"}.'
      + " You can now continue with the user's answers in mind.",
    " Unknown skills mentioned: /skill:not-a-skill, /skill:missing.",
  ].join(""));
});

test("the registered reopen handlers answer before agent_start and flush follow-ups", async () => {
  const details = {
    answers: [["literal reopened answer /skill:deploy /skill:disabled /skill:deploy /skill:missing"]],
    notes: [{ choice: "literal reopened note /skill:missing" }],
  };
  const params = {
    questions: [{
      question: "Which work should continue?",
      header: "Work",
      options: [{ label: "Configured", description: "A configured choice" }],
    }],
  };
  const leaf = {
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", name: "question", arguments: params }],
    },
  };
  const harness = createHarness(commands);
  const context = {
    mode: "tui",
    ui: { custom: async () => ({ details }) },
    sessionManager: { getLeafEntry: () => leaf },
  };

  assert.ok(harness.handlers.has("agent_start"), "reopen delivery should use agent_start");
  const sessionStart = harness.handlers.get("session_start");
  assert.ok(sessionStart, "session_start should be registered");
  assert.ok(harness.handlers.has("session_tree"), "session_tree should be registered");

  await sessionStart({}, context);
  assert.deepEqual(harness.sends, [{
    message: 'User has answered your questions: "Which work should continue?"='
      + '"literal reopened answer /skill:deploy /skill:disabled /skill:deploy /skill:missing"'
      + ' notes={"choice":"literal reopened note /skill:missing"}.'
      + " You can now continue with the user's answers in mind."
      + " Unknown skills mentioned: /skill:missing.",
    options: undefined,
  }]);

  await harness.emit("agent_start", {});
  assert.deepEqual(harness.sends, [
    {
      message: 'User has answered your questions: "Which work should continue?"='
        + '"literal reopened answer /skill:deploy /skill:disabled /skill:deploy /skill:missing"'
        + ' notes={"choice":"literal reopened note /skill:missing"}.'
        + " You can now continue with the user's answers in mind."
        + " Unknown skills mentioned: /skill:missing.",
      options: undefined,
    },
    { message: "/skill:deploy", options: { deliverAs: "followUp", expandPromptTemplates: true } },
    { message: "/skill:disabled", options: { deliverAs: "followUp", expandPromptTemplates: true } },
  ]);
});
