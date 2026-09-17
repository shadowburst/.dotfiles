import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const indexUrl = new URL("./index.ts", import.meta.url).href;
const packageSources = {
  "@earendil-works/pi-coding-agent": `
    export const SettingsManager = {
      create: () => {
        if (globalThis.__footerCompactionError) throw new Error("settings unavailable");
        return { getCompactionEnabled: () => globalThis.__footerCompactionEnabled ?? true };
      },
    };
  `,
  "@earendil-works/pi-tui": `
    export const visibleWidth = (text) => text.replace(/\\x1b\\[[0-9;]*m/g, "").length;
    export const truncateToWidth = (text, width, ellipsis = "…", fromStart = false) => {
      const plain = text.replace(/\\x1b\\[[0-9;]*m/g, "");
      if (plain.length <= width) return text;
      if (width <= 0) return "";
      const suffix = ellipsis.slice(0, width);
      return fromStart ? suffix + plain.slice(-(width - suffix.length)) : plain.slice(0, width - suffix.length) + suffix;
    };
  `,
};

const loaderSource = `
  const indexUrl = ${JSON.stringify(indexUrl)};
  const packageSources = ${JSON.stringify(packageSources)};
  export function resolve(specifier, context, nextResolve) {
    const source = packageSources[specifier];
    if (source !== undefined) return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    return nextResolve(specifier, context);
  }
  export async function load(url, context, nextLoad) {
    if (url === indexUrl) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const { stripTypeScriptTypes } = await import("node:module");
      return { format: "module", shortCircuit: true, source: stripTypeScriptTypes(await readFile(fileURLToPath(url), "utf8"), { mode: "transform" }) };
    }
    return nextLoad(url, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { default: footerExtension } = await import(indexUrl);

const plain = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, "");
const theme = {
  fg: (_color: string, text: string) => `\u001b[2m${text}\u001b[0m`,
  bold: (text: string) => text,
};

function usage(input = 1_200) {
  return { input, output: 2_300, cacheRead: 4_000, cacheWrite: 500, cost: { total: 0.123 } };
}

function harness(options: {
  width?: number;
  entries?: unknown[];
  context?: { tokens: number | null; contextWindow: number; percent: number | null };
  reasoning?: boolean;
  thinkingLevel?: string;
  usingOAuth?: boolean;
  oauthSubscription?: boolean;
} = {}) {
  let factory: ((tui: unknown, theme: unknown, footerData: unknown) => { render(width: number): string[]; dispose?(): void }) | undefined;
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) { handlers.set(event, handler); },
  };
  const ctx = {
    mode: "tui",
    cwd: `${process.env.HOME}/project/src`,
    model: { id: "gpt-test", provider: "test", reasoning: options.reasoning ?? true, contextWindow: 128_000 },
    thinkingLevel: options.thinkingLevel ?? "high",
    ui: { setFooter(value: typeof factory) { factory = value; } },
    modelRegistry: {
      isUsingOAuth: () => options.usingOAuth ?? false,
      getProvider: () => ({ auth: { oauth: { isSubscription: options.oauthSubscription ?? false } } }),
    },
    sessionManager: {
      getEntries: () => options.entries ?? [{ type: "message", message: { role: "assistant", usage: usage() } }],
    },
    getContextUsage: () => options.context ?? { tokens: 12_345, contextWindow: 128_000, percent: 9.6 },
  };
  footerExtension(pi);
  handlers.get("session_start")?.({}, ctx);
  assert.ok(factory, "session_start should install a custom footer");
  const component = factory({ requestRender() {} }, theme, {});
  return { component };
}

test("renders the normal footer through the public extension seam", () => {
  const { component } = harness();
  const line = component.render(240)[0]!;
  const visible = plain(line);
  assert.ok(visible.startsWith(" gpt-test │ high"));
  assert.ok(visible.endsWith("↑1.2k ↓2.3k R4.0k W500 CH70.2% $0.123 9.6%/128k (auto) "));
  assert.equal(line.includes("\n"), false);
  assert.ok(visible.length <= 240);
});

test("marks only subscription-backed OAuth usage with the pricing marker", () => {
  const subscription = harness({ usingOAuth: true, oauthSubscription: true });
  assert.match(plain(subscription.component.render(200)[0]!), /\$0\.123 \(sub\)/);

  const ordinaryOAuth = harness({ usingOAuth: true, oauthSubscription: false });
  assert.doesNotMatch(plain(ordinaryOAuth.component.render(200)[0]!), /\(sub\)/);
});

test("omits auto-compaction when settings are unavailable", () => {
  (globalThis as Record<string, unknown>).__footerCompactionError = true;
  try {
    const { component } = harness();
    assert.doesNotMatch(plain(component.render(200)[0]!), /\(auto\)/);
  } finally {
    delete (globalThis as Record<string, unknown>).__footerCompactionError;
  }
});

test("omits path, branch, session, and extension statuses", () => {
  const { component } = harness();
  const line = plain(component.render(200)[0]!);
  for (const removed of ["~/project/src", "main", "release", "build", "lint"]) {
    assert.ok(!line.includes(removed));
  }
});

test("keeps the model while dropping low-priority fields", () => {
  const { component } = harness();
  const line = plain(component.render(20)[0]!);
  assert.equal(line.trim(), "gpt-test │ high");
  assert.ok(line.length <= 20);
});

test("drops complete usage items as space shrinks", () => {
  const { component } = harness();
  const line = plain(component.render(100)[0]!);
  for (const item of ["↑1.2k", "↓2.3k", "R4.0k", "W500", "CH70.2%", "$0.123", "9.6%/128k (auto)"]) {
    assert.ok(line.includes(item), `expected ${item} to remain visible`);
  }
  assert.ok(line.startsWith(" gpt-test │ high"));
  assert.ok(line.length <= 100);
  for (const width of [1, 2, 8, 20, 42, 80]) {
    const rendered = component.render(width);
    assert.equal(rendered.length, 1);
    assert.ok(plain(rendered[0]!).length <= width);
  }
});
