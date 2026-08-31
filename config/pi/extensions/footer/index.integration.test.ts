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
  cwd?: string;
  branch?: string | null;
  sessionName?: string;
  statuses?: Array<[string, string]>;
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
    cwd: options.cwd ?? `${process.env.HOME}/project/src`,
    model: { id: "gpt-test", provider: "test", reasoning: options.reasoning ?? true, contextWindow: 128_000 },
    thinkingLevel: options.thinkingLevel ?? "high",
    ui: { setFooter(value: typeof factory) { factory = value; } },
    modelRegistry: {
      isUsingOAuth: () => options.usingOAuth ?? false,
      getProvider: () => ({ auth: { oauth: { isSubscription: options.oauthSubscription ?? false } } }),
    },
    sessionManager: {
      getCwd: () => options.cwd ?? `${process.env.HOME}/project/src`,
      getSessionName: () => options.sessionName,
      getEntries: () => options.entries ?? [{ type: "message", message: { role: "assistant", usage: usage() } }],
    },
    getContextUsage: () => options.context ?? { tokens: 12_345, contextWindow: 128_000, percent: 9.6 },
  };
  footerExtension(pi);
  handlers.get("session_start")?.({}, ctx);
  assert.ok(factory, "session_start should install a custom footer");
  const branchCallbacks = new Set<() => void>();
  let renderRequests = 0;
  const tui = { requestRender() { renderRequests++; } };
  const footerData = {
    getGitBranch: () => options.branch === undefined ? "main" : options.branch,
    getExtensionStatuses: () => new Map(options.statuses ?? [["first", "build"], ["second", "lint"]]),
    onBranchChange: (callback: () => void) => { branchCallbacks.add(callback); return () => branchCallbacks.delete(callback); },
  };
  const component = factory(tui, theme, footerData);
  return { component, branchCallbacks, getRenderRequests: () => renderRequests };
}

test("renders the normal footer through the public extension seam", () => {
  const { component } = harness({ sessionName: "API work" });
  const line = component.render(240)[0]!;
  const visible = plain(line);
  const left = "~/project/src │ main │ API work │ ↑1.2k ↓2.3k R4.0k W500 CH70.2% $0.123 9.6%/128k (auto)";
  assert.ok(visible.startsWith(left));
  assert.equal(visible.slice(-15), "gpt-test │ high");
  assert.equal(visible.indexOf("build │ lint"), Math.floor((240 - 12) / 2));
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

test("omits git-only and center-only sections when unavailable", () => {
  const { component } = harness({ branch: null, statuses: [] });
  const line = plain(component.render(200)[0]!);
  assert.ok(line.startsWith("~/project/src │ ↑1.2k ↓2.3k R4.0k W500 CH70.2% $0.123 9.6%/128k (auto)"));
  assert.ok(line.endsWith("gpt-test │ high"));
  assert.ok(!line.includes("main"));
  assert.ok(line.length <= 200);
});

test("renders detached HEAD as the branch section", () => {
  const { component } = harness({ branch: "detached" });
  assert.match(plain(component.render(200)[0]!), /~\/project\/src │ detached │/);
});

test("preserves status text and registration order", () => {
  const { component } = harness({
    statuses: [
      ["z-mcp", "🔌 MCP: 1 server enabled"],
      ["a-ponytail", "○ 🐴 ponytail: ⚡ FULL"],
    ],
  });
  assert.match(
    plain(component.render(240)[0]!),
    /🔌 MCP: 1 server enabled │ ○ 🐴 ponytail: ⚡ FULL/,
  );
});

test("renders a named session as its own section", () => {
  const { component } = harness({ sessionName: "release" });
  assert.match(plain(component.render(240)[0]!), /~\/project\/src │ main │ release │/);
});

test("keeps the branch and model while dropping session and whole low-priority fields", () => {
  const { component } = harness({ sessionName: "a very long session name" });
  const line = plain(component.render(42)[0]!);
  assert.ok(line.startsWith("…"));
  assert.ok(line.includes("main"));
  assert.ok(!line.includes("very long session"));
  assert.ok(!line.includes("↑1.2k"));
  assert.ok(line.endsWith("gpt-test │ high"));
  assert.ok(line.length <= 42);
});

test("truncates the path before dropping complete usage items", () => {
  const { component } = harness({
    cwd: `${process.env.HOME}/a/very/long/project/path`,
    statuses: [],
  });
  const line = plain(component.render(100)[0]!);
  assert.ok(line.startsWith("…"));
  for (const item of ["main", "↑1.2k", "↓2.3k", "R4.0k", "W500", "CH70.2%", "$0.123", "9.6%/128k (auto)"]) {
    assert.ok(line.includes(item), `expected ${item} to remain visible`);
  }
  assert.ok(line.endsWith("gpt-test │ high"));
  assert.ok(line.length <= 100);
  for (const width of [1, 2, 8, 20, 42, 80]) {
    const rendered = component.render(width);
    assert.equal(rendered.length, 1);
    assert.ok(plain(rendered[0]!).length <= width);
  }
});

test("never fragments a branch when it cannot fit", () => {
  const { component } = harness({
    branch: "feature/this-branch-is-too-long",
    statuses: [],
  });
  const line = plain(component.render(20)[0]!);
  assert.equal(line.trim(), "gpt-test │ high");
  assert.ok(line.length <= 20);
});

test("rerenders on branch changes and disposes the subscription", () => {
  const { component, branchCallbacks, getRenderRequests } = harness();
  assert.equal(branchCallbacks.size, 1);
  branchCallbacks.values().next().value!();
  assert.equal(getRenderRequests(), 1);
  component.dispose?.();
  assert.equal(branchCallbacks.size, 0);
});
