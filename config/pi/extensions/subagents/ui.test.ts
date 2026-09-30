import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { setImmediate as tick } from "node:timers/promises";
import { test } from "node:test";

// Like question's SDK-boundary harness, without loading child lifecycle code.
// Extract only the UI region; production classes need no test-only exports.
const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const ui = source.slice(source.indexOf("function panel("), source.indexOf("async function shutdownChildSession("));
const widthSdk = process.env.PI_UI_REAL_TUI
  ? `import { visibleWidth, truncateToWidth, wrapTextWithAnsi } from ${JSON.stringify(process.env.PI_UI_REAL_TUI)};`
  : `
  const plain = text => text.replace(/\\x1b\\[[0-9;]*m|\\x1b_pi:c\\x07/g, "");
  const visibleWidth = text => Array.from(plain(text)).length;
  const truncateToWidth = (text, width) => visibleWidth(text) <= width ? text : Array.from(plain(text)).slice(0, Math.max(0, width)).join("");
  const wrapTextWithAnsi = (text, width) => text.split("\\n").flatMap(line => {
    const lines = []; while (line.length > width) { lines.push(line.slice(0, width)); line = line.slice(width); }
    return [...lines, line];
  });`;
const sdk = widthSdk + `
  import { orderAgentsForList, transcriptForView } from ${JSON.stringify(new URL("./state.ts", import.meta.url).href)};
  const Key = { ctrl: key => "ctrl+" + key, escape: "escape", enter: "enter" };
  const matchesKey = (data, key) => data === key;
  ${process.env.PI_UI_REAL_TUI ? `
  import { Input as RealInput } from ${JSON.stringify(process.env.PI_UI_REAL_TUI)};
  class Input extends RealInput { handleInput(data) { super.handleInput(data === "enter" ? "\\r" : data); } }
  ` : `class Input {
    value = ""; focused = false;
    getValue() { return this.value; } setValue(value) { this.value = value; }
    handleInput(data) { if (data === "enter") this.onSubmit?.(this.value); else this.value += data; }
    render(width) { return [truncateToWidth(this.value, width) + (this.focused ? "\\x1b_pi:c\\x07" : "")]; }
    invalidate() {}
  }`}
  class Markdown { constructor(text) { this.text = text; } render(width) { return wrapTextWithAnsi(this.text.replace(/\\*\\*(.*?)\\*\\*/g, "$1"), width); } }
  const getMarkdownTheme = () => ({});
  const SPINNER = ["⠋", "⠙"];
  const elapsed = () => "1.0s";
`;
const screens = `function screens(context, records, steer, cancel) {
  const openTuis = new Set();
  const allRecords = () => [...records.values()];
  ${source.slice(source.indexOf("  const showDetail ="), source.indexOf("  function snapshotCatalog("))}
  return { showManager, showDetail, openTuis };
}`;
const module = await import(`data:text/javascript,${encodeURIComponent(sdk + stripTypeScriptTypes(ui + screens, { mode: "transform" }) + "\nexport { AgentList, AgentDetail, AgentWidget, visibleWidth, screens };")}`);
const { AgentList, AgentDetail, AgentWidget, visibleWidth } = module;
const theme = {
  fg: (_color: string, text: string) => `\x1b[36m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
};
const keys = { matches: (data: string, id: string) => data === ({
  "tui.select.up": "up", "tui.select.down": "down", "tui.select.pageUp": "pageup",
  "tui.select.pageDown": "pagedown", "tui.select.confirm": "enter", "tui.select.cancel": "escape",
} as Record<string, string>)[id] };
const tui = { terminal: { rows: 24 }, requestRender() {} };
const plain = (lines: string[]) => lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
function record(overrides = {}) {
  return { id: "a", description: "Investigate", prompt: "Task", status: "running", model: "provider/model", effort: "high",
    transcript: [], responseText: "", activeTools: new Map(), listOrder: 1, lingerTurns: 0,
    usage: { tokens: 100, contextWindow: 1000, percent: 10 }, ...overrides };
}

test("dashboard fills the overlay, preserves metadata and confirms stop without closing", async () => {
  const a = record({ description: "東京 👩‍💻 é Investigate", status: "queued", worktreePath: "/tmp/tree", worktreeBranch: "branch" });
  let stopped = 0, closed = 0;
  const list = new AgentList(tui, theme, keys, () => [a], () => closed++, async () => { stopped++; });
  try {
    for (const width of [1, 20, 80, 160]) {
      const lines = list.render(width);
      assert.equal(lines.length, tui.terminal.rows - 1);
      assert.ok(lines.every((line: string) => visibleWidth(line) <= width));
    }
    assert.match(plain(list.render(160)), /waiting for a slot.*\/tmp\/tree.*branch/);
    assert.match(plain(list.render(160)).split("\n")[1]!, /^╭─+╮$/, "border has no redundant agents label");
    assert.match(plain(list.render(160)), /model.*ctx 10.0%.*1.0s/);
    assert.match(plain(list.render(80)), /model.*ctx 10.0%.*1.0s/);
    list.handleInput("x");
    assert.match(plain(list.render(80)), /x again to STOP/);
    list.handleInput("escape");
    assert.equal(closed, 0);
    list.handleInput("x"); list.handleInput("x");
    await tick();
    assert.equal(stopped, 1);
    assert.match(plain(list.render(80)), /Stop requested/);
    list.handleInput("escape");
    assert.equal(closed, 1);
  } finally { list.dispose(); }
});

test("detail keeps composer drafts and typed x separate from stop; errors never replace output", async () => {
  const a = record({ transcript: [{ role: "assistant", text: "Live output" }], responseText: "Live output", activeTools: new Map([["tool", "bash"]]) });
  let stopped = 0, closed = 0;
  const steers: string[] = [];
  const detail = new AgentDetail(tui, theme, keys, a, () => closed++, (message: string) => { steers.push(message); }, () => { stopped++; });
  try {
    detail.focused = true;
    const initial = plain(detail.render(160));
    assert.match(initial, /Live output/); assert.match(initial, /Tools: bash/);
    assert.equal(initial.split("Live output").length, 2, "live output is not duplicated");
    detail.handleInput("enter"); detail.handleInput("x"); detail.handleInput("x");
    assert.match(plain(detail.render(160)), /xx\x1b_pi:c\x07/);
    assert.equal(stopped, 0);
    detail.handleInput("enter"); await tick();
    assert.deepEqual(steers, ["xx"]);
    detail.handleInput("draft"); detail.handleInput("ctrl+x");
    assert.match(plain(detail.render(160)), /Ctrl\+X again to STOP/);
    detail.handleInput("escape"); assert.equal(closed, 0);
    detail.handleInput("ctrl+x"); detail.handleInput("ctrl+x"); await tick();
    assert.equal(stopped, 1);
    assert.match(plain(detail.render(160)), /draft\x1b_pi:c\x07/);
    detail.handleInput("escape"); detail.handleInput("x"); detail.handleInput("x"); await tick();
    assert.equal(stopped, 2, "x twice stops in transcript mode");
    a.status = "completed";
    detail.handleInput("enter"); assert.deepEqual(steers, ["xx"]);
    a.status = "unresponsive";
    detail.handleInput("x"); detail.handleInput("x"); await tick();
    assert.equal(stopped, 2);
    assert.doesNotMatch(plain(detail.render(160)), /x twice stop/);
    a.uiError = "Explicit failure";
    assert.match(plain(detail.render(160)), /error: Explicit failure/);
    assert.equal(a.responseText, "Live output");
    for (const width of [1, 20, 80, 160]) {
      const lines = detail.render(width);
      assert.equal(lines.length, tui.terminal.rows - 1);
      assert.ok(lines.every((line: string) => visibleWidth(line) <= width));
    }
  } finally { detail.dispose(); }
});

test("tool output uses the same Markdown renderer as assistant output", () => {
  const a = record({ transcript: [{ role: "tool", text: "bash:\n**Readable summary**\n- First result" }] });
  const detail = new AgentDetail(tui, theme, keys, a, () => {}, () => {}, () => {});
  try {
    const output = plain(detail.render(160));
    assert.match(output, /\[Tool\]/);
    assert.match(output, /Readable summary/);
    assert.doesNotMatch(output, /\*\*Readable summary\*\*/);
  } finally { detail.dispose(); }
});

test("dashboard shares animated and terminal status icons with the main-thread widget", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const records = [record(), record({ id: "b", status: "completed", completedAt: 1, lingerTurns: 1 })];
  const list = new AgentList(tui, theme, keys, () => records, () => {}, () => {});
  const widget = new AgentWidget(tui, theme, () => records);
  try {
    const output = plain(list.render(160));
    assert.match(output, /⠋ Investigate/);
    assert.match(output, /✓ Investigate/);
    assert.doesNotMatch(output, /\b(?:running|completed)\b/);
    assert.match(plain(widget.render(160)), /⠋/);
    t.mock.timers.tick(80);
    assert.match(plain(list.render(160)), /⠙ Investigate/);
    assert.match(plain(widget.render(160)), /⠙/);
  } finally { list.dispose(); widget.dispose(); }
});

test("callback rejections are visible; widget shows stopping and terminal unresponsive", async () => {
  const a = record();
  const detail = new AgentDetail(tui, theme, keys, a, () => {}, async () => { throw new Error("steer broke"); }, async () => { throw new Error("stop broke"); });
  try {
    detail.handleInput("enter"); detail.handleInput("keep draft"); detail.handleInput("enter"); await tick();
    assert.match(a.uiError, /steer broke/); assert.match(plain(detail.render(160)), /keep draft/);
    detail.handleInput("ctrl+x");
    assert.match(plain(detail.render(160)), /Ctrl\+X again to STOP/);
    assert.doesNotMatch(plain(detail.render(160)), /error: Steer failed/);
    detail.handleInput("ctrl+x"); await tick();
    assert.match(a.uiError, /stop broke/);
  } finally { detail.dispose(); }
  const widget = new AgentWidget(tui, theme, () => [record({ status: "stopping" }), record({ id: "b", status: "unresponsive", lingerTurns: 2 })]);
  try {
    assert.match(plain(widget.render(160)), /stopping/);
    assert.match(plain(widget.render(160)), /unresponsive/);
  } finally { widget.dispose(); }
});

test("screen overlays retain selection and dispose the original components without recursion", async () => {
  const a = record(), b = record({ id: "b", listOrder: 2 });
  const records = new Map([[a.id, a], [b.id, b]]);
  let calls = 0;
  let screens: ReturnType<typeof module.screens>;
  const context = { mode: "tui", ui: {
    custom: async (factory: Function, options: unknown) => {
      assert.deepEqual(options, { overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" } });
      let result: string | undefined;
      const component = factory(tui, theme, keys, (value?: string) => { result = value; });
      try {
        assert.equal(screens.openTuis.size, 1);
        if (calls++ === 0) {
          component.handleInput("down"); // Select a, not newest b.
          component.handleInput("enter");
          assert.equal(result, "a");
        } else if (calls === 2) {
          component.handleInput("escape"); // Detail closes; no stop.
        } else {
          component.handleInput("enter"); // Dashboard restores a.
          assert.equal(result, "a");
          result = undefined;
        }
      } finally {
        component.dispose();
        component.dispose(); // Idempotent, original timer cleanup stays reachable.
        assert.equal(screens.openTuis.size, 0);
      }
      return result;
    },
  } };
  screens = module.screens(context, records, () => assert.fail("unexpected steer"), () => assert.fail("unexpected stop"));
  await screens.showManager();
  assert.equal(calls, 3);
});
