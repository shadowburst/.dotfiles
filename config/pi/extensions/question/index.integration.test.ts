import assert from "node:assert/strict";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { after, test } from "node:test";

const indexUrl = new URL("./index.ts", import.meta.url).href;
const packageSources = {
  "@earendil-works/pi-coding-agent": `
    export const getMarkdownTheme = () => ({});
    export const stripFrontmatter = (content) => content.replace(/^---\\n[\\s\\S]*?\\n---\\n?/, "");
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
};

const skillRoot = await mkdtemp(join(tmpdir(), "question-skills-"));
const paths = {
  review: join(skillRoot, "review", "SKILL.md"),
  deploy: join(skillRoot, "deploy", "SKILL.md"),
  disabled: join(skillRoot, "disabled", "SKILL.md"),
  broken: join(skillRoot, "broken", "SKILL.md"),
};
await Promise.all(Object.values(paths).map((path) => mkdir(dirname(path), { recursive: true })));
await Promise.all([
  writeFile(paths.review, "---\nname: review\ndescription: test\n---\nReview body\n", "utf8"),
  writeFile(paths.deploy, "---\nname: deploy\ndescription: test\n---\nDeploy body\n", "utf8"),
  writeFile(paths.disabled, "---\nname: disabled\ndescription: test\n---\nDisabled body\n", "utf8"),
]);
after(async () => rm(skillRoot, { recursive: true, force: true }));

function createHarness(commands: unknown[]): Harness {
  const tools: Array<Harness["tool"]> = [];
  const handlers = new Map<string, Handler>();
  const sends: Send[] = [];
  const events = { emit: () => undefined };

  const pi = {
    events,
    getCommands: () => commands,
    registerTool: (tool: Harness["tool"]) => tools.push(tool),
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    sendUserMessage: (message: string, options?: Send["options"]) => sends.push({ message, options }),
  };

  questionExtension(pi);
  const tool = tools.find((candidate) => candidate && (candidate as { name?: string }).name === "question");
  assert.ok(tool, "question tool should be registered");

  return { tool, handlers, sends };
}

const questions = {
  questions: [{
    question: "Which work should continue?",
    header: "Work",
    options: [{ label: "Configured", description: "A configured choice" }],
  }],
};

const commands = [
  { name: "skill:review", source: "skill", sourceInfo: { path: paths.review } },
  { name: "skill:deploy", source: "skill", sourceInfo: { path: paths.deploy } },
  {
    name: "skill:disabled",
    source: "skill",
    disableModelInvocation: true,
    sourceInfo: { path: paths.disabled },
  },
  { name: "skill:broken", source: "skill", sourceInfo: { path: paths.broken } },
  { name: "skill:not-a-skill", source: "extension", sourceInfo: { path: paths.review } },
];

const reviewBlock = `<skill name="review" location="${paths.review}">
References are relative to ${dirname(paths.review)}.

Review body
</skill>`;
const deployBlock = `<skill name="deploy" location="${paths.deploy}">
References are relative to ${dirname(paths.deploy)}.

Deploy body
</skill>`;
const disabledBlock = `<skill name="disabled" location="${paths.disabled}">
References are relative to ${dirname(paths.disabled)}.

Disabled body
</skill>`;

function executeContext() {
  return {
    mode: "tui",
    abort: () => undefined,
    ui: { custom: async () => ({ details: { answers: [[]] } }) },
  };
}

test("returns one atomic result with every mentioned skill in mention order", async () => {
  const details = {
    answers: [[
      "literal answer /skill:review /skill:deploy /skill:review /skill:disabled /skill:not-a-skill /skill:missing",
    ]],
    notes: [{ choice: "literal note /skill:deploy" }],
  };
  const originalDetails = structuredClone(details);
  const harness = createHarness(commands);

  const result = await harness.tool.execute("call", questions, undefined, undefined, {
    ...executeContext(),
    ui: { custom: async () => ({ details }) },
  });

  assert.deepEqual(harness.sends, []);
  assert.deepEqual(details, originalDetails);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0]!.text, [
    reviewBlock,
    deployBlock,
    disabledBlock,
    'User has answered your questions: "Which work should continue?"='
      + '"literal answer /skill:review /skill:deploy /skill:review /skill:disabled /skill:not-a-skill /skill:missing"'
      + ' notes={"choice":"literal note /skill:deploy"}. You can now continue with the user\'s answers in mind.'
      + " Unknown skills mentioned: /skill:not-a-skill, /skill:missing.",
  ].join("\n\n"));
});

test("reopens a question with all skills and the answer in one user message", async () => {
  const details = {
    answers: [["literal reopened answer /skill:deploy /skill:review /skill:deploy /skill:missing"]],
  };
  const params = {
    questions: questions.questions,
  };
  const leaf = {
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", name: "question", arguments: params }],
    },
  };
  const harness = createHarness(commands);
  const sessionStart = harness.handlers.get("session_start");
  assert.ok(sessionStart, "session_start should be registered");
  assert.equal(harness.handlers.has("agent_start"), false);

  await sessionStart({}, {
    mode: "tui",
    ui: { custom: async () => ({ details }) },
    sessionManager: { getLeafEntry: () => leaf },
  });

  assert.deepEqual(harness.sends, [{
    message: [
      deployBlock,
      reviewBlock,
      'User has answered your questions: "Which work should continue?"='
        + '"literal reopened answer /skill:deploy /skill:review /skill:deploy /skill:missing". You can now continue with the user\'s answers in mind.'
        + " Unknown skills mentioned: /skill:missing.",
    ].join("\n\n"),
    options: undefined,
  }]);
});

test("reports a skill read failure while preserving the answer", async () => {
  const details = { answers: [["literal answer /skill:broken /skill:deploy"]] };
  const harness = createHarness(commands);

  const result = await harness.tool.execute("call", questions, undefined, undefined, {
    ...executeContext(),
    ui: { custom: async () => ({ details }) },
  });

  assert.deepEqual(harness.sends, []);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0]!.text, [
    deployBlock,
    'User has answered your questions: "Which work should continue?"='
      + '"literal answer /skill:broken /skill:deploy". You can now continue with the user\'s answers in mind.'
      + " Failed to load skills: /skill:broken.",
  ].join("\n\n"));
});
