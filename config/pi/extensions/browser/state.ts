export const BROWSER_TOOL_NAMES = [
  "browser_open",
  "browser_action",
  "browser_screenshot",
  "browser_record",
  "browser_handoff",
] as const;

export function initializeBrowserTools(active: string[]): string[] {
  return [...new Set([...active.filter((name) => !name.startsWith("browser_") || name === "browser_tools"), "browser_tools"])];
}

export function activateBrowserTools(active: string[], requested: readonly string[]) {
  const unique = [...new Set(requested)];
  return {
    active: [...new Set([...active, ...unique])],
    loaded: unique.filter((name) => !active.includes(name)),
    alreadyActive: unique.filter((name) => active.includes(name)),
  };
}
