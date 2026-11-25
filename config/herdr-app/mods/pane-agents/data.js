// The sub-agents under each pane's agent, and showing one in that pane for now.
// hc helpers have a terminal of their own (`parent`). OpenCode's children have none: a
// temporary viewer (`opencode --session`, labelled VIEWER) is started to show one, and ended after.

import { exec, focused, hc, panes, run, setShared, shared, terminals } from "herdr";

const VIEWER = "pane-agents.session";
const RECENT = 30 * 60000; // a finished OpenCode child stays listed this long
const RANK = { blocked: 0, working: 1, done: 2, idle: 3 };
// Sessions whose viewer is being started: not in terminals() yet, so not to be tidied away.
const starting = new Set();
// pane -> when its view was last asked for: Herdr needs a moment before focused() says so.
const asked = new Map();
const SETTLE = 500;

// pane -> the sub-agent (terminal address or session) it shows in place of its own terminal.
export const shown = () => shared("pane-agents.shown") ?? {};
const children = () => shared("pane-agents.children") ?? [];
function put(key, value) {
  if (JSON.stringify(shared(key) ?? null) !== JSON.stringify(value)) setShared(key, value);
}
function mark(pane, key) {
  const next = { ...shown() };
  if (key) next[pane] = key;
  else delete next[pane];
  put("pane-agents.shown", next);
}

const live = (t) => t.state === "live";
const local = (t) => !t.address.includes("/");
const viewers = () => terminals().filter((t) => live(t) && local(t) && t.labels?.[VIEWER]);
const isSession = (key) => key.startsWith("ses_");
const addressOf = (key) => (isSession(key)
  ? viewers().find((t) => t.labels[VIEWER] === key)
  : terminals().find((t) => live(t) && t.address === key))?.address ?? null;

// One pane's sub-agents: those its agent started, and those these started; the most urgent first.
// One with a pane of its own is on screen already.
export function subAgents(pane) {
  const ps = panes(), all = terminals();
  const own = ps.find((p) => p.pane === pane)?.terminal;
  if (!own) return [];
  const byAddress = new Map(all.map((t) => [t.address, t]));
  const placed = new Set(ps.map((p) => p.terminal));
  const under = (address) => {
    for (const seen = new Set(); address && !seen.has(address); address = byAddress.get(address)?.parent) {
      if (address === own) return true;
      if (placed.has(address)) return false;
      seen.add(address);
    }
    return false;
  };
  const helpers = all
    .filter((t) => live(t) && t.parent && !placed.has(t.address) && !t.labels?.[VIEWER] && (t.status != null || t.program?.agent) && under(t.parent))
    .map((t) => ({ key: t.address, name: t.name || t.template || t.program?.name || t.address, tag: "hc", status: t.status === "error" ? "blocked" : t.status ?? "idle" }));
  const sessions = children().filter((c) => under(c.terminal)).map((c) => ({ key: c.id, name: c.name, tag: c.agent ?? "OpenCode", status: c.status }));
  return [...helpers, ...sessions].sort((x, y) => (RANK[x.status] ?? 4) - (RANK[y.status] ?? 4) || x.name.localeCompare(y.name));
}

// The OpenCode sessions under each OpenCode terminal. `sessions`, `active`: the service's answers;
// `waiting`: the ids with a question or permission request open.
export function childSessions(sessions, active, waiting, all, keep, now) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const root = (s) => {
    for (const seen = new Set(); s?.parentID && !seen.has(s.id); s = byId.get(s.parentID)) seen.add(s.id);
    return s;
  };
  const agents = all.filter((t) => live(t) && local(t) && t.program?.key === "opencode" && !t.labels?.[VIEWER]);
  return sessions.flatMap((s) => {
    const running = Boolean(active[s.id]);
    if (!s.parentID || (!running && !keep.includes(s.id) && now - (s.time.idle ?? s.time.updated) > RECENT)) return [];
    const top = root(s);
    if (!top) return [];
    // The terminal's own record names its session; an idle one has only the title.
    const owner = agents.find((t) => t.records?.[top.id]) ?? agents.find((t) => t.report?.title === top.title);
    if (!owner) return [];
    return [{ id: s.id, name: s.title, agent: s.agent, status: waiting.has(s.id) ? "blocked" : running ? "working" : "done", terminal: owner.address, dir: s.location?.directory ?? null }];
  });
}

async function api(script, args = []) {
  const r = await exec("sh", ["-c", script, "sh", ...args], { timeout: 10000 });
  if (r.code !== 0) throw new Error(r.stderr || "OpenCode's service didn't answer.");
  return r.stdout.split("\x1e").filter((s) => s.trim()).map((s) => JSON.parse(s).data);
}

export async function poll() {
  // Without an OpenCode terminal there is no service to ask (asking would start one).
  if (!terminals().some((t) => live(t) && local(t) && t.program?.key === "opencode")) return put("pane-agents.children", []);
  const [active, sessions] = await api('opencode api get /api/session/active && printf "\\036" && opencode api get "/api/session?limit=100"');
  const running = sessions.filter((s) => s.parentID && active[s.id]).map((s) => s.id);
  const open = running.length
    ? await api('for s; do opencode api get "/api/session/$s/form" && printf "\\036" && opencode api get "/api/session/$s/permission" && printf "\\036" || exit 1; done', running)
    : [];
  const waiting = new Set(running.filter((_id, i) => open[2 * i]?.length || open[2 * i + 1]?.length));
  put("pane-agents.children", childSessions(sessions, active, waiting, terminals(), Object.values(shown()), Date.now()));
}

// The viewer of an OpenCode child, once the app knows it.
async function view(key) {
  const dir = children().find((c) => c.id === key)?.dir;
  const r = await hc(["run", "--bg", "--json", "--rm", "--no-notify", "--no-parent", "--label", `${VIEWER}=${key}`, ...(dir ? ["--cwd", dir] : []), "--", "opencode", "--session", key]);
  if (r.code !== 0) throw new Error(r.stderr || r.stdout || "Cannot open the sub-agent.");
  const { address } = JSON.parse(r.stdout);
  for (let n = 0; n < 30 && !terminals().some((t) => t.address === address); n++) await exec("sleep", ["0.1"]);
  return address;
}

function display(pane, address) {
  asked.set(pane, Date.now());
  run("terminal.show", { pane, terminal: address });
}

// Gives a pane the keyboard. pane.focus puts its own terminal back, so what it shows comes again.
export function focus(pane) {
  run("pane.focus", { pane });
  const key = shown()[pane], address = key && addressOf(key);
  if (address) display(pane, address);
}

// Shows a sub-agent in the pane for now; without one, the pane's own terminal again.
export async function show(pane, key) {
  if ((shown()[pane] ?? null) === (key ?? null)) {
    if (focused()?.pane !== pane) focus(pane);
    return;
  }
  mark(pane, key);
  run("pane.focus", { pane });
  if (!key) {
    run("terminal.show", { pane });
    return tidy();
  }
  // The choice is marked at once; a later click wins over a viewer still starting.
  let address = addressOf(key);
  if (!address && isSession(key) && !starting.has(key)) {
    starting.add(key);
    try {
      address = await view(key);
    } catch (error) {
      if (shown()[pane] === key) { mark(pane, null); run("terminal.show", { pane }); }
      throw error;
    } finally {
      starting.delete(key);
    }
  }
  if (address && shown()[pane] === key) display(pane, address);
  tidy();
}

// Other ways to a pane (the Inbox, the agents keys) put its own terminal back: the tabs follow.
export function reconcile() {
  const f = focused(), key = f?.pane && shown()[f.pane];
  if (!key || starting.has(key) || Date.now() - (asked.get(f.pane) ?? 0) < SETTLE) return;
  if (f.shown === addressOf(key)) return;
  mark(f.pane, null);
  tidy();
}

// Panes whose sub-agent ended get their own terminal back, and viewers nobody shows end.
// A helper is never ended: it only stops being shown.
export function tidy() {
  const ids = new Set(panes().map((p) => p.pane));
  for (const [pane, key] of Object.entries(shown())) {
    if (ids.has(pane) && (starting.has(key) || addressOf(key))) continue;
    if (ids.has(pane)) run("terminal.show", { pane });
    mark(pane, null);
  }
  const wanted = new Set([...Object.values(shown()), ...starting]);
  for (const t of viewers()) if (!wanted.has(t.labels[VIEWER])) run("terminal.kill", { terminal: t.address });
}

// Every pane back to its own terminal (a start, a layout switch, the window closing).
export function restore() {
  const ids = new Set(panes().map((p) => p.pane));
  for (const pane of Object.keys(shown())) if (ids.has(pane)) run("terminal.show", { pane });
  put("pane-agents.shown", {});
  tidy();
}
