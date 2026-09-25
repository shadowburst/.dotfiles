import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const indexUrl = new URL("./index.ts", import.meta.url).href;
const packages = {
  "@earendil-works/pi-coding-agent": `
    export function getMarkdownTheme() { return {
      heading: (text) => '\\x1b[1m' + text + '\\x1b[0m',
      listBullet: (text) => '\\x1b[36m' + text + '\\x1b[0m',
      italic: (text) => '\\x1b[3m' + text + '\\x1b[0m',
      bold: (text) => '\\x1b[1m' + text + '\\x1b[0m',
      code: (text) => '\\x1b[33m' + text + '\\x1b[0m',
    }; }
    export class CustomEditor {
      focused = true;
      text = "";
      cursor = undefined;
      constructor(tui, theme) {
        this.tui = tui;
        this.borderColor = theme.borderColor ?? ((text) => text);
      }
      handleInput(data) { this.text += data; }
      getText() { return this.text; }
      getExpandedText() { return this.text; }
      getCursor() {
        if (this.cursor) return this.cursor;
        const lines = this.text.split("\\n");
        return { line: lines.length - 1, col: lines.at(-1).length };
      }
      isShowingAutocomplete() { return false; }
      setText(text) { this.text = text; }
      render(width) {
        const cursor = this.getCursor();
        return ["─".repeat(width), ...this.text.split("\\n").map((line, index) =>
          " " + (this.focused && index === cursor.line
            ? line.slice(0, cursor.col) + "\\x1b_pi:c\\x07" + line.slice(cursor.col)
            : line).padEnd(width - 1)), "─".repeat(width)];
      }
    }
  `,
  "@earendil-works/pi-tui": `
    export const CURSOR_MARKER = "\\x1b_pi:c\\x07";
    export const matchesKey = (data, key) => data === key;
    export const visibleWidth = (text) => text.replace(/\\x1b\\[[0-9;]*m|\\x1b_pi:c\\x07/g, "").length;
    export const sliceByColumn = (text, start, length) => text.slice(start, start + length);
    export const truncateToWidth = (text, width, _ellipsis, pad = false) => {
      const value = text.slice(0, width);
      return pad ? value.padEnd(width) : value;
    };
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

test("prompt styles source Markdown without changing rows or cursor and Ctrl+S restores stashed text", async () => {
  const handlers = new Map<string, Function>();
  const pi = {
    on: (event: string, handler: Function) => handlers.set(event, handler),
    getCommands: () => [{ name: "skill:review", source: "skill" }],
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
      theme: {
        fg: (color: string, text: string) => color === "accent" ? `<accent>${text}</accent>` : text,
      },
      addAutocompleteProvider: () => {},
      setEditorComponent: (factory: Function) => {
        editor = factory(
          { requestRender: () => {}, terminal: { rows: 24 } },
          { borderColor: (text: string) => text },
          {},
        );
      },
      getEditorText: () => editor.getText(),
      setEditorText: (text: string) => editor.setText(text),
      setWidget: (_key: string, content: unknown) => { widget = content; },
    },
  };
  handlers.get("session_start")!({}, ctx);
  editor.setText("# heading\n*italic* and **bold** /skill:review\n> quoted text\n- list\n`code`\n");
  editor.cursor = { line: 1, col: 2 };
  const rendered = editor.render(80);
  assert.equal(rendered.length, 8); // One row per source line, including the trailing blank line, plus borders.
  const unstyled = rendered.slice(1, -1).map((line) => line
    .replace(/\x1b\[[0-9;]*m|\x1b_pi:c\x07|<\/?accent>/g, "").trimEnd());
  assert.deepEqual(unstyled, editor.getText().split("\n").map((line: string) => ` ${line}`.trimEnd()));
  assert.match(rendered[1]!, /\x1b\[1m# heading\x1b\[0m/);
  assert.match(rendered[2]!, /\x1b\[3m\*i\x1b_pi:c\x07talic\*\x1b\[0m/);
  assert.match(rendered[2]!, /\x1b\[1m\*\*bold\*\*\x1b\[0m/);
  assert.match(rendered[2]!, /<accent>\/skill:review<\/accent>/);
  assert.match(rendered[3]!, /^ > quoted text\s*$/);
  assert.match(rendered[4]!, /\x1b\[36m-\x1b\[0m list/);
  assert.match(rendered[5]!, /\x1b\[33m`code`\x1b\[0m/);
  assert.equal(rendered[6]!.trim(), "");
  assert.equal(editor.getText(), "# heading\n*italic* and **bold** /skill:review\n> quoted text\n- list\n`code`\n");
  editor.cursor = { line: 5, col: 0 };
  assert.equal(editor.render(80).findIndex((line) => line.includes("\x1b_pi:c\x07")), 6);
  editor.setText("test\ntest\n- ");
  editor.cursor = { line: 2, col: 2 };
  const unfinished = editor.render(80);
  assert.equal(unfinished.length, 5);
  assert.match(unfinished[3]!, /\x1b\[36m-\x1b\[0m \x1b_pi:c\x07/);

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
