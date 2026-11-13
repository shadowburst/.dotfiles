// Subscription limits of every account the harnesses here are logged in to.
// As T3 Code does, each harness answers for its own login (Claude Code's
// get_usage, codex app-server's account/rateLimits/read), so it renews its own
// token. OpenCode has no such API. Its Claude login is Claude Code's. Its default
// ChatGPT login ("Sign in with ChatGPT") cannot read usage or tell its account;
// only a legacy Codex-style login can, read over HTTP with its token (only read,
// never renewed).

import { appHome, exec, home, readTextFile, writeTextFile } from "herdr";

const CODEX_URL = "https://chatgpt.com/backend-api/wham/usage";
const JWT_AUTH = "https://api.openai.com/auth";
// OpenCode logins whose token can read usage. Its default "Sign in with ChatGPT"
// (chatgpt-token-sharing) cannot, and Codex then stands for that account.
const OPENCODE_CODEX_METHODS = ["chatgpt-browser", "chatgpt-headless"];

export const PROVIDERS = {
  claude: { label: "Claude", icon: "icons/claude.svg", color: "#d97757", manage: "https://claude.ai/settings/usage" },
  chatgpt: { label: "ChatGPT", icon: "icons/codex.svg", color: null, manage: "https://chatgpt.com/#settings/Usage" },
};

// ---- helpers ---------------------------------------------------------------

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

// The runtime has no atob: decode a JWT payload (base64url JSON) by hand.
// Non-ASCII claims come out garbled; the ones read here are ASCII.
function jwtClaims(token) {
  try {
    let bits = 0;
    let value = 0;
    let out = "";
    for (const ch of (token.split(".")[1] ?? "").replace(/=+$/, "")) {
      const index = B64.indexOf(ch);
      if (index < 0) return undefined;
      value = (value << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out += String.fromCharCode((value >> bits) & 0xff);
      }
    }
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

// A short, stable name for an account id (FNV-1a), so ids stay out of file names.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function title(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- windows ----------------------------------------------------------------
// A window: { id, label, minutes?, usedPercent, resetsAt? (ms) }

const SESSION_MINS = 5 * 60;
const WEEK_MINS = 7 * 24 * 60;
const MONTH_MINS = 30 * 24 * 60;

function kindLabel(minutes) {
  return minutes >= MONTH_MINS ? "Monthly" : minutes >= WEEK_MINS ? "Weekly" : "Session";
}

function isoMs(value) {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

function claudeWindows(limits) {
  const windows = [];
  for (const [key, label, minutes] of [["five_hour", "Session", SESSION_MINS], ["seven_day", "Weekly", WEEK_MINS]]) {
    const raw = object(limits?.[key]);
    const used = number(raw?.utilization);
    if (used === undefined) continue;
    windows.push({ id: key, label, minutes, usedPercent: clamp(used), resetsAt: isoMs(raw.resets_at) });
  }
  // Weekly allowances that count only one model (e.g. Fable).
  for (const raw of Array.isArray(limits?.model_scoped) ? limits.model_scoped : []) {
    const used = number(raw?.utilization);
    if (used === undefined || typeof raw.display_name !== "string") continue;
    windows.push({ id: `model:${raw.display_name}`, label: `${raw.display_name} weekly`, minutes: WEEK_MINS, usedPercent: clamp(used), resetsAt: isoMs(raw.resets_at) });
  }
  return windows;
}

// codex app-server's snapshot. primary/secondary are positions: without a
// duration, paid plans mean 5 hours / weekly, Free and Go mean monthly (T3 Code's rule).
function codexWindows(byLimitId) {
  const windows = [];
  for (const [limitId, snapshot] of Object.entries(byLimitId ?? {})) {
    if (!object(snapshot)) continue;
    const monthly = snapshot.planType === "free" || snapshot.planType === "go";
    const prefix = limitId === "codex" ? "" : `${snapshot.limitName ?? title(limitId)} `;
    for (const [position, fallback] of [["primary", monthly ? MONTH_MINS : SESSION_MINS], ["secondary", WEEK_MINS]]) {
      const raw = object(snapshot[position]);
      const used = number(raw?.usedPercent);
      if (used === undefined) continue;
      const minutes = number(raw.windowDurationMins) ?? fallback;
      const label = kindLabel(minutes);
      windows.push({
        id: `${limitId}:${position}`,
        label: prefix ? `${prefix}${label.toLowerCase()}` : label,
        minutes,
        usedPercent: clamp(used),
        resetsAt: number(raw.resetsAt) ? raw.resetsAt * 1000 : undefined,
      });
    }
    const individual = object(snapshot.individualLimit);
    if (limitId === "codex" && number(individual?.remainingPercent) !== undefined) {
      windows.push({ id: "individual", label: "Monthly credit limit", usedPercent: clamp(100 - individual.remainingPercent), resetsAt: number(individual.resetsAt) ? individual.resetsAt * 1000 : undefined });
    }
  }
  return windows;
}

// The ChatGPT HTTP answer (an OpenCode legacy login), in the same shape.
function whamWindows(payload) {
  const windows = [];
  const read = (prefix, id, value) => {
    const limit = object(object(value)?.rate_limit) ?? object(value);
    for (const position of ["primary_window", "secondary_window"]) {
      const raw = object(limit?.[position]);
      const used = number(raw?.used_percent);
      if (used === undefined) continue;
      const minutes = number(raw.limit_window_seconds) ? raw.limit_window_seconds / 60 : position === "primary_window" ? SESSION_MINS : WEEK_MINS;
      const label = kindLabel(minutes);
      windows.push({ id: `${id}:${position}`, label: prefix ? `${prefix} ${label.toLowerCase()}` : label, minutes, usedPercent: clamp(used), resetsAt: number(raw.reset_at) ? raw.reset_at * 1000 : undefined });
    }
  };
  read("", "codex", payload.rate_limit);
  for (const entry of Array.isArray(payload.additional_rate_limits) ? payload.additional_rate_limits : []) {
    const name = typeof entry?.limit_name === "string" ? entry.limit_name : typeof entry?.metered_feature === "string" ? title(entry.metered_feature) : "Additional";
    read(name, name, entry?.rate_limit);
  }
  return windows;
}

// ---- accounts ---------------------------------------------------------------
// An account: { key, provider, sources: ["Codex", …], load(): Promise<snapshot> }
// A snapshot: { plan?, email?, windows }

const probe = async (harness) => {
  const r = await exec("python3", ["-I", `${appHome()}/mods/usage/probe.py`, harness]);
  let answer;
  try {
    answer = JSON.parse(r.stdout);
  } catch {
    throw new Error(`The ${harness} probe failed`);
  }
  if (answer.error) throw new Error(answer.error);
  return answer;
};

async function claudeAccount() {
  if (!(await readJson(`${home()}/.claude/.credentials.json`))?.claudeAiOauth) return undefined;
  const profile = (await readJson(`${home()}/.claude.json`))?.oauthAccount;
  return {
    key: `claude-${hash(profile?.accountUuid ?? profile?.emailAddress ?? "default")}`,
    provider: "claude",
    sources: ["Claude Code"],
    load: async () => {
      const usage = (await probe("claude")).usage;
      if (usage?.rate_limits_available === false) throw new Error("This login has no plan limits");
      return {
        ...(usage?.subscription_type ? { plan: title(usage.subscription_type) } : {}),
        ...(profile?.emailAddress ? { email: profile.emailAddress } : {}),
        windows: claudeWindows(usage?.rate_limits),
      };
    },
  };
}

async function codexAccount() {
  const tokens = (await readJson(`${home()}/.codex/auth.json`))?.tokens;
  const id = tokens?.account_id ?? (tokens?.access_token ? jwtClaims(tokens.access_token)?.[JWT_AUTH]?.chatgpt_account_id : undefined);
  if (!id) return undefined;
  return {
    id,
    key: `chatgpt-${hash(id)}`,
    provider: "chatgpt",
    sources: ["Codex"],
    load: async () => {
      const { account, limits } = await probe("codex");
      const plan = limits?.rateLimits?.planType ?? account?.account?.planType;
      return {
        ...(plan && plan !== "unknown" ? { plan: title(plan) } : {}),
        ...(account?.account?.email ? { email: account.account.email } : {}),
        windows: codexWindows(limits?.rateLimitsByLimitId ?? { codex: limits?.rateLimits }),
      };
    },
  };
}

// A login only read, for harnesses that cannot tell their own usage.
function httpAccount(source, id, token, expiresAt) {
  return {
    id,
    key: `chatgpt-${hash(id)}`,
    provider: "chatgpt",
    sources: [source],
    load: async () => {
      if (expiresAt && expiresAt <= Date.now()) throw new Error(`${source}'s login has expired: open ${source} to renew it`);
      const r = await fetch(CODEX_URL, {
        headers: { authorization: `Bearer ${token}`, "chatgpt-account-id": id, accept: "application/json", "user-agent": "herdr-usage" },
      });
      if (!r.ok) throw new Error(`ChatGPT refused the usage request (${r.status})`);
      const payload = object(await r.json()) ?? {};
      return {
        ...(typeof payload.plan_type === "string" ? { plan: title(payload.plan_type) } : {}),
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
        windows: whamWindows(payload),
      };
    },
  };
}

// OpenCode's active logins: whether it uses Claude Code's (claude-agent), and its
// ChatGPT one (method and token).
const OPENCODE_SCRIPT = `import json, sqlite3, sys
db = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro", uri=True)
rows = db.execute("select integration_id, value from credential where active = 1 and integration_id in ('openai', 'claude-agent') order by time_updated").fetchall()
logins = {integration: json.loads(value) for integration, value in rows}
openai = logins.get("openai", {})
print(json.dumps({"claude": "claude-agent" in logins, "method": openai.get("methodID"), "access": openai.get("access"), "expires": openai.get("expires")}))`;

async function opencodeLogins() {
  try {
    const r = await exec("python3", ["-I", "-c", OPENCODE_SCRIPT, `${home()}/.local/share/opencode/opencode.db`]);
    return JSON.parse(r.stdout);
  } catch {
    return {};
  }
}

function opencodeAccount(logins) {
  if (!OPENCODE_CODEX_METHODS.includes(logins.method) || typeof logins.access !== "string") return undefined;
  const id = jwtClaims(logins.access)?.[JWT_AUTH]?.chatgpt_account_id;
  return id ? httpAccount("OpenCode", id, logins.access, number(logins.expires)) : undefined;
}

/** Every account, once each: a ChatGPT account several harnesses share is read through the first. */
export async function discoverAccounts() {
  const [claude, codex, opencode] = await Promise.all([claudeAccount(), codexAccount(), opencodeLogins()]);
  // OpenCode's claude-agent runs Claude Code, so it spends Claude Code's login.
  if (claude && opencode.claude) claude.sources.push("OpenCode");
  const found = [claude, codex, opencodeAccount(opencode)].filter(Boolean);
  const accounts = [];
  for (const account of found) {
    const same = accounts.find((a) => a.key === account.key);
    if (same) same.sources.push(...account.sources);
    else accounts.push(account);
  }
  return accounts;
}

// ---- cache: ~/.cache/agent-usage/<provider>-<account>.json ------------------

const cacheDir = () => `${home()}/.cache/agent-usage`;
let madeDir = false;

/** { snapshot, fetchedAt } or undefined. Older entries (before this shape) are ignored. */
export async function readCache(key) {
  const entry = await readJson(`${cacheDir()}/${key}.json`);
  const ok = number(entry?.fetchedAt) && Array.isArray(entry?.snapshot?.windows) && entry.snapshot.windows.every((w) => typeof w?.id === "string");
  return ok ? entry : undefined;
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

// ---- pacing tick and text -----------------------------------------------------

/** Share of the window still to run, 0..100, or null without a reset time and length. */
export function timeLeftPercent(window, now) {
  if (!window.resetsAt || !window.minutes) return null;
  const left = (window.resetsAt - now) / (window.minutes * 60_000);
  return Math.round(Math.max(0, Math.min(1, left)) * 100);
}

export function duration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function resetText(window, now) {
  if (!window.resetsAt) return "No reset time";
  if (window.resetsAt <= now) return "Resets now";
  const at = new Date(window.resetsAt);
  const clock = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const sameDay = new Date(now).toDateString() === at.toDateString();
  return `Resets in ${duration(window.resetsAt - now)} · ${sameDay ? "" : `${DAYS[at.getDay()]} `}${clock}`;
}

export function age(ms, now) {
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

/** Thresholds on what is left: <= 10 % red, <= 30 % yellow, else the provider's color. */
export function fillColor(remaining, base, t) {
  return remaining <= 10 ? t.ansi1 : remaining <= 30 ? t.ansi3 : base;
}
