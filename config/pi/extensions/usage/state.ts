export interface UsageWindow {
  label: string;
  usedPercent: number;
  windowSeconds?: number;
  resetsAt?: number;
}

export interface UsageSnapshot {
  email?: string;
  plan?: string;
  credits?: string;
  windows: UsageWindow[];
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readLimit(label: string, value: unknown, windows: UsageWindow[]): void {
  const wrapper = object(value);
  const limit = object(wrapper?.rate_limit) ?? wrapper;
  if (!limit) return;

  for (const [key, fallback] of [["primary_window", "Primary"], ["secondary_window", "Secondary"]] as const) {
    const raw = object(limit[key]);
    const used = number(raw?.used_percent);
    if (used === undefined) continue;
    const windowSeconds = number(raw?.limit_window_seconds);
    const resetsAt = number(raw?.reset_at);
    windows.push({
      label: `${label} · ${windowSeconds ? formatWindowDuration(windowSeconds) : fallback}`,
      usedPercent: Math.max(0, Math.min(100, used)),
      ...(windowSeconds && windowSeconds > 0 ? { windowSeconds } : {}),
      ...(resetsAt && resetsAt > 0 ? { resetsAt } : {}),
    });
  }
}

export function parseUsagePayload(value: unknown): UsageSnapshot {
  const payload = object(value);
  if (!payload) throw new Error("Codex returned an invalid usage response");

  const windows: UsageWindow[] = [];
  readLimit("General", payload.rate_limit, windows);
  readLimit("Code review", payload.code_review_rate_limit, windows);

  if (Array.isArray(payload.additional_rate_limits)) {
    for (const entryValue of payload.additional_rate_limits) {
      const entry = object(entryValue);
      if (!entry) continue;
      const name = typeof entry.limit_name === "string"
        ? entry.limit_name
        : typeof entry.metered_feature === "string"
          ? title(entry.metered_feature)
          : "Additional";
      readLimit(name, entry.rate_limit, windows);
    }
  }

  const credits = object(payload.credits);
  const balance = typeof credits?.balance === "string" ? credits.balance : undefined;
  const meaningfulCredits = credits?.unlimited === true
    ? "Unlimited"
    : credits?.has_credits === true || (balance !== undefined && Number(balance) !== 0)
      ? balance
      : undefined;

  return {
    ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    ...(typeof payload.plan_type === "string" ? { plan: title(payload.plan_type) } : {}),
    ...(meaningfulCredits !== undefined ? { credits: meaningfulCredits } : {}),
    windows,
  };
}

export function parseCopilotUsagePayload(value: unknown): UsageSnapshot {
  const payload = object(value);
  if (!payload) throw new Error("Copilot returned an invalid usage response");

  const resetValue = payload.quota_reset_date_utc ?? payload.quota_reset_date;
  const resetMilliseconds = typeof resetValue === "string" ? Date.parse(resetValue) : NaN;
  const resetsAt = Number.isFinite(resetMilliseconds) ? resetMilliseconds / 1000 : undefined;
  const quotas = object(payload.quota_snapshots);
  const windows: UsageWindow[] = [];

  for (const [key, label] of [
    ["premium_interactions", "Premium"],
    ["chat", "Chat"],
    ["completions", "Completions"],
  ] as const) {
    const quota = object(quotas?.[key]);
    if (!quota) continue;
    const entitlement = number(quota.entitlement);
    const remaining = number(quota.remaining) ?? number(quota.quota_remaining);
    const percentRemaining = number(quota.percent_remaining);
    const usedPercent = quota.unlimited === true
      ? 0
      : percentRemaining !== undefined
        ? 100 - percentRemaining
        : entitlement !== undefined && entitlement > 0 && remaining !== undefined
          ? 100 * (entitlement - remaining) / entitlement
          : undefined;
    if (usedPercent === undefined) continue;
    windows.push({
      label,
      usedPercent: Math.max(0, Math.min(100, usedPercent)),
      ...(resetsAt !== undefined ? { resetsAt } : {}),
    });
  }

  return {
    ...(typeof payload.copilot_plan === "string" ? { plan: title(payload.copilot_plan) } : {}),
    windows,
  };
}

export function selectUsageWindow(snapshot: UsageSnapshot, modelId: string): UsageWindow | undefined {
  const modelKey = modelId.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const specific = snapshot.windows.filter((window) => {
    const name = window.label.split(" · ", 1)[0]?.toLowerCase() ?? "";
    if (name === "general" || name === "code review") return false;
    const key = name.replaceAll(/[^a-z0-9]/g, "");
    const shortKey = key.replace(/^codex/, "");
    return key.length > 0 && (modelKey.includes(key) || (shortKey.length > 0 && modelKey.includes(shortKey)));
  });
  const eligible = specific.length > 0
    ? specific
    : snapshot.windows.filter((window) => window.label.startsWith("General · "));
  return eligible.reduce<UsageWindow | undefined>(
    (lowest, window) => (!lowest || window.usedPercent > lowest.usedPercent ? window : lowest),
    undefined,
  );
}

export function selectCopilotUsageWindow(snapshot: UsageSnapshot, _modelId: string): UsageWindow | undefined {
  return snapshot.windows.find((window) => window.label === "Premium");
}

export function cycleIndex(index: number, count: number, offset: number): number {
  return count > 0 ? ((index + offset) % count + count) % count : -1;
}

export function resetCountdown(window: UsageWindow, now = Date.now() / 1000, compact = false): string {
  if (!window.resetsAt) return "—";
  const seconds = Math.max(0, Math.round(window.resetsAt - now));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days) return compact ? `${days}d` : `${days}d ${hours}h`;
  if (hours) return compact ? `${hours}h` : `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatWindowDuration(seconds: number): string {
  const units = [
    [365 * 24 * 60 * 60, "year"],
    [7 * 24 * 60 * 60, "week"],
    [24 * 60 * 60, "day"],
    [60 * 60, "hour"],
    [60, "minute"],
  ] as const;
  for (const [size, name] of units) {
    if (seconds >= size && seconds % size === 0) {
      const count = seconds / size;
      return `${count} ${name}${count === 1 ? "" : "s"}`;
    }
  }
  return "Custom window";
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}
