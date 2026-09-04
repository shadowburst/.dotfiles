import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const TITLE_PROVIDER = "openai-codex";
const TITLE_MODEL = "gpt-5.6-luna";
const TITLE_MAX = 80;
const PROMPT_MAX = 2000;

function hasUserMessage(ctx: ExtensionContext): boolean {
  return ctx.sessionManager.getEntries().some(
    (entry) => entry.type === "message" && entry.message.role === "user",
  );
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
  return unquoted.length > TITLE_MAX ? unquoted.slice(0, TITLE_MAX).trimEnd() : unquoted;
}

function titleFromResponse(response: AssistantMessage): string | undefined {
  if (response.stopReason === "error") return;
  const text = response.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return cleanTitle(text);
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

  pi.on("before_agent_start", (event) => {
    if (!armed || firstPrompt !== undefined) return;
    const prompt = event.prompt.trim();
    if (prompt) firstPrompt = prompt;
  });

  pi.on("agent_settled", (_event, ctx) => {
    void nameIfNeeded(ctx);
  });

  async function nameIfNeeded(ctx: ExtensionContext): Promise<void> {
    if (!armed || naming || pi.getSessionName() || !firstPrompt) return;
    naming = true;
    armed = false;
    const prompt = firstPrompt.slice(0, PROMPT_MAX);

    try {
      const model = ctx.modelRegistry.find(TITLE_PROVIDER, TITLE_MODEL);
      if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) return;

      const response = await ctx.modelRegistry.complete(
        model,
        {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: [
                    "Reply with a session title only.",
                    `Maximum ${TITLE_MAX} characters.`,
                    "No quotes.",
                    "",
                    "Prompt:",
                    prompt,
                  ].join("\n"),
                },
              ],
              timestamp: Date.now(),
            },
          ],
        },
        {
          reasoningEffort: "low",
          maxTokens: 64,
          cacheRetention: "none",
        },
      );

      const title = titleFromResponse(response);
      if (!title || pi.getSessionName()) return;
      pi.setSessionName(title);
    } catch {
      // fail silent
    }
  }
}
