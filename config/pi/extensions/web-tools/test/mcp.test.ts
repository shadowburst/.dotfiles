import assert from "node:assert/strict"
import test from "node:test"
import { callMcp, MAX_MCP_RESPONSE_BYTES, NO_RESULTS, parseMcpResponse } from "../mcp.ts"

const json = (content: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(content), { headers: { "content-type": "application/json" }, ...init })

test("parses a direct JSON-RPC text result", () => {
  assert.equal(
    parseMcpResponse(JSON.stringify({ result: { content: [{ type: "text", text: "answer" }] } })),
    "answer",
  )
})

test("parses SSE and ignores done and unrelated frames", () => {
  const body = [
    "event: message",
    "data: [DONE]",
    'data: {"result":{"other":true}}',
    'data: {"result":{"content":[{"type":"text","text":"  "},{"type":"text","text":"found"}]}}',
  ].join("\n")
  assert.equal(parseMcpResponse(body), "found")
})

test("maps empty direct and SSE results to the no-results message", async () => {
  const direct = await callMcp("https://example.test", "search", {}, { fetch: async () => json({ result: { content: [] } }) })
  const sse = await callMcp("https://example.test", "search", {}, {
    fetch: async () => new Response("event: message\ndata: [DONE]\n"),
  })
  assert.equal(direct, NO_RESULTS)
  assert.equal(sse, NO_RESULTS)
})

test("surfaces malformed payloads and JSON-RPC errors", () => {
  assert.throws(() => parseMcpResponse("{"))
  assert.throws(() => parseMcpResponse('{"error":{"message":"bad request"}}'), /bad request/)
})

test("sends a stateless tools/call request", async () => {
  let request: Request | undefined
  await callMcp("https://example.test", "search", { query: "pi" }, {
    fetch: async (input, init) => {
      request = new Request(input, init)
      return json({ result: { content: [{ text: "ok" }] } })
    },
  })
  assert.equal(request?.headers.get("accept"), "application/json, text/event-stream")
  assert.deepEqual(await request?.json(), {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "search", arguments: { query: "pi" } },
  })
})

test("rejects oversized bodies and cancels streamed overflow", async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(MAX_MCP_RESPONSE_BYTES + 1))
    },
    cancel() {
      cancelled = true
    },
  })
  await assert.rejects(
    callMcp("https://example.test", "search", {}, { fetch: async () => new Response(stream) }),
    /too large/,
  )
  assert.equal(cancelled, true)

  await assert.rejects(
    callMcp("https://example.test", "search", {}, {
      fetch: async () => new Response("small", { headers: { "content-length": String(MAX_MCP_RESPONSE_BYTES + 1) } }),
    }),
    /too large/,
  )
})

test("times out response acquisition and body streaming", async () => {
  const stalledFetch: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }))
  await assert.rejects(callMcp("https://example.test", "search", {}, { fetch: stalledFetch, timeoutMs: 5 }), /timeout/i)

  const stalledBody = new ReadableStream<Uint8Array>({ pull() {} })
  await assert.rejects(
    callMcp("https://example.test", "search", {}, { fetch: async () => new Response(stalledBody), timeoutMs: 5 }),
    /timeout/i,
  )
})

test("aborts promptly from the caller signal", async () => {
  const controller = new AbortController()
  const pending = callMcp("https://example.test", "search", {}, {
    fetch: (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })),
    signal: controller.signal,
  })
  controller.abort(new Error("cancelled"))
  await assert.rejects(pending, /cancelled/)
})
