import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightSkillReferences, renderPrompt, skillAutocomplete } from "./editor.ts";

const commands = [
  { name: "skill:review", source: "skill" },
  { name: "skill:release-notes", source: "skill" },
  { name: "skill:secret", source: "extension" },
];
const getSkills = () => commands as ReturnType<Parameters<typeof highlightSkillReferences>[1]>;
const theme = { fg: (_color: string, value: string) => `<accent>${value}</accent>` } as Parameters<typeof highlightSkillReferences>[2];

const fallback = {
  triggerCharacters: ["#"],
  getSuggestions: async () => ({ items: [{ value: "file", label: "file" }], prefix: "f" }),
  applyCompletion: () => ({ lines: ["fallback"], cursorLine: 0, cursorCol: 8 }),
};

test("only discovered skills complete at a dollar-word boundary", async () => {
  const provider = skillAutocomplete(fallback, getSkills);
  assert.deepEqual(provider.triggerCharacters, ["#", "$"]);
  const options = { signal: new AbortController().signal };
  const suggestions = await provider.getSuggestions(["Use $rel and $sec"], 0, 8, options);
  assert.deepEqual(suggestions?.items.map((item) => item.value), ["/skill:release-notes"]);
  assert.deepEqual(suggestions?.prefix, "$rel");
  const result = provider.applyCompletion(["Use $rel and $sec"], 0, 8, suggestions!.items[0]!, suggestions!.prefix);
  assert.deepEqual(result, { lines: ["Use /skill:release-notes and $sec"], cursorLine: 0, cursorCol: 24 });
  assert.deepEqual(provider.applyCompletion(["$release-nope now"], 0, 8, suggestions!.items[0]!, "$release").lines,
    ["/skill:release-notes now"]);
  assert.equal((await provider.getSuggestions(["$"], 0, 1, options))?.items.length, 2);
  assert.equal(await provider.getSuggestions(["$sec"], 0, 4, options), null);
  assert.equal((await provider.getSuggestions(["cost$rel"], 0, 8, options))?.prefix, "f");
  assert.deepEqual(provider.applyCompletion(["f"], 0, 1, { value: "file", label: "file" }, "f").lines, ["fallback"]);
});

test("valid typed references are colored without changing cursor escapes or unknown tokens", () => {
  const cursor = "\x1b_pi:c\x07";
  const lines = [`a /skill:review ${cursor}\x1b[7m/\x1b[0mskill:release-notes /skill:secret`, "/skill:rev", "border ───"];
  const colored = highlightSkillReferences(lines, getSkills, theme);
  assert.match(colored[0]!, /<accent>\/skill:review<\/accent>/);
  assert.match(colored[0]!, /<accent>skill:release-notes<\/accent>/);
  assert.equal(colored[0]!.replace(/<\/?accent>/g, ""), lines[0]);
  assert.ok(colored[0]!.includes("/skill:secret"));
  assert.equal(colored[1], lines[1]);
  assert.equal(colored[2], lines[2]);
  const wrapped = ["/skill:rev", "iew", "/skill:review"];
  const rendered = renderPrompt(wrapped, getSkills, theme);
  assert.deepEqual(rendered.slice(0, 2), wrapped.slice(0, 2));
  assert.equal(rendered[2], "<accent>/skill:review</accent>");
  assert.equal(renderPrompt(["x\x1b[7m/\x1b[0mskill:review"], getSkills, theme)[0],
    "x<accent>/skill:review</accent>");
});
