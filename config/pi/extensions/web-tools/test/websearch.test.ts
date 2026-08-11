import assert from "node:assert/strict"
import { readFile, rm } from "node:fs/promises"
import { registerHooks } from "node:module"
import { dirname } from "node:path"
import test from "node:test"
import { providerFromEnvironment, searchWeb, selectProvider } from "../websearch.ts"

const mcpResult = (text = "results") =>
  new Response(JSON.stringify({ result: { content: [{ type: "text", text }] } }), { headers: { "content-type": "application/json" } })

test("rejects invalid numeric controls", async () => {
  for (const controls of [
    { numResults: 0 },
    { numResults: 1.5 },
    { numResults: 21 },
    { contextMaxCharacters: 0 },
    { contextMaxCharacters: 1.5 },
    { contextMaxCharacters: 50_001 },
  ]) {
    await assert.rejects(searchWeb("query", "session", controls), /Unable to search the web for query/)
  }
})

test("selects a stable provider per session and can reach both", () => {
  assert.equal(selectProvider("same-session"), selectProvider("same-session"))
  assert.deepEqual(new Set(Array.from({ length: 20 }, (_, index) => selectProvider(`session-${index}`))), new Set(["exa", "parallel"]))
})

test("honors explicit and environment provider overrides", () => {
  assert.equal(selectProvider("session", "exa"), "exa")
  assert.equal(selectProvider("session", "parallel"), "parallel")
  assert.equal(providerFromEnvironment("exa"), "exa")
  assert.equal(providerFromEnvironment("parallel"), "parallel")
  assert.equal(providerFromEnvironment("other"), undefined)
})

test("maps Exa defaults and options exactly", async () => {
  const requests: Request[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init))
    return mcpResult()
  }
  await searchWeb("default query", "session", {}, { provider: "exa", fetch })
  await searchWeb(
    "custom query",
    "session",
    { numResults: 3, livecrawl: "preferred", type: "deep", contextMaxCharacters: 1234 },
    { provider: "exa", fetch },
  )
  const first = await requests[0].json()
  const second = await requests[1].json()
  assert.equal(requests[0].headers.get("user-agent"), "pi-web-tools/0.1.0")
  assert.deepEqual(first.params, {
    name: "web_search_exa",
    arguments: { query: "default query", type: "auto", numResults: 8, livecrawl: "fallback" },
  })
  assert.deepEqual(second.params.arguments, {
    query: "custom query",
    type: "deep",
    numResults: 3,
    livecrawl: "preferred",
    contextMaxCharacters: 1234,
  })
})

test("URL-encodes the Exa key without exposing it in results or errors", async () => {
  const key = "secret +&?"
  let requestUrl = ""
  const result = await searchWeb("query", "session", {}, {
    provider: "exa",
    exaApiKey: key,
    fetch: async (input) => {
      requestUrl = String(input)
      return mcpResult("safe")
    },
  })
  assert.equal(new URL(requestUrl).searchParams.get("exaApiKey"), key)
  assert.deepEqual(result, { provider: "exa", text: "safe" })
  await assert.rejects(
    searchWeb("query", "session", {}, { provider: "exa", exaApiKey: key, fetch: async () => { throw new Error(key) } }),
    (error: Error) => !error.message.includes(key),
  )
})

test("sends the exact Parallel payload and headers", async () => {
  let request: Request | undefined
  const result = await searchWeb(
    "query",
    "session-id",
    { numResults: 20, livecrawl: "preferred", type: "deep", contextMaxCharacters: 50_000 },
    {
      provider: "parallel",
      parallelApiKey: "parallel-secret",
      fetch: async (input, init) => {
        request = new Request(input, init)
        return mcpResult()
      },
    },
  )
  const body = await request?.json()
  assert.deepEqual(body.params, {
    name: "web_search",
    arguments: { objective: "query", search_queries: ["query"], session_id: "session-id" },
  })
  assert.equal(request?.headers.get("user-agent"), "pi-web-tools/0.1.0")
  assert.equal(request?.headers.get("authorization"), "Bearer parallel-secret")
  assert.equal(JSON.stringify(body).includes("model"), false)
  assert.equal(JSON.stringify(body).includes("numResults"), false)
  assert.deepEqual(result, { provider: "parallel", text: "results" })
})

test("keeps provider credentials out of concise errors", async () => {
  const key = "parallel-secret"
  await assert.rejects(
    searchWeb("private query", "session", {}, {
      provider: "parallel",
      parallelApiKey: key,
      fetch: async () => new Response(key, { status: 500 }),
    }),
    (error: Error) => error.message === "Unable to search the web for private query" && !error.message.includes(key),
  )
})

test("extension wiring honors the environment and saves readable truncated output", async () => {
  const modules: Record<string, string> = {
    "@earendil-works/pi-ai": "export const StringEnum = () => ({})",
    "@earendil-works/pi-coding-agent": `
      export const DEFAULT_MAX_BYTES = 32
      export const DEFAULT_MAX_LINES = 2000
      export const formatSize = (bytes) => bytes + "B"
      export const truncateHead = (content) => ({
        content: content.slice(0, 32), truncated: content.length > 32,
        outputLines: 1, totalLines: 1, outputBytes: 32, totalBytes: content.length,
      })
    `,
    typebox: `
      const value = () => ({})
      export const Type = { Object: value, String: value, Optional: value, Number: value, Integer: value }
    `,
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const source = modules[specifier]
      return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : nextResolve(specifier, context)
    },
  })

  const tools = new Map<string, any>()
  const extension = (await import(`../index.ts?test=${Date.now()}`)).default
  extension({ registerTool: (tool: any) => tools.set(tool.name, tool) } as any)

  const originalFetch = globalThis.fetch
  const originalProvider = process.env.PI_WEBSEARCH_PROVIDER
  const fullText = "x".repeat(200)
  process.env.PI_WEBSEARCH_PROVIDER = "exa"
  globalThis.fetch = async () => mcpResult(fullText)
  try {
    const result = await tools.get("websearch").execute("call", { query: "query" }, undefined, undefined, {
      sessionManager: { getSessionId: () => "session" },
    })
    assert.equal(result.details.provider, "exa")
    assert.equal(result.details.text, fullText)
    assert.match(result.content[0].text, /Output truncated.*Full output saved to:/s)
    assert.equal(await readFile(result.details.fullOutputPath, "utf8"), fullText)
    await rm(dirname(result.details.fullOutputPath), { recursive: true })
  } finally {
    globalThis.fetch = originalFetch
    if (originalProvider === undefined) delete process.env.PI_WEBSEARCH_PROVIDER
    else process.env.PI_WEBSEARCH_PROVIDER = originalProvider
  }
})
