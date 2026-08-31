import { countWords, estimateReadTime, mergeSignals, safeDomain } from "@shared"
import "../extract/sites/init"
import type { ParseOptions, WebpageResult } from "../types"
import { extractAsync } from "../extract/engine"
import { toMarkdown } from "../extract/markdown"
import { parseLinkedomHTML } from "../extract/utils/parse-html"
import { assertPublicUrl } from "../security/ssrf"

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const SIMPLE_UA = "rdrr/1.0 (reader)"
const MAX_REDIRECTS = 10
const DEFAULT_TIMEOUT_MS = 25000

interface FetchOpts {
  language?: string
  allowPrivateNetworks?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  userAgent?: string
}

const RAW_TEXT_TYPES = [
  "text/plain",
  "text/csv",
  "text/xml",
  "text/yaml",
  "text/markdown",
  "application/json",
  "application/xml",
  "application/yaml",
  "application/rss+xml",
  "application/atom+xml",
]

const RAW_TEXT_EXT = /\.(txt|json|csv|xml|yaml|yml|md|rss|atom|log|tsv|toml|ini|cfg|conf)(\?|$)/i

export interface ParseHtmlOptions {
  /** Optional base URL -- used to resolve relative links, set domain metadata, and match site extractors. */
  url?: string
  /** Preferred content language (BCP 47). Passed to the extraction pipeline. */
  language?: string
  /** Words-per-minute for `readTime`. Defaults to 200. */
  wordsPerMinute?: number
}

export const parseHtml = async (html: string, options?: ParseHtmlOptions): Promise<WebpageResult> => {
  const url = options?.url ?? ""
  const doc = parseLinkedomHTML(html, url || undefined)

  const result = await extractAsync(doc, { url })
  const markdown = toMarkdown(result.content, url)

  return {
    type: "webpage",
    title: result.title || "",
    author: result.author || "",
    content: markdown,
    description: result.description || "",
    domain: result.domain || "",
    siteName: result.siteName || "",
    language: result.language,
    dir: result.dir,
    published: result.published || null,
    wordCount: result.wordCount,
    readTime: estimateReadTime(result.wordCount, options?.wordsPerMinute),
  }
}

export const parseWeb = async (url: string, options?: ParseOptions): Promise<WebpageResult> => {
  const res = await fetchWithRedirects(url, options)

  if (!res.ok) throw new Error(fetchErrorMessage(res.status, res.statusText, url))

  const contentType = res.headers.get("content-type") ?? ""

  // Check the pathname too: misconfigured servers ship .pdf files as
  // text/plain, which would otherwise dump raw PDF binary into the output.
  if (contentType.includes("application/pdf") || isPdfPath(url)) {
    throw new Error("PDF parsing is not supported (removed in v0.5.0). Use a dedicated PDF tool for this URL.")
  }

  if (isRawText(contentType, url)) {
    const text = await res.text()
    return rawTextResult(text, url, options?.wordsPerMinute)
  }

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Unsupported content type: ${contentType}`)
  }

  const html = await res.text()
  return parseHtml(html, { url, language: options?.language, wordsPerMinute: options?.wordsPerMinute })
}

const fetchErrorMessage = (status: number, statusText: string, url: string): string => {
  const base = `Failed to fetch: ${status} ${statusText}`.trimEnd()
  const domain = safeDomain(url)
  if (status === 403 || status === 429) {
    return `${base}. ${domain} blocks automated clients; rdrr cannot bypass this. Use a browser-based tool for this URL.`
  }
  if (status === 401) {
    return `${base}. ${domain} requires authentication; rdrr only reads public pages.`
  }
  if (status === 404) {
    return `${base}. Nothing exists at this path on ${domain}; the URL itself is likely wrong (typo, moved page, or a guessed link).`
  }
  if (status >= 500) {
    return `${base}. ${domain} returned a server error; retry later.`
  }
  return base
}

const NETWORK_ERROR_HINTS: Record<string, string> = {
  ENOTFOUND: "DNS lookup failed; the domain may not exist",
  EAI_AGAIN: "temporary DNS failure; retry",
  ECONNREFUSED: "the server refused the connection",
  ECONNRESET: "the server dropped the connection",
  ETIMEDOUT: "TCP connection timed out",
  EHOSTUNREACH: "host unreachable",
  ENETUNREACH: "network unreachable",
  UND_ERR_CONNECT_TIMEOUT: "connection timed out",
  UND_ERR_SOCKET: "the connection was closed mid-response",
  CERT_HAS_EXPIRED: "the site's TLS certificate has expired",
  DEPTH_ZERO_SELF_SIGNED_CERT: "the site uses a self-signed TLS certificate",
  SELF_SIGNED_CERT_IN_CHAIN: "the site's TLS chain contains a self-signed certificate",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "the site's TLS certificate could not be verified",
  ERR_TLS_CERT_ALTNAME_INVALID: "the TLS certificate does not match the hostname",
}

/**
 * Node's fetch throws a bare `TypeError: fetch failed` with the real reason
 * buried in `cause`. Surface the errno and a plain-language hint so callers
 * (and agents reading stderr) can pick the right next step.
 */
const describeNetworkError = (err: unknown, url: string): Error => {
  const cause = (err as { cause?: { code?: unknown; message?: unknown } }).cause
  const code = typeof cause?.code === "string" ? cause.code : ""
  const detail = code || (typeof cause?.message === "string" ? cause.message : "") || "network error"
  const hint = NETWORK_ERROR_HINTS[code]
  const wrapped = new Error(`Could not fetch ${safeDomain(url)}: ${detail}${hint ? ` (${hint})` : ""}`)
  wrapped.cause = err
  return wrapped
}

const isPdfPath = (url: string): boolean => {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf")
  } catch {
    return false
  }
}

const isRawText = (contentType: string, url: string): boolean =>
  RAW_TEXT_TYPES.some((t) => contentType.includes(t)) || RAW_TEXT_EXT.test(new URL(url).pathname)

const rawTextResult = (text: string, url: string, wpm?: number): WebpageResult => {
  const pathname = new URL(url).pathname
  const ext = pathname.match(/\.(\w+)(\?|$)/)?.[1]?.toLowerCase() ?? ""
  const langMap: Record<string, string> = {
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    csv: "csv",
    tsv: "tsv",
    toml: "toml",
    ini: "ini",
    rss: "xml",
    atom: "xml",
  }

  const isPlain = ext === "md" || ext === "txt" || ["text/markdown", "text/plain"].some((t) => t.includes(ext))
  const content = isPlain ? text : "```" + (langMap[ext] ?? "") + "\n" + text + "\n```"
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? pathname.split("/").pop() ?? pathname
  const wc = countWords(text)

  return {
    type: "webpage",
    title,
    author: "",
    content,
    description: "",
    domain: new URL(url).hostname,
    siteName: "",
    published: null,
    wordCount: wc,
    readTime: estimateReadTime(wc, wpm),
  }
}

export const fetchWithRedirects = async (url: string, opts: FetchOpts = {}): Promise<Response> => {
  // If the caller pinned a User-Agent, honour it exclusively -- no silent fallback.
  if (opts.userAgent) {
    const only = await tryFetch(url, opts.userAgent, opts)
    if (only) return only
    throw new Error(`Could not fetch ${safeDomain(url)}: redirect loop or authentication required`)
  }

  // Try a browser UA first. Fall back to the simple UA when:
  //   - redirect loop was detected (tryFetch returned null), or
  //   - the server responded with 403/429/503 which sometimes signals UA-based gating.
  const primary = await tryFetch(url, USER_AGENT, opts)
  if (primary && !shouldRetryWithSimpleUa(primary.status)) return primary

  const fallback = await tryFetch(url, SIMPLE_UA, opts)
  if (fallback) return fallback
  if (primary) return primary

  throw new Error(`Could not fetch ${safeDomain(url)}: redirect loop or authentication required`)
}

const shouldRetryWithSimpleUa = (status: number): boolean => status === 403 || status === 429 || status === 503

const tryFetch = async (url: string, userAgent: string, opts: FetchOpts): Promise<Response | null> => {
  const visited = new Set<string>()
  let current = url

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    visited.add(current)

    if (!opts.allowPrivateNetworks) await assertPublicUrl(current)

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let res: Response
    try {
      res = await fetch(current, {
        headers: {
          "User-Agent": userAgent,
          "Accept": "text/html,application/xhtml+xml,*/*",
          "Accept-Language": opts.language ?? "en-US,en;q=0.9",
        },
        signal: mergeSignals(timeoutMs, opts.signal),
        redirect: "manual",
      })
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        // Keep the TimeoutError name so programmatic consumers can branch on
        // it; the CLI adds its --timeout hint at the presentation layer.
        const timeout = new Error(`Timed out after ${timeoutMs}ms fetching ${safeDomain(current)}`)
        timeout.name = "TimeoutError"
        throw timeout
      }
      if (err instanceof TypeError) throw describeNetworkError(err, current)
      throw err
    }

    if (res.status < 300 || res.status >= 400) return res

    const location = res.headers.get("location")
    if (!location) {
      throw new Error(`Redirect (${res.status}) without Location header from ${safeDomain(current)}`)
    }

    const next = new URL(location, current)

    // Refuse https:// -> http:// downgrades. An attacker-controlled upstream
    // could otherwise strip TLS and intercept the follow-up request.
    if (new URL(current).protocol === "https:" && next.protocol === "http:") {
      throw new Error(`Refusing https -> http redirect to ${next.hostname}`)
    }

    if (visited.has(next.href)) return null

    current = next.href
  }

  return null
}
