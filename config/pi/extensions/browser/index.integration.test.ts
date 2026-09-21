import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const rootUrl = new URL("./", import.meta.url).href;
const indexUrl = new URL("./index.ts", import.meta.url).href;
const packageSources = {
  "@earendil-works/pi-coding-agent": `
    export const DEFAULT_MAX_BYTES = 50000;
    export const DEFAULT_MAX_LINES = 2000;
    export const formatSize = String;
    export const keyHint = () => "expand";
    export const truncateHead = (content) => ({ content, truncated: false });
  `,
  "@earendil-works/pi-ai": `export const StringEnum = (values, options) => ({ values, options });`,
  "@earendil-works/pi-tui": `export class Text { constructor(text) { this.text = text; } }`,
  typebox: `
    const schema = (kind, value, options) => ({ kind, value, options });
    export const Type = {
      Array: (value, options) => schema("array", value, options),
      Boolean: (options) => schema("boolean", undefined, options),
      Integer: (options) => schema("integer", undefined, options),
      Object: (value) => schema("object", value),
      Optional: (value) => schema("optional", value),
      String: (options) => schema("string", undefined, options),
    };
  `,
};

const loaderSource = `
  const rootUrl = ${JSON.stringify(rootUrl)};
  const packageSources = ${JSON.stringify(packageSources)};
  export function resolve(specifier, context, nextResolve) {
    const source = packageSources[specifier];
    if (source !== undefined) return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    return nextResolve(specifier, context);
  }
  export async function load(url, context, nextLoad) {
    if (url.startsWith(rootUrl) && url.endsWith(".ts")) {
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

const { default: browserExtension } = await import(indexUrl);

test("registers the deferred browser tool catalog", () => {
  const tools: Array<{ name: string }> = [];
  const handlers = new Map<string, () => void>();
  let active = ["read", "browser_record"];
  browserExtension({
    getActiveTools: () => active,
    on: (name: string, handler: () => void) => handlers.set(name, handler),
    registerTool: (tool: { name: string }) => tools.push(tool),
    setActiveTools: (next: string[]) => { active = next; },
  });

  assert.deepEqual(tools.map((tool) => tool.name), [
    "browser_tools",
    "browser_navigate",
    "browser_evaluate",
    "browser_screenshot",
    "browser_pick",
    "browser_input",
    "browser_observe",
    "browser_tabs",
    "browser_demonstrate",
    "browser_record",
  ]);
  handlers.get("session_start")?.();
  assert.deepEqual(active, ["read", "browser_tools"]);
});
