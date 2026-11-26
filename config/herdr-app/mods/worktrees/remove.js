import { hc, setShared, shared } from "herdr";
import { rowName } from "./data.js";

// Removal and adoption are background tasks: the Tasks panel lists them, and
// their Open button shows this popup again, following the task (props.task).
// `after` holds app commands; the tabs mod runs them once if the task succeeds.
async function startTask(kind, title, argv, repo, after, props) {
  const labels = { "task.kind": kind, "task.title": title, "task.state": "running" };
  const result = await hc(["run", ...(repo.machine ? ["--on", repo.machine] : []), "--bg", "--json", "--outlive-parent", "--no-notify",
    "--name", `${kind}-${Date.now().toString(36)}`, "--cwd", repo.root,
    ...Object.entries(labels).flatMap(([k, v]) => ["--label", `${k}=${v}`]), "--", ...argv]);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Cannot start the task.");
  let started;
  try { started = JSON.parse(result.stdout); } catch {}
  if (!started?.address) throw new Error("Cannot start the task.");
  const address = repo.machine && !started.address.startsWith(`${repo.machine}/`) ? `${repo.machine}/${started.address}` : started.address;
  setShared("tasks.records", { ...(shared("tasks.records") || {}), [address]: {
    address, created_ms: Date.now(), state: "live", labels, onSuccess: after,
    overlay: { mod: "worktrees", kind: "dialog", width: 0.9, height: 0.8,
      props: { task: address, folder: repo.root, machine: repo.machine ?? null, ...props } },
  } });
  return address;
}

// A remote row deletes only the branch on its remote. wt never touches remotes,
// so removing a worktree and its local branch leaves the remote branch alone.
export function startRemoval(r, repo, removeBranch, after) {
  const argv = r.remote
    ? ["git", "-C", repo.root, "push", r.remote, "--delete", r.branch]
    : ["wt", "-C", repo.root, "remove", r.branch, "--yes", "--foreground"];
  if (!r.remote && r.dirty) argv.push("--force");
  if (!r.remote && (removeBranch || (!r.path && !r.merged))) argv.push("--force-delete");
  const title = `${r.remote ? "Delete remote branch" : "Remove worktree"} · ${rowName(r)}`;
  return startTask("worktree-remove", title, argv, repo, after, { row: r, removeBranch });
}

// Adopt: the main checkout ($1) takes over the branch ($3) of a worktree ($2).
// Uncommitted changes go with it through a stash. wt removes the worktree and
// keeps the branch (its hooks run), then the main checkout switches to it. If
// a step fails, the changes stay in the stash and the script prints its id.
export const ADOPT_SCRIPT = `main=$1 path=$2 branch=$3 stash=
unstash() {
  git -C "$1" stash apply "$stash" || { echo "The worktree's changes stay in the stash: $stash" >&2; return 1; }
  ref=$(git -C "$1" stash list --format='%gd %H' | awk -v s="$stash" '$2 == s { print $1; exit }')
  [ -z "$ref" ] || git -C "$1" stash drop -q "$ref"
}
if [ -n "$(git -C "$path" status --porcelain)" ]; then
  git -C "$path" stash push -q --include-untracked -m "adopt $branch" || exit 1
  stash=$(git -C "$path" rev-parse -q --verify refs/stash) || exit 1
fi
if ! wt -C "$main" remove "$branch" --no-delete-branch --yes --foreground; then
  [ -z "$stash" ] || unstash "$path"
  exit 1
fi
if ! git -C "$main" switch "$branch"; then
  [ -z "$stash" ] || echo "The worktree's changes stay in the stash: $stash" >&2
  exit 1
fi
[ -z "$stash" ] || unstash "$main"`;

export function startAdoption(r, repo, mainPath, after) {
  const argv = ["sh", "-c", ADOPT_SCRIPT, "sh", mainPath, r.path, r.branch];
  return startTask("worktree-adopt", `Adopt worktree · ${rowName(r)}`, argv, repo, after, { row: r, adopt: true });
}
