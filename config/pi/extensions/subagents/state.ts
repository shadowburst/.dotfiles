import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

export const MODELS = [
  "openai-codex/gpt-5.6-luna",
  "openai-codex/gpt-5.6-terra",
  "openai-codex/gpt-5.6-sol",
] as const;

export const EFFORTS = ["low", "medium", "high", "xhigh"] as const;

export type ModelId = (typeof MODELS)[number];
export type Effort = (typeof EFFORTS)[number];
export type TranscriptEntry = {
  role: "user" | "assistant" | "tool";
  text: string;
  thinking?: string;
};

export type Worktree = {
  path: string;
  workPath: string;
  baseSha: string;
  branch: string;
};

export type WorktreeCleanupResult = {
  hasChanges: boolean;
  branch?: string;
};

type PiExec = {
  exec(command: string, args: string[], options: { cwd: string; timeout: number }): Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
    killed: boolean;
  }>;
};

export function validateAgentRequest(
  model: string,
  effort: string,
  isolation?: string,
): { ok: true } | { ok: false; error: string } {
  if (!MODELS.includes(model as ModelId)) return { ok: false, error: `Unsupported model: ${model}` };
  const allowed = model.endsWith("luna") ? EFFORTS : EFFORTS.slice(0, 3);
  if (!allowed.includes(effort as Effort)) return { ok: false, error: `${model} supports ${allowed.join(", ")}` };
  if (isolation !== undefined && isolation !== "worktree") return { ok: false, error: 'isolation must be "worktree"' };
  return { ok: true };
}

export class AgentPool {
  private queued: string[] = [];
  private running = new Set<string>();

  enqueue(id: string): string[] {
    this.queued.push(id);
    return this.start();
  }

  finish(id: string): string[] {
    this.running.delete(id);
    return this.start();
  }

  cancel(id: string): string[] {
    this.queued = this.queued.filter((queuedId) => queuedId !== id);
    this.running.delete(id);
    return this.start();
  }

  reset(): void {
    this.queued = [];
    this.running.clear();
  }

  private start(): string[] {
    const started: string[] = [];
    while (this.running.size < 8 && this.queued.length > 0) {
      const id = this.queued.shift()!;
      this.running.add(id);
      started.push(id);
    }
    return started;
  }
}

export function transcriptForView(
  prompt: string,
  entries: readonly TranscriptEntry[],
): Array<{ role: "user" | "assistant"; text: string }> {
  return [
    { role: "user" as const, text: prompt },
    ...entries
      .filter((entry): entry is TranscriptEntry & { role: "user" | "assistant" } => entry.role !== "tool" && Boolean(entry.text))
      .map(({ role, text }) => ({ role, text })),
  ];
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text"))
    .map((part) => part.text)
    .join("\n");
}

export function latestAssistantResponse(
  messages: readonly unknown[],
  startIndex = 0,
): { text: string; error?: string } {
  let text = "";
  let final: { content?: unknown; stopReason?: string; errorMessage?: string } | undefined;

  for (let index = startIndex; index < messages.length; index++) {
    const message = messages[index] as { role?: string; content?: unknown; stopReason?: string; errorMessage?: string };
    if (message?.role !== "assistant") continue;
    final = message;
    const candidate = textContent(message.content).trim();
    if (candidate) text = candidate;
  }

  if (!final) return { text };
  if (final.stopReason === "error") return { text, error: final.errorMessage?.trim() || "provider error with no output" };
  if (final.stopReason === "length" && !textContent(final.content).trim()) {
    return { text, error: "run hit the output token limit before producing any text" };
  }
  return { text };
}

function truncateUtf8(text: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

export function truncateResponse(text: string, maxBytes: number, maxLines: number): string {
  if (Buffer.byteLength(text) <= maxBytes && text.split("\n").length <= maxLines) return text;

  const notice = `[Output truncated: response exceeds ${maxBytes} bytes or ${maxLines} lines.]`;
  const contentBytes = Math.max(0, maxBytes - Buffer.byteLength(notice) - 2);
  const contentLines = Math.max(0, maxLines - 2);
  const head = truncateUtf8(text.split("\n").slice(0, contentLines).join("\n"), contentBytes);
  return `${head}\n\n${notice}`;
}

async function git(pi: PiExec, cwd: string, args: string[], timeout: number): Promise<string> {
  const result = await pi.exec("git", args, { cwd, timeout });
  if (result.killed || result.code !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed (exit ${result.code})`);
  }
  return result.stdout.trim();
}

export async function createWorktree(pi: PiExec, cwd: string, agentId: string): Promise<Worktree | undefined> {
  let baseSha: string;
  let subdir: string;
  try {
    await git(pi, cwd, ["rev-parse", "--is-inside-work-tree"], 5_000);
    baseSha = await git(pi, cwd, ["rev-parse", "HEAD"], 5_000);
    const topLevel = await git(pi, cwd, ["rev-parse", "--show-toplevel"], 5_000);
    subdir = relative(realpathSync(topLevel), realpathSync(cwd));
  } catch {
    return undefined;
  }

  const path = join(tmpdir(), `pi-agent-${agentId}-${randomUUID().slice(0, 8)}`);
  try {
    await git(pi, cwd, ["worktree", "add", "--detach", path, "HEAD"], 30_000);
    return {
      path,
      workPath: subdir ? join(path, subdir) : path,
      baseSha,
      branch: `pi-agent-${agentId}`,
    };
  } catch {
    return undefined;
  }
}

async function removeWorktree(pi: PiExec, cwd: string, path: string): Promise<void> {
  try {
    await git(pi, cwd, ["worktree", "remove", "--force", path], 10_000);
  } catch {
    try {
      await git(pi, cwd, ["worktree", "prune"], 5_000);
    } catch {
      // Best effort. The caller is already settling an agent.
    }
  }
}

export async function cleanupWorktree(
  pi: PiExec,
  cwd: string,
  worktree: Worktree,
  description: string,
): Promise<WorktreeCleanupResult> {
  if (!existsSync(worktree.path)) return { hasChanges: false };

  try {
    const status = await git(pi, worktree.path, ["status", "--porcelain"], 10_000);
    if (status) {
      await git(pi, worktree.path, ["add", "-A"], 10_000);
      await git(pi, worktree.path, ["commit", "--no-verify", "-m", `pi-agent: ${description.slice(0, 200)}`], 10_000);
    } else if (await git(pi, worktree.path, ["rev-parse", "HEAD"], 5_000) === worktree.baseSha) {
      await removeWorktree(pi, cwd, worktree.path);
      return { hasChanges: false };
    }

    let branch = worktree.branch;
    try {
      await git(pi, worktree.path, ["branch", branch], 5_000);
    } catch {
      branch = `${worktree.branch}-${randomUUID().slice(0, 8)}`;
      await git(pi, worktree.path, ["branch", branch], 5_000);
    }
    worktree.branch = branch;
    await removeWorktree(pi, cwd, worktree.path);
    return { hasChanges: true, branch };
  } catch {
    await removeWorktree(pi, cwd, worktree.path);
    return { hasChanges: false };
  }
}
