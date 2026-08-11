import { Parser } from "htmlparser2"
import TurndownService from "turndown"
import { collectBoundedBody } from "./mcp.ts"

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
export const DEFAULT_TIMEOUT_SECONDS = 30
export const MAX_TIMEOUT_SECONDS = 120

export type WebFetchFormat = "text" | "markdown" | "html"
export interface WebFetchResult {
  url: string
  contentType: string
  format: WebFetchFormat
  output: string
}

const browserUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"

function acceptHeader(format: WebFetchFormat): string {
  if (format === "markdown")
    return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
  if (format === "text") return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
  return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
}

function requestHeaders(format: WebFetchFormat, userAgent: string): HeadersInit {
  return {
    "User-Agent": userAgent,
    Accept: acceptHeader(format),
    "Accept-Language": "en-US,en;q=0.9",
  }
}

function mimeFrom(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function isTextualMime(mime: string): boolean {
  return (
    !mime ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime.endsWith("+json") ||
    mime === "application/xml" ||
    mime.endsWith("+xml") ||
    mime === "application/javascript" ||
    mime === "application/x-javascript"
  )
}

export function extractTextFromHTML(html: string): string {
  let text = ""
  let skipDepth = 0
  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)) skipDepth++
    },
    ontext(input) {
      if (skipDepth === 0) text += input
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--
    },
  })
  parser.write(html)
  parser.end()
  return text.trim()
}

export function convertHTMLToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  turndown.remove(["script", "style", "meta", "link"])
  return turndown.turndown(html)
}

export async function fetchWeb(
  inputUrl: string,
  options: { format?: WebFetchFormat; timeout?: number; signal?: AbortSignal } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<WebFetchResult> {
  const url = new URL(inputUrl)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("URL must use HTTP or HTTPS")
  if (options.timeout !== undefined && (options.timeout <= 0 || options.timeout > MAX_TIMEOUT_SECONDS))
    throw new Error(`Timeout must be greater than 0 and at most ${MAX_TIMEOUT_SECONDS} seconds`)

  const format = options.format ?? "markdown"
  const timeout = AbortSignal.timeout((options.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const request = (userAgent: string) =>
    fetchImpl(inputUrl, { headers: requestHeaders(format, userAgent), redirect: "follow", signal })

  let response = await request(browserUserAgent)
  if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
    await response.body?.cancel()
    response = await request("pi-web-tools/0.1.0")
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Request failed (${response.status})`)
  }

  const contentType = response.headers.get("content-type") || ""
  const mime = mimeFrom(contentType)
  if (!isTextualMime(mime)) {
    await response.body?.cancel()
    const kind = mime.startsWith("image/") ? "image" : "file"
    throw new Error(`Unsupported fetched ${kind} content type: ${mime}`)
  }

  const body = await collectBoundedBody(
    response,
    signal,
    MAX_RESPONSE_BYTES,
    `Response too large (exceeds ${MAX_RESPONSE_BYTES} byte limit)`,
  )
  const content = new TextDecoder().decode(body)
  const output = mime === "text/html"
    ? format === "markdown"
      ? convertHTMLToMarkdown(content)
      : format === "text"
        ? extractTextFromHTML(content)
        : content
    : content
  return { url: inputUrl, contentType, format, output }
}
