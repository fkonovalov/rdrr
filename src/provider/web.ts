import { countWords, estimateReadTime } from "@shared"
import "../extract/sites/init"
import type { ParseOptions, WebpageResult } from "../types"
import { extractAsync } from "../extract/engine"
import { toMarkdown } from "../extract/markdown"
import { parseLinkedomHTML } from "../extract/utils/parse-html"

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const SIMPLE_UA = "rdrr/1.0 (reader)"
const MAX_REDIRECTS = 10

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

export interface ParseHtmlOptions extends ParseOptions {
  /** Optional base URL — used to resolve relative links, set domain metadata, and match site extractors. */
  url?: string
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
    readTime: estimateReadTime(result.wordCount),
  }
}

export const parseWeb = async (url: string, options?: ParseOptions): Promise<WebpageResult> => {
  const res = await fetchWithRedirects(url, options?.language)

  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`)

  const contentType = res.headers.get("content-type") ?? ""

  if (isRawText(contentType, url)) {
    const text = await res.text()
    return rawTextResult(text, url)
  }

  if (contentType.includes("application/pdf")) {
    const { parsePdf } = await import("./pdf")
    return parsePdf(url, options) as unknown as WebpageResult
  }

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Unsupported content type: ${contentType}`)
  }

  const html = await res.text()
  return parseHtml(html, { ...options, url })
}

const isRawText = (contentType: string, url: string): boolean =>
  RAW_TEXT_TYPES.some((t) => contentType.includes(t)) || RAW_TEXT_EXT.test(new URL(url).pathname)

const rawTextResult = (text: string, url: string): WebpageResult => {
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
    readTime: estimateReadTime(wc),
  }
}

export const fetchWithRedirects = async (url: string, language?: string): Promise<Response> => {
  const res = await tryFetch(url, USER_AGENT, language)
  if (res) return res

  const fallback = await tryFetch(url, SIMPLE_UA, language)
  if (fallback) return fallback

  throw new Error(`Could not fetch ${safeDomain(url)}: redirect loop or authentication required`)
}

const tryFetch = async (url: string, userAgent: string, language?: string): Promise<Response | null> => {
  const visited = new Set<string>()
  let current = url

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    visited.add(current)

    const res = await fetch(current, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": language ?? "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    })

    if (res.status < 300 || res.status >= 400) return res

    const location = res.headers.get("location")
    if (!location) return res

    const next = new URL(location, current).href
    if (visited.has(next)) return null

    current = next
  }

  return null
}

const safeDomain = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}
