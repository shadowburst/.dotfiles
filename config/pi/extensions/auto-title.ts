import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const TITLE_TIMEOUT_MS = 60_000;
const TITLE_MAX_WORDS = 4;
const TITLE_MAX_CHARS = 28;
const PROMPT_MAX = 2000;

function hasUserMessage(ctx: ExtensionContext): boolean {
  return ctx.sessionManager
    .getEntries()
    .some((entry) => entry.type === "message" && entry.message.role === "user");
}

function shouldArm(
  reason: "startup" | "reload" | "new" | "resume" | "fork",
  ctx: ExtensionContext,
): boolean {
  if (reason === "resume" || reason === "fork") return false;
  if (piName(ctx) || hasUserMessage(ctx)) return false;
  return ctx.sessionManager.getSessionFile() !== undefined;
}

function piName(ctx: ExtensionContext): string | undefined {
  return ctx.sessionManager.getSessionName();
}

function cleanTitle(text: string): string | undefined {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const line = stripped
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!line) return;
  const unquoted = line.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!unquoted) return;
  const words = unquoted.split(/\s+/).slice(0, TITLE_MAX_WORDS);
  while (words.join(" ").length > TITLE_MAX_CHARS) words.pop();
  return words.join(" ") || undefined;
}

// Runs the flake's `textgen` (the textGeneration option): the prompt goes in
// on stdin and the text comes out on stdout.
function textgen(prompt: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn("textgen", [], {
      cwd: tmpdir(),
      stdio: ["pipe", "pipe", "ignore"],
      signal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => resolve(code === 0 ? out : undefined));
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

export default function (pi: ExtensionAPI) {
  let armed = false;
  let firstPrompt: string | undefined;
  let naming = false;

  pi.on("session_start", (event, ctx) => {
    armed = shouldArm(event.reason, ctx);
    firstPrompt = undefined;
    naming = false;
  });

  pi.on("session_info_changed", (event) => {
    if (event.name) armed = false;
  });

  pi.on("session_shutdown", () => {
    armed = false;
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (!armed || firstPrompt !== undefined) return;
    const prompt = event.prompt.trim();
    if (!prompt) return;
    firstPrompt = prompt;
    void nameIfNeeded(ctx);
  });

  async function nameIfNeeded(ctx: ExtensionContext): Promise<void> {
    if (!armed || naming || pi.getSessionName() || !firstPrompt) return;
    naming = true;
    armed = false;
    const prompt = firstPrompt.slice(0, PROMPT_MAX);

    try {
      const text = await textgen(
        [
          "Reply with a session title only.",
          `Maximum ${TITLE_MAX_WORDS} words and ${TITLE_MAX_CHARS} characters.`,
          "No quotes.",
          "",
          "Prompt:",
          prompt,
        ].join("\n"),
      );
      const title = text === undefined ? undefined : cleanTitle(text);
      if (!title || pi.getSessionName()) return;
      pi.setSessionName(title);
      ctx.ui.setTitle(title);
    } catch {
      // fail silent
    }
  }
}
