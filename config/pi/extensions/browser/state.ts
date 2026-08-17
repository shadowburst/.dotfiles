export const BROWSER_TOOL_NAMES = [
  "browser_navigate",
  "browser_evaluate",
  "browser_screenshot",
  "browser_pick",
  "browser_input",
  "browser_observe",
  "browser_tabs",
] as const;

const BROWSER_TOOL_NAME_SET = new Set<string>(BROWSER_TOOL_NAMES);

export function initializeBrowserTools(active: string[]): string[] {
  return [...new Set([...active.filter((name) => !BROWSER_TOOL_NAME_SET.has(name)), "browser_tools"])];
}

export function activateBrowserTools(active: string[], requested: readonly string[]): {
  active: string[];
  loaded: string[];
  alreadyActive: string[];
} {
  const activeSet = new Set(active);
  const uniqueRequested = [...new Set(requested)];
  const loaded = uniqueRequested.filter((name) => !activeSet.has(name));
  return {
    active: [...activeSet, ...loaded],
    loaded,
    alreadyActive: uniqueRequested.filter((name) => activeSet.has(name)),
  };
}

export type BrowserEvent = {
  targetId: string;
  timestamp: string;
  [key: string]: unknown;
};

export function appendBounded<T>(items: T[], item: T, limit = 200): T[] {
  return [...items, item].slice(-limit);
}

export function selectEvents<T extends BrowserEvent>(
  items: T[],
  options: { targetId?: string; query?: string; limit?: number },
): T[] {
  const query = options.query?.toLowerCase();
  return items
    .filter((item) => !options.targetId || item.targetId === options.targetId)
    .filter((item) => !query || JSON.stringify(item).toLowerCase().includes(query))
    .slice(-(options.limit ?? 50));
}

export function clearEvents<T extends BrowserEvent>(items: T[], targetId?: string): T[] {
  return targetId ? items.filter((item) => item.targetId !== targetId) : [];
}
