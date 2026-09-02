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

export function transcriptForView(prompt: string, entries: readonly TranscriptEntry[]): Array<{ role: "user" | "assistant"; text: string }> {
  return [
    { role: "user" as const, text: prompt },
    ...entries
      .filter((entry): entry is TranscriptEntry & { role: "user" | "assistant" } => entry.role !== "tool" && Boolean(entry.text))
      .map(({ role, text }) => ({ role, text })),
  ];
}
