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
