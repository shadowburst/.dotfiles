// Read-only Linux account quotas. Never print credentials or raw exceptions.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

export class Unavailable extends Error {
  constructor(message, code = "unavailable", action = null) {
    super(message);
    this.code = code;
    this.action = action;
  }
}

export const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
export const window = (label, percent, reset = null) => number(percent) === null ? null : { label, used: percent, reset };

function loadJson(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Unavailable("Cannot read sign-in data; sign in again in the provider app.");
  }
}

export async function request(url, headers) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "HerdrUsageBar/1.0", ...headers },
      redirect: "manual", signal: AbortSignal.timeout(10000) });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Unavailable("Usage endpoint redirected; provider integration needs an update.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      const errors = {
        401: ["Your sign-in was rejected or has expired (HTTP 401).", "expired", "Sign in again in this provider's app, then refresh."],
        403: ["The provider refused access to usage (HTTP 403).", "forbidden", "Check the account's subscription and usage permissions. This does not confirm an inactive subscription."],
        429: ["The provider is rate limiting usage requests (HTTP 429).", "rate_limited", "Wait a few minutes, then refresh."],
      };
      throw new Unavailable(...(errors[response.status] || [`Provider returned HTTP ${response.status}.`]));
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1024 * 1024) throw new Unavailable("Usage response is too large.");
      chunks.push(chunk);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
      throw new Unavailable("Unexpected usage response; provider integration needs an update.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Unavailable("Unexpected usage response; provider integration needs an update.");
    }
    return data;
  } catch (error) {
    if (error instanceof Unavailable) throw error;
    throw new Unavailable("The usage service could not be reached.", "offline", "Check your connection, then refresh.");
  }
}

export function parseCodex(data) {
  const rate = data.rate_limit || {};
  return [["primary_window", "Current"], ["secondary_window", "7d"]].flatMap(([key, fallback]) => {
    const item = rate[key] || {};
    const seconds = number(item.limit_window_seconds);
    const label = seconds === 604800 ? "7d" : seconds === 18000 ? "5h" : seconds
      ? seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d` : fallback;
    const value = window(label, item.used_percent, item.reset_at);
    return value ? [value] : [];
  });
}

export function parseCodexCredits(data) {
  const credits = data.credits;
  if (!credits || typeof credits !== "object" || Array.isArray(credits)) return null;
  const raw = credits.balance;
  let balance = null;
  const match = (typeof raw === "string" || typeof raw === "number") && String(raw).length <= 64
    && String(raw).match(/^([+\-]?)(\d*)(?:\.(\d*))?(?:e([+\-]?\d+))?$/i);
  if (match && (match[2] || match[3])) {
    const digits = BigInt((match[2] || "0") + (match[3] || ""));
    const exponent = Number(match[4] || 0) - (match[3]?.length || 0);
    // Exact decimal arithmetic keeps credit balances independent of binary rounding.
    if (digits === 0n) balance = "0";
    else if (match[1] !== "-" && exponent <= 18) {
      if (exponent < -128) balance = "0";
      else {
        const scale = exponent < 0 ? 10n ** BigInt(-exponent) : 1n;
        const value = digits * (exponent > 0 ? 10n ** BigInt(exponent) : 1n);
        if (value <= 10n ** 18n * scale) {
          let cents = value * 100n / scale;
          const remainder = value * 100n % scale;
          if (remainder * 2n > scale || (remainder * 2n === scale && cents % 2n)) cents++;
          balance = `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`.replace(/\.?0+$/, "");
        }
      }
    }
  }
  return { balance, has_credits: typeof credits.has_credits === "boolean" ? credits.has_credits : null,
    unlimited: credits.unlimited === true };
}

export function parseClaude(data) {
  return [["five_hour", "5h"], ["seven_day", "7d"]].flatMap(([key, label]) => {
    const item = data[key] || {};
    const value = window(label, item.utilization, item.resets_at);
    return value ? [value] : [];
  });
}

export function parseCursor(data) {
  const plan = data.individualUsage?.plan || {};
  if (plan.enabled === false) return [];
  let percent = number(plan.totalPercentUsed);
  if (percent === null && number(plan.used) !== null && number(plan.limit) !== null && plan.limit > 0) {
    percent = plan.used / plan.limit * 100;
  }
  const value = window("Total", percent, data.billingCycleEnd);
  return value ? [value] : [];
}

export function cursorCookie(value) {
  try {
    if (typeof value !== "string" || value.length > 16384) throw new Error();
    const token = value.split("%3A%3A").at(-1).split("::").at(-1);
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (number(claims.exp) === null) throw new Error();
    if (claims.exp <= Date.now() / 1000 + 60) {
      throw new Unavailable("Cursor's saved sign-in has expired.", "expired", "Sign in again in Cursor.");
    }
    const user = claims.sub.split("|").at(-1);
    if (!/^[\w.-]+$/.test(user)) throw new Error();
    return `${user}%3A%3A${token}`;
  } catch (error) {
    if (error instanceof Unavailable) throw error;
    throw new Unavailable("Invalid Cursor sign-in data; sign in again in Cursor.");
  }
}

export function cursorToken() {
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const cli = loadJson(join(config, "cursor/auth.json")).accessToken;
  if (cli) return cursorCookie(cli);
  const path = join(config, "Cursor/User/globalStorage/state.vscdb");
  if (existsSync(path)) {
    // Read-only connections include the live WAL; never use an immutable snapshot.
    const db = new DatabaseSync(path, { readOnly: true, timeout: 1000 });
    try {
      let token = db.prepare("SELECT value FROM ItemTable WHERE key=? LIMIT 1").get("cursorAuth/accessToken")?.value;
      if (token instanceof Uint8Array) {
        const bytes = Buffer.from(token);
        token = bytes.toString(bytes.includes(0) ? "utf16le" : "utf8");
      }
      if (token) return cursorCookie(token);
    } finally { db.close(); }
  }
  throw new Unavailable("No Cursor app or CLI sign-in was found.", "not_signed_in", "Run cursor-agent login, then refresh.");
}

export const providers = {
  async codex() {
    const root = process.env.CODEX_HOME || join(homedir(), ".codex");
    const tokens = loadJson(join(root, "auth.json")).tokens || {};
    if (!tokens.access_token) throw new Unavailable("Sign in with codex login. API-key accounts have no subscription quota here.");
    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    if (tokens.account_id) headers["ChatGPT-Account-Id"] = tokens.account_id;
    const data = await request("https://chatgpt.com/backend-api/wham/usage", headers);
    return { windows: parseCodex(data), credits: parseCodexCredits(data) };
  },
  async claude() {
    const root = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
    const oauth = loadJson(join(root, ".credentials.json")).claudeAiOauth || {};
    if (!oauth.accessToken) throw new Unavailable("No Claude subscription sign-in token is saved.", "not_signed_in", "Run claude and sign in to an account with Claude Code access.");
    const expires = number(oauth.expiresAt);
    if (expires && expires <= Date.now()) throw new Unavailable("Claude's saved sign-in has expired.", "expired", "Open Claude Code and sign in again; this mod does not renew credentials.");
    if (Array.isArray(oauth.scopes) && !oauth.scopes.includes("user:profile")) {
      throw new Unavailable("This Claude token does not have permission to read subscription usage.", "missing_scope", "Sign in through Claude Code. An API key or setup-token cannot provide this usage view.");
    }
    return { windows: parseClaude(await request("https://api.anthropic.com/api/oauth/usage",
      { Authorization: `Bearer ${oauth.accessToken}`, "anthropic-beta": "oauth-2025-04-20" })) };
  },
  async cursor() {
    return { windows: parseCursor(await request("https://cursor.com/api/usage-summary",
      { Cookie: `WorkosCursorSessionToken=${cursorToken()}` })) };
  },
};

export async function collect(provider) {
  try {
    if (!Object.hasOwn(providers, provider)) throw new Unavailable("Unknown usage provider.");
    const reading = await providers[provider]();
    if (!reading.windows.length && reading.credits == null) {
      throw new Unavailable("The account responded, but did not report a supported subscription quota.", "no_quota", "Check your plan on the provider's usage page. Some plans have no percentage here.");
    }
    return { provider, ...reading, updated: Math.floor(Date.now() / 1000), error: null };
  } catch (error) {
    return { provider, windows: [], updated: null,
      error: error instanceof Unavailable ? error.message : "The local usage reader could not complete the request.",
      code: error instanceof Unavailable ? error.code : "reader_error",
      action: error instanceof Unavailable ? error.action : "Check local file permissions and provider sign-in. No credential values are included in diagnostics." };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await collect(process.argv[2])));
}
