import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const extensionUrl = new URL("./auto-title.ts", import.meta.url).href;
const loaderSource = `
  const extensionUrl = ${JSON.stringify(extensionUrl)};
  export async function load(url, context, nextLoad) {
    if (url === extensionUrl) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const { stripTypeScriptTypes } = await import("node:module");
      return {
        format: "module",
        shortCircuit: true,
        source: stripTypeScriptTypes(await readFile(fileURLToPath(url), "utf8"), { mode: "transform" }),
      };
    }
    return nextLoad(url, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { default: autoTitle } = await import(extensionUrl);

test("starts naming as soon as the first prompt starts", async () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  let completeCalls = 0;
  let sessionName: string | undefined;
  let finishCompletion!: (response: unknown) => void;
  const completion = new Promise((resolve) => { finishCompletion = resolve; });
  const pi = {
    getSessionName: () => sessionName,
    on: (event: string, handler: (...args: any[]) => any) => handlers.set(event, handler),
    setSessionName: (name: string) => { sessionName = name; },
  };
  const ctx = {
    sessionManager: {
      getEntries: () => [],
      getSessionFile: () => "/tmp/session.jsonl",
      getSessionName: () => sessionName,
    },
    modelRegistry: {
      complete: () => { completeCalls++; return completion; },
      find: () => ({}),
      hasConfiguredAuth: () => true,
    },
  };

  autoTitle(pi);
  handlers.get("session_start")?.({ reason: "startup" }, ctx);
  handlers.get("before_agent_start")?.({ prompt: "Fix question flow" }, ctx);

  assert.equal(completeCalls, 1);
  assert.equal(handlers.has("agent_settled"), false);

  finishCompletion({
    stopReason: "stop",
    content: [{ type: "text", text: "Fix question flow" }],
  });
  await completion;
  await new Promise(setImmediate);
  assert.equal(sessionName, "Fix question flow");
});
