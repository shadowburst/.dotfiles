// The automations, their runs, and the programs that run them. No UI here.
// Everything stays on this computer, in ~/.local/state/herdr-automations (runner.py).

import { appHome, exec, hc, home, panes, readTextFile, run, setShared, shared, spaces, terminals, writeTextFile } from "herdr";

export const folder = () => `${home()}/.local/state/herdr-automations`;
const file = () => `${folder()}/automations.json`;
const runner = (...args) => ["-I", `${appHome()}/mods/automations/runner.py`, folder(), ...args];

export const tilde = (path) => (path === home() || path.startsWith(`${home()}/`) ? `~${path.slice(home().length)}` : path);

async function read() {
  const raw = await readTextFile(file());
  if (raw === null) return { raw, list: [] };
  try {
    return { raw, list: JSON.parse(raw).automations ?? [] };
  } catch {
    throw new Error(`${tilde(file())} is not valid JSON.`);
  }
}

export const loadAutomations = async () => (await read()).list;

// edit(list) returns the new list. Read again and redo if another writer was first.
export async function changeAutomations(edit) {
  for (let attempt = 1; ; attempt++) {
    const { raw, list } = await read();
    if (raw === null) {
      const made = await exec("mkdir", ["-p", "-m", "700", folder()]);
      if (made.code !== 0) throw new Error(made.stderr || `Cannot create ${tilde(folder())}.`);
    }
    const next = edit(list);
    try {
      await writeTextFile(file(), `${JSON.stringify({ automations: next }, null, 2)}\n`, raw);
      return next;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

// { automation id: runs, newest first }
export async function loadRuns() {
  const r = await exec("python3", runner("list"));
  if (r.code !== 0) throw new Error(r.stderr.trim() || "Cannot read the runs.");
  return JSON.parse(r.stdout);
}

export async function deleteAutomation(id) {
  const r = await exec("python3", runner("delete", id));
  if (r.code !== 0) throw new Error(r.stderr.trim() || "Cannot delete the runs.");
  return changeAutomations((list) => list.filter((a) => a.id !== id));
}

// { answer, log }: for a prompt, read again from the agent's transcript.
export async function loadOutput(id, name) {
  const r = await exec("python3", runner("output", id, name));
  if (r.code !== 0) throw new Error(r.stderr.trim() || "Cannot read the output.");
  return JSON.parse(r.stdout);
}

// hc prints its errors as JSON.
async function core(args) {
  const result = await hc(args);
  if (result.code === 0) return result.stdout;
  let text = result.stderr.trim();
  try { text = JSON.parse(text).error.message; } catch {}
  throw new Error(text || `hc ${args[0]} failed.`);
}

// The live terminals that run automations. Two automations can have runs of the same
// name (the same scheduled minute), so a run's key has both.
export const runKey = (id, name) => `${id}/${name}`;
export const terminalKey = (t) => runKey(t.labels["automation.id"], t.labels["automation.run"]);
export const liveRuns = () => terminals().filter((t) => t.state !== "finished" && t.labels?.["automation.id"]);

// The run's name makes a scheduled minute run once, also after a reload of the mod.
export async function start(automation, trigger, at = Date.now()) {
  const name = trigger === "schedule" ? `s${Math.floor(at / 60_000)}` : `m${at}`;
  const started = JSON.parse(await core(["run", "--bg", "--json", "--outlive-parent", "--no-notify", "--cwd", home(), "--label", `automation.id=${automation.id}`, "--label", `automation.run=${name}`,
    "--", "python3", ...runner("run", automation.id, name, trigger)]));
  // The floating copy notifies when it ends and removes its terminal.
  setShared("automations.pending", { ...(shared("automations.pending") ?? {}), [runKey(automation.id, name)]: { at, address: started.address } });
  return name;
}

// Herdr does not list finished terminals, so the address comes from the start. A failure
// does not matter: the terminal can be gone already.
export const removeTerminal = (address) => hc(["rm", address]).catch(() => null);

// ---- agents: a prompt run's hidden terminal, with the status that its program reports ----

export const agentTerminals = () => terminals().filter((t) => t.state !== "finished" && t.labels?.["automation.agent"]);
export const agentTerminal = (id, name) => agentTerminals().find((t) => t.labels["automation.agent"] === id && t.labels["automation.run"] === name);
// One that the person gave a tab is theirs: it does not count as a run.
export const busyAgent = (id) => agentTerminals().find((t) => t.labels["automation.agent"] === id && !t.labels["herdr.space"] && ["working", "blocked"].includes(t.status));
// As Herdr does for agents in tabs: finished until a person looks, then idle.
export function agentStatus(t) {
  if (!["idle", "done"].includes(t.status)) return t.status ?? "starting";
  if (!t.turn) return "starting";
  return t.turn > Number(t.labels["herdr.seen"] ?? 0) ? "done" : "idle";
}
export const markSeen = (t) => hc(["label", t.address, `herdr.seen=${t.turn}`]).catch(() => null);
export const agentSignature = () => agentTerminals().map((t) => [t.address, agentStatus(t)]);

// The runner ends its program and records the run as stopped.
export async function stop(id, name) {
  const terminal = liveRuns().find((t) => terminalKey(t) === runKey(id, name)) ?? agentTerminal(id, name);
  if (!terminal) throw new Error("This run is not active.");
  await core(["kill", terminal.address]);
}

// Shows a prompt run's live agent, over the tab (its window can keep it as a tab). One that
// ended continues its session in a tab of the space that shows its folder, else a new one.
export function openAgent(automation, meta) {
  const terminal = agentTerminal(automation.id, meta.id);
  if (terminal) return run(terminal.labels["herdr.space"] ? "agent.focus" : "terminal.peek", { terminal: terminal.address });
  const path = meta.folder.replace(/^~(?=\/|$)/, home());
  const argv = {
    claude: ["claude", "--resume", meta.session],
    codex: ["codex", "--no-daemon", "-c", `projects={${JSON.stringify(path)}={trust_level="trusted"}}`, "resume", meta.session],
    opencode: ["opencode", "--session", meta.session],
  }[meta.harness];
  const space = spaces().find((s) => {
    if (s.machine) return false;
    const tabs = new Set(s.tabs.map((t) => t.id));
    const cwd = panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
    return cwd === path || cwd?.startsWith(`${path}/`);
  });
  if (space) run("tab.new", { space: space.id, folder: path, name: automation.name, argv });
  else run("space.new", { folder: path, tab: automation.name, argv, machine: "" });
}

// ---- harnesses: the choices of the Worktrees mod (worktrees.json, written by Nix) ----

export const HARNESSES = { claude: "Claude Code", codex: "Codex", opencode: "OpenCode" };

export async function loadHarnesses() {
  const cfg = JSON.parse((await readTextFile(`${appHome()}/worktrees.json`)) ?? "{}");
  return { agents: cfg.agents ?? {}, providers: cfg.opencode?.providers ?? [] };
}

async function opencodeApi(path) {
  const r = await exec("timeout", ["20", "opencode", "api", "get", path], { cwd: home() });
  if (r.code !== 0) throw new Error(`opencode api get ${path}: ${(r.stderr || r.stdout).trim()}`);
  return JSON.parse(r.stdout).data ?? [];
}

// OpenCode's chat models: [{ provider, group, model, label, efforts }].
export async function loadOpencodeModels(providers) {
  const [models, known] = await Promise.all([opencodeApi("/api/model"), opencodeApi("/api/provider")]);
  const names = Object.fromEntries(known.map((p) => [p.id, p.name]));
  const ids = providers.length ? providers : [...new Set(models.map((m) => m.providerID))];
  return ids.flatMap((id) => models
    .filter((m) => m.providerID === id && m.type !== "image" && m.enabled !== false && m.status !== "deprecated")
    .map((m) => ({ provider: id, group: names[id] ?? id, model: m.id, label: m.name || m.id,
      efforts: (m.variants ?? []).map((v) => (typeof v === "string" ? v : v.id)) })));
}
