import assert from "node:assert/strict";
import test from "node:test";
import { activateBrowserTools, initializeBrowserTools } from "./state.ts";

test("browser tools start deferred without disabling other tools", () => {
  assert.deepEqual(initializeBrowserTools(["read", "browser_open", "browser_navigate", "browser_tools", "browser_record"]), ["read", "browser_tools"]);
});

test("browser tool activation is additive and idempotent", () => {
  assert.deepEqual(activateBrowserTools(["read", "browser_tools", "browser_open"], ["browser_open", "browser_action"]), {
    active: ["read", "browser_tools", "browser_open", "browser_action"],
    loaded: ["browser_action"],
    alreadyActive: ["browser_open"],
  });
});
