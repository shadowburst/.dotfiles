import { hc, setShared, shared } from "herdr";
import { rowName } from "./data.js";

// Removal is a background task: the Tasks panel lists it, and its Open button
// shows this popup again, following the task (props.task).
// `after` holds app commands; the tabs mod runs them once if wt succeeds.
// A remote row deletes only the branch on its remote. wt never touches remotes,
// so removing a worktree and its local branch leaves the remote branch alone.
export async function startRemoval(r, repo, removeBranch, after) {
  const argv = r.remote
    ? ["git", "-C", repo.root, "push", r.remote, "--delete", r.branch]
    : ["wt", "-C", repo.root, "remove", r.branch, "--yes", "--foreground"];
  if (!r.remote && r.dirty) argv.push("--force");
  if (!r.remote && (removeBranch || (!r.path && !r.merged))) argv.push("--force-delete");
  const title = `${r.remote ? "Delete remote branch" : "Remove worktree"} · ${rowName(r)}`;
  const labels = { "task.kind": "worktree-remove", "task.title": title, "task.state": "running" };
  const result = await hc(["run", ...(repo.machine ? ["--on", repo.machine] : []), "--bg", "--json", "--outlive-parent", "--no-notify",
    "--name", `worktree-remove-${Date.now().toString(36)}`, "--cwd", repo.root,
    ...Object.entries(labels).flatMap(([k, v]) => ["--label", `${k}=${v}`]), "--", ...argv]);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Cannot start the removal.");
  let started;
  try { started = JSON.parse(result.stdout); } catch {}
  if (!started?.address) throw new Error("Cannot start the removal.");
  const address = repo.machine && !started.address.startsWith(`${repo.machine}/`) ? `${repo.machine}/${started.address}` : started.address;
  setShared("tasks.records", { ...(shared("tasks.records") || {}), [address]: {
    address, created_ms: Date.now(), state: "live", labels, onSuccess: after,
    overlay: { mod: "worktrees", kind: "dialog", width: 0.9, height: 0.8,
      props: { task: address, folder: repo.root, machine: repo.machine ?? null, row: r, removeBranch } },
  } });
  return address;
}
