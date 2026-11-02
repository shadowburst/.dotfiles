import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseClaudeUsagePayload, type UsageSnapshot } from "./state.ts";

export async function loadClaudeUsage(env: Record<string, string | undefined>, signal: AbortSignal): Promise<UsageSnapshot> {
  const root = env.PI_CLAUDE_CODE_CONFIG_DIR || env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  let oauth;
  try {
    oauth = JSON.parse(await readFile(join(root, ".credentials.json"), "utf8"))?.claudeAiOauth;
  } catch {
    throw new Error("Cannot read Claude Code login. Run claude auth login.");
  }
  if (typeof oauth?.accessToken !== "string" || !oauth.accessToken) {
    throw new Error("Claude Code is not logged in. Run claude auth login.");
  }
  if (typeof oauth.expiresAt === "number" && oauth.expiresAt <= Date.now()) {
    throw new Error("Claude Code login has expired. Open Claude Code to renew it.");
  }
  if (Array.isArray(oauth.scopes) && !oauth.scopes.includes("user:profile")) {
    throw new Error("Claude login cannot read usage. Run claude auth login.");
  }
  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      authorization: `Bearer ${oauth.accessToken}`,
      "anthropic-beta": "oauth-2025-04-20",
      accept: "application/json",
    },
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) throw new Error(`Claude usage request failed (${response.status})`);
  return parseClaudeUsagePayload(await response.json());
}
