import { hc, panes, shared, spaces, terminals } from "herdr";

// Puts a live worktree task's terminal in a tab: the space already showing its
// worktree, else a new one. Herdr adopts any terminal with these labels.
export async function placeTask(task) {
  const machine = task.address.includes("/") ? task.address.split("/")[0] : null;
  const path = task.labels["task.path"];
  const existing = path && spaces().find((s) => {
    if ((s.machine ?? null) !== machine) return false;
    const tabs = new Set(s.tabs.map((t) => t.id));
    const cwd = panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
    return cwd === path || cwd?.startsWith(`${path}/`);
  });
  const id = `${task.address.replaceAll("/", "-")}-${task.created_ms}`;
  const space = existing?.id.split("/").at(-1) ?? `sp-task-${id}`;
  const result = await hc(["label", task.address, `herdr.space=${space}`, `herdr.tab=tb-task-${id}`]);
  if (result.code !== 0) throw new Error(result.stderr || "Cannot place the task terminal.");
}

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
