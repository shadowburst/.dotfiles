// Names each tab after its agent's title, its running program, or its folder
// at the prompt.
// Leaves a tab alone once you rename it yourself.

import { spaces, panes, shared, setShared, run } from "herdr";

// Names the new-tab menu gives agent tabs; we may replace these.
const DEFAULTS = new Set(["Claude Code", "Codex", "Pi", "OpenCode"]);
const TITLE_APPS = new Set(["claude-code", "claude", "codex", "pi", "opencode"]);
const KEY = "tab-titles.set"; // tab id -> the name we gave it

function hasAgentTitle(p) {
  return TITLE_APPS.has(p.app ?? p.program?.key);
}

function nameFor(p) {
  const app = p.app ?? p.program?.key;
  // Claude prefixes a spinner or ✳ while working.
  if (app === "claude-code" || app === "claude") return (p.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (app === "opencode") return (p.title ?? "").replace(/^OC \|\s*/, "").trim();
  if (hasAgentTitle(p)) return (p.title ?? "").trim();
  if (!p.program?.shell) return p.program?.name;
  if (!p.cwd) return null;
  return p.cwd === homeOf(p.cwd) ? "~" : p.cwd.split("/").filter(Boolean).pop();
}

// shortcut: assumes /home/<user> or /root homes, read $HOME if remote machines differ.
function homeOf(cwd) {
  return cwd.match(/^\/home\/[^/]+|^\/root/)?.[0];
}

export function syncNames() {
  const saved = shared(KEY) ?? {};
  const ours = { ...saved };
  const tabs = new Map(spaces().flatMap(s => s.tabs).map(t => [t.id, t]));
  // One pane per tab: its first supported agent, else its first terminal.
  const pick = new Map();
  for (const p of panes()) {
    if (!p.terminal) continue;
    const cur = pick.get(p.tab);
    if (!cur || (hasAgentTitle(p) && !hasAgentTitle(cur))) pick.set(p.tab, p);
  }
  for (const [id, p] of pick) {
    const tab = tabs.get(id);
    const name = nameFor(p);
    if (!tab || !name || tab.name === name) continue;
    if (tab.named && !DEFAULTS.has(tab.name) && ours[tab.id] !== tab.name) continue;
    run("tab.rename", { id: tab.id, name });
    ours[tab.id] = name;
  }
  for (const id of Object.keys(ours)) if (!tabs.has(id)) delete ours[id];
  if (JSON.stringify(ours) !== JSON.stringify(saved)) setShared(KEY, ours);
}
