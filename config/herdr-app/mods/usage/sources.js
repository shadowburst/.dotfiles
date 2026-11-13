// Where the focused agent's subscription usage comes from: which provider it
// uses, which login to read, and the provider's own usage endpoint.
// Tokens are only read, never refreshed: a refresh rotates them and would log
// the harness that owns them out.

import { exec, hc, home, readTextFile, writeTextFile } from "herdr";

const CLAUDE_URL = "https://api.anthropic.com/api/oauth/usage";
const CODEX_URL = "https://chatgpt.com/backend-api/wham/usage";
const JWT_AUTH = "https://api.openai.com/auth";
// OpenCode logins whose token is Codex-style (it can read usage). The default
// "Sign in with ChatGPT" (chatgpt-token-sharing) cannot: then the Codex CLI's
// login stands in.
const OPENCODE_CODEX_METHODS = ["chatgpt-browser", "chatgpt-headless"];

export const LABELS = { anthropic: "Claude", openai: "ChatGPT" };

// ---- small helpers ---------------------------------------------------------

const object = (v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : undefined);
const number = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp = (v) => Math.max(0, Math.min(100, v));

async function readJson(path) {
  try {
    const text = await readTextFile(path);
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// The runtime has no atob: decode a JWT payload (base64url, ASCII JSON) by hand.
function jwtClaims(token) {
  try {
    const part = token.split(".")[1] ?? "";
    let bits = 0;
    let value = 0;
    let out = "";
    for (const ch of part.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")) {
      const index = B64.indexOf(ch);
      if (index < 0) return undefined;
      value = (value << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out += String.fromCharCode((value >> bits) & 0xff);
      }
    }
    // Byte string: non-ASCII claims come out garbled, but the ones read here are ASCII.
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

// A short, stable file name for an account id (FNV-1a).
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---- which provider the focused agent uses ---------------------------------

// The agent's session id: the record key its report carries (OpenCode), else a
// `-s` / `--session` argument of the program in the foreground.
function sessionArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "-s" || arg === "--session") && argv[i + 1]) return argv[i + 1];
    if (arg.startsWith("--session=")) return arg.slice("--session=".length);
  }
  return undefined;
}

async function terminalFacts(address) {
  try {
    const r = await hc(["get", address, "--json"]);
    return r.code === 0 ? JSON.parse(r.stdout) : undefined;
  } catch {
    return undefined;
  }
}

function recordSession(facts) {
  const records = object(facts?.records);
  if (!records) return undefined;
  const keys = Object.keys(records);
  const title = facts?.status?.title;
  return keys.find((k) => records[k]?.title === title) ?? keys[0];
}

async function opencodeProvider(facts) {
  const session = recordSession(facts) ?? sessionArg(facts?.foreground?.argv ?? []);
  if (!session || !session.startsWith("ses_")) return undefined;
  try {
    const r = await exec("opencode", ["api", "GET", `/api/session/${session}`]);
    const providerID = JSON.parse(r.stdout)?.data?.model?.providerID;
    if (typeof providerID !== "string") return undefined;
    if (providerID === "openai") return { provider: "openai", login: "opencode" };
    if (providerID === "claude-agent" || providerID === "anthropic") return { provider: "anthropic", login: "claude" };
  } catch {}
  return undefined;
}

// Pi gives Herdr no session id: read its session file (from --session, else the
// newest one for its folder), else its default provider.
const PI_SCRIPT = `f="$2"
case "$f" in *.jsonl) ;; *) f=$(ls -t "$1"/*.jsonl 2>/dev/null | head -n 1) ;; esac
[ -n "$f" ] && grep -o '"type":"model_change"[^}]*' "$f" | tail -n 1`;

function piProvider(name) {
  if (name === "openai-codex") return { provider: "openai", login: "pi" };
  if (name === "claude-code" || name === "anthropic") return { provider: "anthropic", login: "claude" };
  return undefined;
}

async function piResolve(facts, cwd) {
  const folder = facts?.foreground?.cwd ?? facts?.cwd ?? cwd;
  const dir = `${home()}/.pi/agent/sessions/--${String(folder ?? "").replace(/^\//, "").replaceAll("/", "-")}--`;
  try {
    const r = await exec("sh", ["-c", PI_SCRIPT, "sh", dir, sessionArg(facts?.foreground?.argv ?? []) ?? ""]);
    const name = r.stdout.match(/"provider":"([^"]+)"/)?.[1];
    if (name) return piProvider(name);
  } catch {}
  const settings = await readJson(`${home()}/.pi/agent/settings.json`);
  return piProvider(settings?.defaultProvider);
}

/** { provider, login } for an agent, or undefined when it has no supported subscription. */
export async function resolveAgent(agent, cwd) {
  const app = agent.app ?? agent.program?.key ?? "";
  if (app === "claude" || app === "claude-code") return { provider: "anthropic", login: "claude" };
  if (app === "codex") return { provider: "openai", login: "codex" };
  if (app === "opencode") return opencodeProvider(await terminalFacts(agent.address));
  if (app === "pi") return piResolve(await terminalFacts(agent.address), cwd);
  return undefined;
}

// ---- logins ----------------------------------------------------------------

async function claudeLogin() {
  const oauth = (await readJson(`${home()}/.claude/.credentials.json`))?.claudeAiOauth;
  if (typeof oauth?.accessToken !== "string") return undefined;
  return { token: oauth.accessToken, account: "claude", expiresAt: number(oauth.expiresAt), plan: oauth.subscriptionType };
}

async function codexLogin() {
  const tokens = (await readJson(`${home()}/.codex/auth.json`))?.tokens;
  if (typeof tokens?.access_token !== "string") return undefined;
  const claims = jwtClaims(tokens.access_token);
  const account = tokens.account_id ?? claims?.[JWT_AUTH]?.chatgpt_account_id;
  if (!account) return undefined;
  return { token: tokens.access_token, account, expiresAt: claims?.exp ? claims.exp * 1000 : undefined };
}

async function piLogin() {
  const auth = (await readJson(`${home()}/.pi/agent/auth.json`))?.["openai-codex"];
  if (typeof auth?.access !== "string") return undefined;
  const account = auth.accountId ?? jwtClaims(auth.access)?.[JWT_AUTH]?.chatgpt_account_id;
  if (!account) return undefined;
  return { token: auth.access, account, expiresAt: number(auth.expires) };
}

const OPENCODE_SCRIPT = `import json, sqlite3, sys
db = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro", uri=True)
row = db.execute("select value from credential where integration_id = 'openai' and active = 1 order by time_updated desc limit 1").fetchone()
value = json.loads(row[0]) if row else {}
print(json.dumps({"method": value.get("methodID"), "access": value.get("access"), "expires": value.get("expires")}))`;

async function opencodeLogin() {
  try {
    const r = await exec("python3", ["-I", "-c", OPENCODE_SCRIPT, `${home()}/.local/share/opencode/opencode.db`]);
    const cred = JSON.parse(r.stdout);
    if (OPENCODE_CODEX_METHODS.includes(cred.method) && typeof cred.access === "string") {
      const account = jwtClaims(cred.access)?.[JWT_AUTH]?.chatgpt_account_id;
      if (account) return { token: cred.access, account, expiresAt: number(cred.expires) };
    }
  } catch {}
  return codexLogin();
}

const LOGINS = { claude: claudeLogin, codex: codexLogin, pi: piLogin, opencode: opencodeLogin };

/** The login to read for a resolved agent, with `key` naming its account's cache. */
export async function loadLogin(target) {
  const login = await LOGINS[target.login]?.();
  return login ? { ...login, key: `${target.provider}-${hash(login.account)}` } : undefined;
}

// ---- usage endpoints and parsing -------------------------------------------

function claudeSnapshot(payload, plan) {
  const windows = [];
  for (const [key, label, seconds, general] of [
    ["five_hour", "General", 18_000, true],
    ["seven_day", "General", 604_800, true],
    ["seven_day_opus", "Opus", 604_800, false],
    ["seven_day_sonnet", "Sonnet", 604_800, false],
  ]) {
    const raw = object(payload[key]);
    const used = number(raw?.utilization);
    if (used === undefined) continue;
    const reset = typeof raw.resets_at === "string" ? Date.parse(raw.resets_at) / 1000 : NaN;
    windows.push({ label, general, seconds, usedPercent: clamp(used), ...(reset > 0 ? { resetsAt: reset } : {}) });
  }
  // Newer limits scoped to one model (e.g. Fable's weekly share).
  for (const limit of Array.isArray(payload.limits) ? payload.limits : []) {
    const name = limit?.scope?.model?.display_name;
    if (limit?.kind !== "weekly_scoped" || typeof name !== "string" || number(limit.percent) === undefined) continue;
    if (windows.some((w) => w.label === name)) continue;
    const reset = typeof limit.resets_at === "string" ? Date.parse(limit.resets_at) / 1000 : NaN;
    windows.push({ label: name, general: false, seconds: 604_800, usedPercent: clamp(limit.percent), ...(reset > 0 ? { resetsAt: reset } : {}) });
  }
  return { ...(plan ? { plan: title(plan) } : {}), windows };
}

function title(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function readCodexLimit(label, general, value, windows) {
  const wrapper = object(value);
  const limit = object(wrapper?.rate_limit) ?? wrapper;
  if (!limit) return;
  for (const key of ["primary_window", "secondary_window"]) {
    const raw = object(limit[key]);
    const used = number(raw?.used_percent);
    if (used === undefined) continue;
    const seconds = number(raw.limit_window_seconds);
    const reset = number(raw.reset_at);
    windows.push({ label, general, usedPercent: clamp(used), ...(seconds ? { seconds } : {}), ...(reset ? { resetsAt: reset } : {}) });
  }
}

function codexSnapshot(payload) {
  const windows = [];
  readCodexLimit("General", true, payload.rate_limit, windows);
  readCodexLimit("Code review", false, payload.code_review_rate_limit, windows);
  for (const entry of Array.isArray(payload.additional_rate_limits) ? payload.additional_rate_limits : []) {
    const name = typeof entry?.limit_name === "string" ? entry.limit_name : typeof entry?.metered_feature === "string" ? title(entry.metered_feature) : "Additional";
    readCodexLimit(name, false, entry?.rate_limit, windows);
  }
  return {
    ...(typeof payload.plan_type === "string" ? { plan: title(payload.plan_type) } : {}),
    ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    windows,
  };
}

/** Fetches a fresh snapshot. Throws with a short message on failure. */
export async function fetchUsage(provider, login) {
  if (provider === "anthropic") {
    const r = await fetch(CLAUDE_URL, {
      headers: { authorization: `Bearer ${login.token}`, "anthropic-beta": "oauth-2025-04-20", accept: "application/json" },
    });
    if (!r.ok) throw new Error(`Claude usage failed (${r.status})`);
    const snapshot = claudeSnapshot(object(await r.json()) ?? {}, login.plan);
    const email = (await readJson(`${home()}/.claude.json`))?.oauthAccount?.emailAddress;
    return typeof email === "string" ? { ...snapshot, email } : snapshot;
  }
  const r = await fetch(CODEX_URL, {
    headers: { authorization: `Bearer ${login.token}`, "chatgpt-account-id": login.account, accept: "application/json", "user-agent": "herdr-usage" },
  });
  if (!r.ok) throw new Error(`ChatGPT usage failed (${r.status})`);
  return codexSnapshot(object(await r.json()) ?? {});
}

// ---- the shared cache: ~/.cache/agent-usage/<provider>-<account>.json -------

const cacheDir = () => `${home()}/.cache/agent-usage`;
let madeDir = false;

/** { snapshot, fetchedAt } or undefined. */
export async function readCache(key) {
  const entry = await readJson(`${cacheDir()}/${key}.json`);
  return Array.isArray(entry?.snapshot?.windows) && number(entry.fetchedAt) ? entry : undefined;
}

export async function writeCache(key, entry) {
  try {
    if (!madeDir) {
      await exec("mkdir", ["-p", "-m", "700", cacheDir()]);
      madeDir = true;
    }
    const path = `${cacheDir()}/${key}.json`;
    await writeTextFile(path, JSON.stringify(entry), await readTextFile(path));
  } catch {
    // Another writer won the race: its value is as good as ours.
  }
}

// ---- display helpers -------------------------------------------------------

/** The bar's window: the general 5h one if it exists, else the weekly, else the shortest. */
export function mainWindow(snapshot) {
  const general = (snapshot?.windows ?? []).filter((w) => w.general);
  return general.find((w) => w.seconds === 18_000)
    ?? general.find((w) => w.seconds === 604_800)
    ?? general.slice().sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity))[0];
}

export function windowName(seconds) {
  if (!seconds) return "";
  for (const [size, unit] of [[604_800, "w"], [86_400, "d"], [3_600, "h"], [60, "m"]]) {
    if (seconds % size === 0) return `${seconds / size}${unit}`;
  }
  return `${Math.round(seconds / 3_600)}h`;
}

export function countdown(resetsAt, now = Date.now() / 1000) {
  if (!resetsAt) return "";
  const s = Math.max(0, Math.round(resetsAt - now));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function age(ms, now = Date.now()) {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

export function maskEmail(email) {
  const at = email.indexOf("@");
  return at < 1 ? "•••" : `${email[0]}•••${email.slice(at)}`;
}

/** Pi's thresholds on what is left: <= 10 % red, <= 30 % yellow, else accent. */
export function barColor(remaining, t) {
  return remaining <= 10 ? t.ansi1 : remaining <= 30 ? t.ansi3 : t.accent;
}
