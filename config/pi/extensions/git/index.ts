import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stripFrontmatter, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

import { parseGitCommand, usage, type GitAction } from "./state.ts";

const MODEL = "openai-codex/gpt-5.6-luna";
const EFFORT = "medium";

type AgentResult = {
  agentId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  output: string;
};

type SubagentRequest = {
  version: 1;
  prompt: string;
  description: string;
  model: typeof MODEL;
  effort: typeof EFFORT;
  accept: () => void;
  resolve: (result: AgentResult) => void;
  reject: (error: Error) => void;
};

function actionLabel(action: GitAction): string {
  return action === "commit" ? "Commit" : "Create or update PR";
}

function firstLine(text: string): string {
  const line = text.split("\n").find((value) => value.trim());
  return line?.trim().slice(0, 160) || "No final response.";
}

function notify(ctx: ExtensionContext, message: string, kind: "info" | "error"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, kind);
    return;
  }
  process.stderr.write(`${message}\n`);
}

async function assertGitWorktree(pi: ExtensionAPI, cwd: string): Promise<void> {
  const result = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd, timeout: 1_000 });
  if (result.code !== 0 || result.stdout.trim() !== "true") {
    throw new Error("/git must be run inside a Git worktree.");
  }
}

async function loadSkill(pi: ExtensionAPI, action: GitAction): Promise<{ path: string; body: string }> {
  const command = pi.getCommands().find((item) => item.name === `skill:${action}` && item.source === "skill");
  if (!command) throw new Error(`Required /skill:${action} is unavailable. Reload Pi after installing the skill.`);

  try {
    return {
      path: command.sourceInfo.path,
      body: stripFrontmatter(await readFile(command.sourceInfo.path, "utf8")).trim(),
    };
  } catch {
    throw new Error(`Could not load /skill:${action}. Reload Pi and try again.`);
  }
}

function buildPrompt(action: GitAction, skill: { path: string; body: string }, context: string): string {
  return [
    `<skill name="${action}" location="${skill.path}">`,
    `References are relative to ${dirname(skill.path)}.`,
    "",
    skill.body,
    "</skill>",
    "",
    `Execute the ${action} skill exactly.`,
    context ? `User: ${context}` : "",
  ].filter(Boolean).join("\n");
}

function runSubagent(pi: ExtensionAPI, prompt: string, description: string): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    let accepted = false;
    const timeout = setTimeout(() => {
      if (!accepted) reject(new Error("The subagents bridge is unavailable. Reload Pi after updating both extensions."));
    }, 250);
    timeout.unref();

    const request: SubagentRequest = {
      version: 1,
      prompt,
      description,
      model: MODEL,
      effort: EFFORT,
      accept: () => {
        accepted = true;
        clearTimeout(timeout);
      },
      resolve,
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    };
    pi.events.emit("subagents:run", request);
  });
}

export default function gitExtension(pi: ExtensionAPI): void {
  pi.registerCommand("git", {
    description: "Create commits or pull requests with the configured Git skills",
    handler: async (args, ctx) => {
      const command = parseGitCommand(args ?? "");
      if (!command) {
        notify(ctx, usage(), "error");
        return;
      }
      if (command.type === "guided" && ctx.mode !== "tui") {
        notify(ctx, `${usage()}\nHeadless mode requires commit or pr.`, "error");
        return;
      }

      await ctx.waitForIdle();
      let action: GitAction;
      let context: string;
      if (command.type === "explicit") {
        ({ action, context } = command);
      } else {
        const selected = await ctx.ui.select("Git action:", ["Commit", "Create or update PR"]);
        if (!selected) return;
        action = selected === "Commit" ? "commit" : "pr";
        const entered = await ctx.ui.editor(`${actionLabel(action)} context (optional):`, "");
        if (entered === undefined) return;
        context = entered.trim();
      }

      try {
        await assertGitWorktree(pi, ctx.cwd);
        const skill = await loadSkill(pi, action);
        const result = await runSubagent(
          pi,
          buildPrompt(action, skill, context),
          `${actionLabel(action)}${context ? `: ${firstLine(context)}` : ""}`,
        );
        const kind = result.status === "completed" ? "info" : "error";
        notify(ctx, `${actionLabel(action)} ${result.status}: ${firstLine(result.output)}\nSee /agents for details.`, kind);
      } catch (error) {
        notify(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
