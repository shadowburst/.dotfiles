import path from "node:path";
import { complete, getModel, type Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_CONVERSATION_CHARS = 12_000;
const MAX_TITLE_CHARS = 60;
const DEFAULT_TITLE_MODEL = getModel("openai-codex", "gpt-5.4-mini");

type TitleAuth = {
	ok: boolean;
	apiKey?: string;
	headers?: Record<string, string>;
};

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

	async function generateTitle(ctx: {
		cwd: string;
		signal?: AbortSignal;
		model?: Model<any>;
		modelRegistry: { getApiKeyAndHeaders(model: Model<any>): Promise<TitleAuth> };
		ui: { setTitle(title: string): void };
	}, conversation: string) {
		if (generating || pi.getSessionName() || !conversation.trim()) {
			setTerminalTitle(pi, ctx);
			return;
		}

		generating = true;
		try {
			const models = [DEFAULT_TITLE_MODEL, ctx.model].filter(
				(model, index, all): model is Model<any> =>
					Boolean(model) && all.findIndex((other) => other?.provider === model.provider && other?.id === model.id) === index,
			);

			for (const model of models) {
				const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
				if (!auth.ok || !auth.apiKey) {
					continue;
				}

				const response = await complete(
					model,
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
					{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 24, reasoning: "minimal", signal: ctx.signal },
				);

				const title = cleanTitle(
					response.content
						.filter((part): part is { type: "text"; text: string } => part.type === "text")
						.map((part) => part.text)
						.join(" "),
				);

				if (title && !pi.getSessionName()) {
					pi.setSessionName(title);
					setTerminalTitle(pi, ctx);
					return;
				}
			}

			setTerminalTitle(pi, ctx);
		} finally {
			generating = false;
		}
	}

	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "new") {
			ctx.ui.setTitle(`π - ${cwdName(ctx.cwd)}`);
			return;
		}

		setTerminalTitle(pi, ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		void generateTitle(ctx, `User: ${event.prompt}`);
	});

	pi.on("agent_end", async (_event, ctx) => {
		await generateTitle(ctx, buildConversation(ctx.sessionManager.getBranch() as SessionEntry[]));
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setTitle("π");
	});
}
