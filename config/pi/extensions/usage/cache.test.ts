import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SharedUsageCache } from "./cache.ts";
import type { UsageSnapshot } from "./state.ts";

test("shares refreshed usage snapshots between Pi processes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-usage-cache-"));
  const reader = new SharedUsageCache(directory);
  const writer = new SharedUsageCache(directory);
  const expected: UsageSnapshot = { plan: "Pro", windows: [{ label: "General", usedPercent: 42 }] };

  try {
    let resolveObserved!: (snapshot: UsageSnapshot) => void;
    const observed = new Promise<UsageSnapshot>((resolve) => { resolveObserved = resolve; });
    await reader.start(["openai-codex"], (_provider, snapshot) => resolveObserved(snapshot));
    await writer.start([], () => {});

    await writer.write("openai-codex", expected);
    const timeout = setTimeout(() => resolveObserved({ windows: [] }), 2_000);
    assert.deepEqual(await observed, expected);
    clearTimeout(timeout);
  } finally {
    reader.close();
    writer.close();
    await rm(directory, { recursive: true, force: true });
  }
});
