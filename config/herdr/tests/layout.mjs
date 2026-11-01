import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const layout = JSON.parse(readFileSync(new URL("../layouts/personal.json", import.meta.url), "utf8"));
function* nodes(node) {
  yield node;
  for (const child of node.children || []) yield* nodes(child);
}
const blocks = [...nodes(layout)];
const ids = blocks.map(node => node.id);
assert.equal(ids.length, new Set(ids).size);
const tabs = blocks.find(node => node.id === "tabs");
assert.deepEqual(tabs.content, { mod: "auto-tabs" });
assert.deepEqual(tabs.size, { px: 42 });
const status = blocks.find(node => node.id === "status");
assert.deepEqual(status.size, { px: 28 });
assert.deepEqual(status.children.map(child => child.content.mod), ["usage-bar", "workspace-status"]);
assert.ok(existsSync(new URL(`../${layout.preview}`, import.meta.url)));
console.log("Layout checks passed.");
