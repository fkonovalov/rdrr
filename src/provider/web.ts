import { countWords, estimateReadTime, mergeSignals, safeDomain } from "@shared"
import "../extract/sites/init"
import type { ParseOptions, PdfResult, WebpageResult } from "../types"
import { extractAsync } from "../extract/engine"
import { toMarkdown } from "../extract/markdown"
import { parseLinkedomHTML } from "../extract/utils/parse-html"
import { assertPublicUrl } from "../security/ssrf"

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const SIMPLE_UA = "rdrr/1.0 (reader)"
const MAX_REDIRECTS = 10
const DEFAULT_TIMEOUT_MS = 15000

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

export const parseWeb = async (url: string, options?: ParseOptions): Promise<WebpageResult | PdfResult> => {
  const res = await fetchWithRedirects(url, options)

  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`)

  const contentType = res.headers.get("content-type") ?? ""

  if (isRawText(contentType, url)) {
    const text = await res.text()
    return rawTextResult(text, url, options?.wordsPerMinute)
  }

  if (contentType.includes("application/pdf")) {
    const { parsePdf } = await import("./pdf")
    return parsePdf(url, options)
  }

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Unsupported content type: ${contentType}`)
  }

  const html = await res.text()
  return parseHtml(html, { url, language: options?.language, wordsPerMinute: options?.wordsPerMinute })
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

    const res = await fetch(current, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": opts.language ?? "en-US,en;q=0.9",
      },
      signal: mergeSignals(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal),
      redirect: "manual",
    })

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

