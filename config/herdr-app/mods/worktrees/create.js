import { appHome, exec, hc, readTextFile, setShared, shared } from "herdr";
import { agentArgv } from "./data.js";

// Only submission belongs to the dialog. The core owns setup, naming and the agent.
export async function startCreation(spec, repo, cfg) {
  const source = await readTextFile(`${appHome()}/mods/worktrees/create.py`);
  if (!source) throw new Error("The worktree task runner is missing.");
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `New worktree · ${repo.name || repo.root.split("/").pop()}`;
  // Tasks shows "Naming the branch…" until this label exists.
  const labels = { "task.kind": "worktree", "task.title": title, "task.state": "running",
    ...(spec.branch ? { "task.branch": spec.branch } : {}) };
  const task = { ...spec, root: repo.root,
    naming: repo.machine ? ["textgen"] : cfg?.naming_command,
    agent: spec.prompt ? agentArgv(spec.agent, spec.sel) : [] };
  const saved = await exec("sh", ["-c", 'umask 077 && d="$HOME/.cache/herdr-worktrees" && mkdir -p "$d" && f=$(mktemp "$d/task-XXXXXXXX") && printf %s "$1" > "$f" && printf %s "$f"', "sh", JSON.stringify(task)], { on: repo.machine });
  if (saved.code !== 0 || !saved.stdout.trim()) throw new Error(`Cannot save the background task: ${saved.stderr}`);
  const file = saved.stdout.trim();
  try {
    const result = await hc(["run", ...(repo.machine ? ["--on", repo.machine] : []), "--bg", "--json", "--outlive-parent", "--no-notify",
      "--name", `worktree-${id}`, "--cwd", repo.root,
      ...Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]), "--", "python3", "-c", source, file]);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Cannot start the background task.");
    const started = JSON.parse(result.stdout);
    if (!started.address) throw new Error("Cannot start the background task.");
    const address = repo.machine && !started.address.startsWith(`${repo.machine}/`) ? `${repo.machine}/${started.address}` : started.address;
    setShared("tasks.records", { ...(shared("tasks.records") || {}), [address]: {
      address, created_ms: Date.now(), state: "live", labels,
    } });
    return address;
  } catch (error) {
    await exec("rm", ["-f", "--", file], { on: repo.machine });
    throw error;
  }
}
