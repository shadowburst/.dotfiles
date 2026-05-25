import path from "node:path";
import { complete, getModel } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_CONVERSATION_CHARS = 12_000;
const MAX_TITLE_CHARS = 60;
const TITLE_MODEL = getModel("openai", "gpt-5.5");

type ContentBlock = {
	type?: string;
	text?: string;
	name?: string;
};

type SessionEntry = {
	type?: string;
	message?: {
		role?: string;
		content?: unknown;
	};
};

function cwdName(ctxCwd: string): string {
	return path.basename(ctxCwd || process.cwd());
}

function extractText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return "";
	}

	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") {
			continue;
		}

		const block = part as ContentBlock;
		if (block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		}
	}

	return parts.join("\n");
}

function buildConversation(entries: SessionEntry[]): string {
	const messages = entries
		.filter((entry) => entry.type === "message" && entry.message?.role)
		.filter((entry) => entry.message?.role === "user" || entry.message?.role === "assistant")
		.slice(-12)
		.map((entry) => {
			const role = entry.message?.role === "user" ? "User" : "Assistant";
			const text = extractText(entry.message?.content).trim();
			return text ? `${role}: ${text}` : "";
		})
		.filter(Boolean);

	return messages.join("\n\n").slice(-MAX_CONVERSATION_CHARS);
}

function cleanTitle(raw: string): string {
	return raw
		.replace(/[\r\n]+/g, " ")
		.replace(/^title\s*:\s*/i, "")
		.replace(/^['\"`]+|['\"`]+$/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_TITLE_CHARS);
}

function setTerminalTitle(pi: ExtensionAPI, ctx: { cwd: string; ui: { setTitle(title: string): void } }) {
	const session = pi.getSessionName();
	ctx.ui.setTitle(session ? `π - ${session} - ${cwdName(ctx.cwd)}` : `π - ${cwdName(ctx.cwd)}`);
}

export default function (pi: ExtensionAPI) {
	let generating = false;

	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "new") {
			ctx.ui.setTitle(`π - ${cwdName(ctx.cwd)}`);
			return;
		}

		setTerminalTitle(pi, ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (generating) {
			setTerminalTitle(pi, ctx);
			return;
		}

		if (pi.getSessionName()) {
			setTerminalTitle(pi, ctx);
			return;
		}

		const conversation = buildConversation(ctx.sessionManager.getBranch() as SessionEntry[]);
		if (!conversation.trim()) {
			setTerminalTitle(pi, ctx);
			return;
		}

		generating = true;
		try {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(TITLE_MODEL);
			if (!auth.ok || !auth.apiKey) {
				setTerminalTitle(pi, ctx);
				return;
			}

			const response = await complete(
				TITLE_MODEL,
				{
					systemPrompt: [
						"Generate a concise terminal tab title for this coding-agent session.",
						"Return only the title, with no quotes, prefix, markdown, or punctuation-only decoration.",
						"Use 2 to 4 words. Prefer concrete nouns and verbs from the task.",
					].join("\n"),
					messages: [
						{
							role: "user" as const,
							content: [{ type: "text" as const, text: conversation }],
							timestamp: Date.now(),
						},
					],
				},
				// No reasoning options: openai/gpt-5.5 maps the default/off thinking level to reasoning effort "none".
				{ apiKey: auth.apiKey, headers: auth.headers, signal: ctx.signal },
			);

			const title = cleanTitle(
				response.content
					.filter((part): part is { type: "text"; text: string } => part.type === "text")
					.map((part) => part.text)
					.join(" "),
			);

			if (!title) {
				setTerminalTitle(pi, ctx);
				return;
			}

			if (!pi.getSessionName()) {
				pi.setSessionName(title);
			}
			setTerminalTitle(pi, ctx);
		} finally {
			generating = false;
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setTitle("π");
	});
}
