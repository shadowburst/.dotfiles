import { shared, terminals } from "herdr";

// Any core terminal with task.kind joins this list, not only worktree jobs.
// shortcut: unregistered short jobs can be missed; register new launchers in tasks.records.
export function taskEntries() {
  const records = { ...(shared("tasks.records") || {}) };
  for (const t of terminals()) if (t.labels?.["task.kind"]) records[t.address] = { ...records[t.address], ...t };
  return Object.values(records).map((t) => {
    const state = t.labels["task.state"] || (t.state === "finished" ? "ready" : "running");
    const failed = state === "failed" || (t.state === "finished" && t.exit_code !== 0);
    return { ...t, title: t.labels["task.title"] || t.name || "Background task",
      failed, active: !failed && t.state !== "finished" && state !== "ready", path: t.labels["task.path"],
      branch: t.labels["task.branch"], log: t.labels["task.log"], warning: t.labels["task.warning"], error: t.labels["task.error"] };
  }).sort((a, b) => b.created_ms - a.created_ms);
}
