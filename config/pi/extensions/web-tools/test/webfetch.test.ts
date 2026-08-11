import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { fetchWeb, MAX_RESPONSE_BYTES } from "../webfetch.ts"

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { headers: { "content-type": "text/html", ...init.headers }, ...init })

test("defaults to Markdown and preserves HTTP URLs", async () => {
  let requested = ""
  const result = await fetchWeb("http://example.test/page", {}, async (input) => {
    requested = String(input)
    return html("<h1>Hello</h1><script>alert(1)</script><p><em>world</em></p>")
  })
  assert.equal(requested, "http://example.test/page")
  assert.equal(result.format, "markdown")
  assert.equal(result.output, "# Hello\n\n*world*")
})

test("validates timeout and rejects non-HTTP schemes before networking", async () => {
  for (const timeout of [0, -1, 121]) await assert.rejects(fetchWeb("https://example.test", { timeout }), /timeout/i)
  let called = false
  await assert.rejects(fetchWeb("file:///etc/passwd", {}, async () => {
    called = true
    return new Response()
  }), /HTTP or HTTPS/)
  assert.equal(called, false)
})

test("allows localhost and follows redirects", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/from") {
      response.writeHead(302, { location: "/to" })
      response.end()
      return
    }
    response.writeHead(200, { "content-type": "text/plain" })
    response.end("redirected")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => server.close())
  const address = server.address()
  assert(address && typeof address === "object")
  assert.equal((await fetchWeb(`http://127.0.0.1:${address.port}/from`)).output, "redirected")
})

test("converts HTML to text and returns HTML unchanged", async () => {
  const source = "<style>bad</style><p>Hello <strong>there</strong></p><noscript>hidden</noscript><iframe>hidden</iframe>"
  const text = await fetchWeb("https://example.test", { format: "text" }, async () => html(source))
  const raw = await fetchWeb("https://example.test", { format: "html" }, async () => html(source))
  const mixedCase = await fetchWeb("https://example.test", { format: "text" }, async () =>
    new Response("<p>case insensitive</p>", { headers: { "content-type": "Text/HTML; charset=UTF-8" } }),
  )
  assert.equal(text.output, "Hello there")
  assert.equal(raw.output, source)
  assert.equal(mixedCase.output, "case insensitive")
})

test("keeps non-HTML textual content and rejects images and PDFs", async () => {
  assert.equal(
    (await fetchWeb("https://example.test", {}, async () => new Response('{"ok":true}', { headers: { "content-type": "application/json" } }))).output,
    '{"ok":true}',
  )
  for (const contentType of ["image/png", "application/pdf"]) {
    await assert.rejects(
      fetchWeb("https://example.test", {}, async () => new Response("file", { headers: { "content-type": contentType } })),
      /Unsupported fetched/,
    )
  }
})

test("rejects declared and streamed bodies over 5 MiB and cancels overflow", async () => {
  await assert.rejects(
    fetchWeb("https://example.test", {}, async () =>
      new Response("small", { headers: { "content-type": "text/plain", "content-length": String(MAX_RESPONSE_BYTES + 1) } })),
    /too large/,
  )

  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1))
    },
    cancel() {
      cancelled = true
    },
  })
  await assert.rejects(
    fetchWeb("https://example.test", {}, async () => new Response(stream, { headers: { "content-type": "text/plain" } })),
    /too large/,
  )
  assert.equal(cancelled, true)
})

test("retries a Cloudflare challenge exactly once with the honest user agent", async () => {
  const agents: string[] = []
  const result = await fetchWeb("https://example.test", {}, async (_input, init) => {
    agents.push(new Headers(init?.headers).get("user-agent") || "")
    return agents.length === 1
      ? new Response("challenge", { status: 403, headers: { "cf-mitigated": "challenge" } })
      : new Response("ok", { headers: { "content-type": "text/plain" } })
  })
  assert.match(agents[0], /Chrome/)
  assert.deepEqual(agents.slice(1), ["pi-web-tools/0.1.0"])
  assert.equal(result.output, "ok")
})

test("times out stalled acquisition and body streaming", async () => {
  const stalledFetch: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }))
  await assert.rejects(fetchWeb("https://example.test", { timeout: 0.005 }, stalledFetch), /timeout/i)

  await assert.rejects(
    fetchWeb("https://example.test", { timeout: 0.005 }, async () => new Response(new ReadableStream({ pull() {} }))),
    /timeout/i,
  )
})

test("aborts promptly from Pi's signal", async () => {
  const controller = new AbortController()
  const pending = fetchWeb("https://example.test", { signal: controller.signal }, (_input, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })),
  )
  controller.abort(new Error("cancelled"))
  await assert.rejects(pending, /cancelled/)
})
