import type { ParseResult } from "../types"
import type { FetchField } from "./schemas"
import { computeQuality } from "../cli/quality"
import { paginate, type PageInfo } from "./paginate"

export interface ShapeOptions {
  maxTokens: number
  startIndex: number
  includeQuality: boolean
  fields?: FetchField[]
  /** Source URL, shown in the text header. */
  source?: string
}

export interface ShapedResult {
  text: string
  structured: Record<string, unknown>
}

const EMPTY_NOTE =
  "No content could be extracted from this URL. The page is likely JS-rendered (SPA) or behind a bot wall; " +
  "rdrr does not execute JavaScript. Use a browser-based tool for this URL."

/** Keys every ParseResult carries; anything else is a type-specific extra. */
const BASE_RESULT_KEYS = new Set([
  "type",
  "title",
  "author",
  "content",
  "description",
  "domain",
  "siteName",
  "language",
  "dir",
  "published",
  "wordCount",
  "readTime",
  "llmsTxt",
])

/** Turn a ParseResult into the MCP tool response pair: markdown text block + structured metadata. */
export const shapeFetchResult = (result: ParseResult, options: ShapeOptions): ShapedResult => {
  const wants = (field: FetchField): boolean => !options.fields || options.fields.includes(field)
  const extractionEmpty = result.content.trim() === ""
  const structured: Record<string, unknown> = {}
  let body = ""
  let truncated: PageInfo | undefined

  if (wants("content")) {
    const page = paginate(result.content, options.startIndex, options.maxTokens)
    // The body lives only in the text block; duplicating it into
    // structuredContent would double the response against the host's
    // 25k-token cap.
    body = page.body
    truncated = page.truncated
    if (page.truncated) structured.truncated = page.truncated
  }
  if (wants("title")) structured.title = result.title
  if (wants("author")) structured.author = result.author
  if (wants("metadata")) {
    structured.type = result.type
    if (result.description) structured.description = result.description
    if (result.siteName) structured.siteName = result.siteName
    if (result.domain) structured.domain = result.domain
    if (result.language) structured.language = result.language
    structured.published = result.published
    structured.wordCount = result.wordCount
    structured.readTime = result.readTime
    // Type-specific scalar fields (videoId, statusId, handle, ...) flow
    // through; content-heavy arrays (transcript, chapters) stay out.
    Object.assign(structured, scalarExtras(result))
  }
  if (extractionEmpty) structured.extractionEmpty = true
  if (options.includeQuality || options.fields?.includes("quality")) {
    structured.quality = computeQuality(result)
  }

  const text = renderText(structured, {
    body,
    truncated,
    extractionEmpty,
    includeBody: wants("content"),
    source: options.source,
  })
  return { text, structured }
}

const scalarExtras = (result: ParseResult): Record<string, unknown> => {
  const extras: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(result)) {
    if (BASE_RESULT_KEYS.has(key)) continue
    const kind = typeof value
    if (kind === "string" || kind === "number" || kind === "boolean") extras[key] = value
  }
  return extras
}

interface RenderOptions {
  body: string
  truncated: PageInfo | undefined
  extractionEmpty: boolean
  includeBody: boolean
  source?: string
}

// YAML double-quoted strings accept the JSON string grammar.
const yamlString = (value: string): string => JSON.stringify(value.replace(/\n/g, " "))

const renderText = (structured: Record<string, unknown>, options: RenderOptions): string => {
  const entries: Array<[string, unknown]> = [
    ["title", structured.title],
    ["author", structured.author],
    ["site", structured.siteName],
    ["type", structured.type],
    ["source", options.source],
    ["domain", structured.domain],
    ["language", structured.language],
    ["published", structured.published],
    ["word_count", structured.wordCount],
    ["read_time", structured.readTime],
    ["extraction", options.extractionEmpty ? "empty" : undefined],
  ]
  const lines = entries
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "string" ? yamlString(value) : value}`)
  const header = lines.length > 0 ? `---\n${lines.join("\n")}\n---` : ""

  if (!options.includeBody) return header || "(metadata only)"

  const body = options.extractionEmpty ? EMPTY_NOTE : options.body
  const hint = options.truncated ? `[fetch again with startIndex=${options.truncated.nextStartIndex} to continue]` : ""
  return [header, body, hint].filter(Boolean).join("\n\n")
}
