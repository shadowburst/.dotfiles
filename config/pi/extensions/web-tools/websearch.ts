import { callMcp } from "./mcp.ts"

export const EXA_URL = "https://mcp.exa.ai/mcp"
export const PARALLEL_URL = "https://search.parallel.ai/mcp"
export const MAX_NUM_RESULTS = 20
export const MAX_CONTEXT_CHARACTERS = 50_000

export type WebSearchProvider = "exa" | "parallel"
export interface WebSearchControls {
  numResults?: number
  livecrawl?: "fallback" | "preferred"
  type?: "auto" | "fast" | "deep"
  contextMaxCharacters?: number
}
export interface WebSearchResult {
  provider: WebSearchProvider
  text: string
}

function checksum(content: string): string | undefined {
  if (!content) return
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function providerFromEnvironment(value = process.env.PI_WEBSEARCH_PROVIDER): WebSearchProvider | undefined {
  return value === "exa" || value === "parallel" ? value : undefined
}

export function selectProvider(sessionID: string, override?: WebSearchProvider): WebSearchProvider {
  if (override) return override
  return Number.parseInt(checksum(sessionID) ?? "0", 36) % 2 === 0 ? "exa" : "parallel"
}

function validateInteger(value: number | undefined, maximum: number, name: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0 || value > maximum))
    throw new Error(`${name} must be a positive integer no greater than ${maximum}`)
}

export async function searchWeb(
  query: string,
  sessionID: string,
  controls: WebSearchControls = {},
  options: {
    provider?: WebSearchProvider
    exaApiKey?: string
    parallelApiKey?: string
    signal?: AbortSignal
    fetch?: typeof fetch
  } = {},
): Promise<WebSearchResult> {
  try {
    validateInteger(controls.numResults, MAX_NUM_RESULTS, "numResults")
    validateInteger(controls.contextMaxCharacters, MAX_CONTEXT_CHARACTERS, "contextMaxCharacters")
    const provider = selectProvider(sessionID, options.provider)

    if (provider === "exa") {
      const url = new URL(EXA_URL)
      if (options.exaApiKey) url.searchParams.set("exaApiKey", options.exaApiKey)
      const text = await callMcp(
        url.toString(),
        "web_search_exa",
        {
          query,
          type: controls.type ?? "auto",
          numResults: controls.numResults ?? 8,
          livecrawl: controls.livecrawl ?? "fallback",
          contextMaxCharacters: controls.contextMaxCharacters,
        },
        { signal: options.signal, fetch: options.fetch },
      )
      return { provider, text }
    }

    const text = await callMcp(
      PARALLEL_URL,
      "web_search",
      { objective: query, search_queries: [query], session_id: sessionID },
      {
        signal: options.signal,
        fetch: options.fetch,
        headers: options.parallelApiKey ? { Authorization: `Bearer ${options.parallelApiKey}` } : undefined,
      },
    )
    return { provider, text }
  } catch {
    throw new Error(`Unable to search the web for ${query}`)
  }
}
