import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const indexUrl = new URL("./index.ts", import.meta.url).href;
const packages = {
  "@earendil-works/pi-coding-agent": `
    export class CustomEditor {
      focused = true;
      text = "";
      constructor(tui) { this.tui = tui; }
      handleInput(data) { this.text += data; }
      getText() { return this.text; }
      setText(text) { this.text = text; }
      render() { return [this.text]; }
    }
  `,
  "@earendil-works/pi-tui": `
    export const matchesKey = (data, key) => data === key;
    export class Text { constructor(text) { this.text = text; } }
  `,
};
register(`data:text/javascript,${encodeURIComponent(`
  const packages = ${JSON.stringify(packages)};
  const indexUrl = ${JSON.stringify(indexUrl)};
  export function resolve(specifier, context, nextResolve) {
    if (packages[specifier]) return {
      url: "data:text/javascript," + encodeURIComponent(packages[specifier]),
      shortCircuit: true,
    };
    return nextResolve(specifier, context);
  }
  export async function load(url, context, nextLoad) {
    if (url === indexUrl) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const { stripTypeScriptTypes } = await import("node:module");
      const source = await readFile(fileURLToPath(url), "utf8");
      return { format: "module", shortCircuit: true, source: stripTypeScriptTypes(source, { mode: "transform" }) };
    }
    return nextLoad(url, context);
  }
`)}`, import.meta.url);

const { default: promptExtension } = await import("./index.ts");

test("Ctrl+S stashes the prompt and restores it only after a submitted turn settles", async () => {
  const handlers = new Map<string, Function>();
  const pi = {
    on: (event: string, handler: Function) => handlers.set(event, handler),
    getCommands: () => [],
  };
  promptExtension(pi as Parameters<typeof promptExtension>[0]);

  let editor: any;
  let widget: any;
  let idle = true;
  const ctx = {
    mode: "tui",
    hasUI: true,
    isIdle: () => idle,
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      addAutocompleteProvider: () => {},
      setEditorComponent: (factory: Function) => {
        editor = factory({ requestRender: () => {} }, {}, {});
      },
      getEditorText: () => editor.getText(),
      setEditorText: (text: string) => editor.setText(text),
      setWidget: (_key: string, content: unknown) => { widget = content; },
    },
  };
  handlers.get("session_start")!({}, ctx);
  editor.onSubmit = () => { idle = false; };
  editor.setText("saved prompt");
  editor.handleInput("ctrl+s");
  assert.equal(editor.getText(), "");
  assert.equal(widget(null, ctx.ui.theme).text, "saved prompt");

  editor.setText("new prompt");
  editor.onSubmit("new prompt");
  await Promise.resolve();
  assert.equal(editor.getText(), "new prompt");
  idle = true;
  handlers.get("agent_settled")!({}, ctx);
  assert.equal(editor.getText(), "saved prompt");
  assert.equal(widget, undefined);

  editor.handleInput("ctrl+s");
  editor.handleInput("ctrl+s");
  assert.equal(editor.getText(), "saved prompt");
});
