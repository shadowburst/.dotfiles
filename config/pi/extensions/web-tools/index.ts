import { mkdtemp, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { StringEnum } from "@earendil-works/pi-ai"
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
  type TruncationResult,
} from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { fetchWeb } from "./webfetch.ts"
import { providerFromEnvironment, searchWeb } from "./websearch.ts"

async function modelOutput(
  output: string,
  prefix: string,
): Promise<{ text: string; truncation?: TruncationResult; fullOutputPath?: string }> {
  const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES })
  if (!truncation.truncated) return { text: output }

  const directory = await mkdtemp(join(tmpdir(), `${prefix}-`))
  const fullOutputPath = join(directory, "output.txt")
  await writeFile(fullOutputPath, output, "utf8")
  return {
    text:
      `${truncation.content}\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines ` +
      `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${fullOutputPath}]`,
    truncation,
    fullOutputPath,
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "webfetch",
    label: "Web Fetch",
    description: `Fetch one HTTP(S) resource as text, Markdown, or HTML. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}; full output is saved to a temporary file.`,
    promptSnippet: "Fetch one HTTP(S) resource as text, Markdown, or HTML",
    parameters: Type.Object({
      url: Type.String({ description: "The HTTP or HTTPS URL to fetch" }),
      format: Type.Optional(StringEnum(["text", "markdown", "html"] as const, { description: "Output format; defaults to markdown" })),
      timeout: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 120, description: "Timeout in seconds" })),
    }),
    async execute(_toolCallId, params, signal) {
      try {
        const result = await fetchWeb(params.url, { format: params.format, timeout: params.timeout, signal })
        const output = await modelOutput(result.output, "pi-webfetch")
        return {
          content: [{ type: "text", text: output.text }],
          details: { ...result, truncation: output.truncation, fullOutputPath: output.fullOutputPath },
        }
      } catch {
        throw new Error(`Unable to fetch ${params.url}`)
      }
    },
  })

  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description: `Search the web through Exa or Parallel. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}; full output is saved to a temporary file.`,
    promptSnippet: "Search the web through Exa or Parallel",
    promptGuidelines: [`For recent or current websearch queries, include the current year (${new Date().getFullYear()}).`],
    parameters: Type.Object({
      query: Type.String({ description: "Web search query" }),
      numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Result count; defaults to 8" })),
      livecrawl: Type.Optional(StringEnum(["fallback", "preferred"] as const)),
      type: Type.Optional(StringEnum(["auto", "fast", "deep"] as const)),
      contextMaxCharacters: Type.Optional(Type.Integer({ minimum: 1, maximum: 50_000 })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        const result = await searchWeb(params.query, ctx.sessionManager.getSessionId(), params, {
          provider: providerFromEnvironment(),
          exaApiKey: process.env.EXA_API_KEY,
          parallelApiKey: process.env.PARALLEL_API_KEY,
          signal,
        })
        const output = await modelOutput(result.text, "pi-websearch")
        return {
          content: [{ type: "text", text: output.text }],
          details: { ...result, truncation: output.truncation, fullOutputPath: output.fullOutputPath },
        }
      } catch {
        throw new Error(`Unable to search the web for ${params.query}`)
      }
    },
  })
}
