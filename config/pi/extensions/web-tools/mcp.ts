export const MAX_MCP_RESPONSE_BYTES = 256 * 1024
export const NO_RESULTS = "No search results found. Please try a different query."

function textFromPayload(payload: string): string | undefined {
  const trimmed = payload.trim()
  if (!trimmed || trimmed === "[DONE]" || !trimmed.startsWith("{")) return

  const value = JSON.parse(trimmed) as {
    error?: { message?: string }
    result?: { content?: Array<{ text?: unknown }> }
  }
  if (value.error) throw new Error(value.error.message || "MCP request failed")
  if (!Array.isArray(value.result?.content)) return
  return value.result.content.find((item) => typeof item.text === "string" && item.text.trim().length > 0)?.text as
    | string
    | undefined
}

export function parseMcpResponse(body: string): string | undefined {
  const trimmed = body.trim()
  if (trimmed.startsWith("{")) return textFromPayload(trimmed)

  let sse = false
  for (const line of body.split("\n")) {
    if (line.startsWith("event:")) sse = true
    if (!line.startsWith("data: ")) continue
    sse = true
    const text = textFromPayload(line.slice(6))
    if (text) return text
  }
  if (trimmed && !sse) throw new Error("Malformed MCP response")
}

export async function collectBoundedBody(
  response: Response,
  signal: AbortSignal,
  maxBytes: number,
  errorMessage: string,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel()
    throw new Error(errorMessage)
  }
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  if (signal.aborted) {
    await reader.cancel(signal.reason)
    signal.throwIfAborted()
  }
  const chunks: Uint8Array[] = []
  let size = 0
  const cancel = () => void reader.cancel(signal.reason).catch(() => {})
  signal.addEventListener("abort", cancel, { once: true })
  try {
    while (true) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new Error(errorMessage)
      }
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener("abort", cancel)
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function callMcp(
  url: string,
  tool: string,
  args: Record<string, unknown>,
  options: {
    headers?: Record<string, string>
    signal?: AbortSignal
    fetch?: typeof fetch
    timeoutMs?: number
  } = {},
): Promise<string> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 25_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const response = await (options.fetch ?? fetch)(url, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "User-Agent": "pi-web-tools/0.1.0",
      ...options.headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
    signal,
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`MCP request failed (${response.status})`)
  }
  const body = await collectBoundedBody(response, signal, MAX_MCP_RESPONSE_BYTES, "MCP response too large")
  return parseMcpResponse(new TextDecoder().decode(body)) ?? NO_RESULTS
}
