import assert from "node:assert/strict";
import test from "node:test";

import {
  activateBrowserTools,
  appendBounded,
  clearEvents,
  initializeBrowserTools,
  selectEvents,
  type BrowserEvent,
} from "./state.ts";

const events: BrowserEvent[] = [
  { targetId: "a", timestamp: "1", message: "ready" },
  { targetId: "b", timestamp: "2", message: "failed request" },
  { targetId: "a", timestamp: "3", message: "failed render" },
];

test("browser tools start deferred without disabling other tools", () => {
  assert.deepEqual(
    initializeBrowserTools(["read", "browser_navigate", "browser_tools", "browser_tabs"]),
    ["read", "browser_tools"],
  );
});

test("browser tool activation is additive and idempotent", () => {
  assert.deepEqual(
    activateBrowserTools(
      ["read", "browser_tools", "browser_navigate"],
      ["browser_navigate", "browser_evaluate"],
    ),
    {
      active: ["read", "browser_tools", "browser_navigate", "browser_evaluate"],
      loaded: ["browser_evaluate"],
      alreadyActive: ["browser_navigate"],
    },
  );
});

test("bounded events retain the newest entries", () => {
  assert.deepEqual(appendBounded([1, 2], 3, 2), [2, 3]);
});

test("event selection combines tab, text, and newest-first limits", () => {
  assert.deepEqual(selectEvents(events, { targetId: "a", query: "FAILED", limit: 1 }), [events[2]]);
});

test("event clearing can target one tab or every tab", () => {
  assert.deepEqual(clearEvents(events, "a"), [events[1]]);
  assert.deepEqual(clearEvents(events), []);
});
