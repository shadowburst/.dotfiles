export type GitAction = "commit" | "pr";

export type GitCommand =
  | { type: "guided" }
  | { type: "explicit"; action: GitAction; context: string };

export function parseGitCommand(args: string): GitCommand | undefined {
  const trimmed = args.trim();
  if (!trimmed) return { type: "guided" };

  const match = trimmed.match(/^(commit|pr)(?:\s+([\s\S]*))?$/);
  if (!match) return;
  return { type: "explicit", action: match[1] as GitAction, context: match[2]?.trim() ?? "" };
}

export function usage(): string {
  return "Usage: /git [commit|pr] [additional context]";
}
