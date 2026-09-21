import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  demonstrate,
  demonstrationScript,
  pruneRecordings,
  recordScript,
  safeRecordingName,
  type DemonstrationEvent,
} from "./recording.ts";

test("recording names cannot escape the managed directory", () => {
  assert.equal(safeRecordingName("checkout-demo"), "checkout-demo.webm");
  assert.throws(() => safeRecordingName("../demo.webm"));
});

test("an already-cancelled demonstration never opens a page", async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(demonstrate({} as never, {
    message: "cancelled",
    viewport: "desktop",
    signal: abort.signal,
  }), /abort/i);
});

test("demonstrations generate paced actions and redact passwords", () => {
  const events: DemonstrationEvent[] = [
    { kind: "type", selector: "#email", value: "agent@example.com", at: 1 },
    { kind: "type", selector: "#password", secret: true, at: 2 },
    { kind: "click", selector: "button", at: 3 },
    { kind: "navigate", url: "https://example.com/account", at: 4 },
  ];
  const script = demonstrationScript("https://example.com/login", events);
  assert.match(script, /act\.type\("#email", "agent@example.com"\)/);
  assert.match(script, /<REPLACE_WITH_SECRET>/);
  assert.doesNotMatch(script, /act\.goto\("https:\/\/example.com\/account"\)/);
  assert.match(script, /return \{ url: page\.url\(\), title: await page\.title\(\) \}/);
});

test("failed recordings release their filename and return diagnostics", async () => {
  const cache = await mkdtemp(join(tmpdir(), "pi-browser-recording-failure-test-"));
  const previousCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cache;
  const basePage = {
    browser: () => ({ userAgent: async () => "test" }),
    setUserAgent: async () => undefined,
    setViewport: async () => undefined,
  };
  const attempts = [
    {
      script: "throw new Error('script failed')",
      error: "script failed",
      screencast: async ({ path }: { path: string }) => {
        await writeFile(path, "partial");
        return { on: () => undefined, stop: async () => undefined };
      },
    },
    {
      script: "return 'unreachable'",
      error: "ffmpeg pipe failed",
      screencast: async ({ path }: { path: string }) => {
        await writeFile(path, "");
        throw new Error("ffmpeg pipe failed");
      },
    },
  ];

  try {
    for (const [index, attempt] of attempts.entries()) {
      const result = await recordScript({ ...basePage, screencast: attempt.screencast } as never, attempt.script, {
        name: `retryable-${index}`,
        viewport: "desktop",
        delayMs: 0,
      });
      assert.equal(result.error, attempt.error);
      await assert.rejects(stat(result.path), { code: "ENOENT" });
    }
  } finally {
    if (previousCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousCache;
    await rm(cache, { recursive: true, force: true });
  }
});

test("recording retention keeps only the newest files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-recordings-test-"));
  for (let index = 0; index < 3; index++) {
    const path = join(directory, `${index}.webm`);
    await writeFile(path, String(index));
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const removed = await pruneRecordings(directory, 2);
  assert.equal(removed.length, 1);
  await assert.rejects(stat(join(directory, "0.webm")));
  assert.equal((await stat(join(directory, "2.webm"))).isFile(), true);
});
