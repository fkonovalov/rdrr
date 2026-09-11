import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { ParseResult } from "../types"
import type { FetchField } from "./schemas"
import { estimateTokens } from "../cli/budget"
import { computeQuality } from "../cli/quality"
import { errorResult } from "./errors"
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
  "No content could be extracted from this URL. The source may require JavaScript, block automated access, " +
  "or have no available transcript. Try a browser-based tool or another source."

const MAX_RESPONSE_TOKENS = 24_000

export const boundedResult = (text: string, structured: Record<string, unknown>): CallToolResult => {
  const result: CallToolResult = { content: [{ type: "text", text }], structuredContent: structured }
  if (estimateTokens(JSON.stringify(result)) <= MAX_RESPONSE_TOKENS) return result
  const error = new Error(
    "Response exceeds the estimated 24,000-token limit including metadata. " +
      'Retry fetch/extract_html with fields: ["content"], a smaller maxTokens, or a smaller batch.',
  )
  error.name = "ResponseTooLargeError"
  return errorResult(error)
}

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
    ["next_page", structured.nextPageUrl],
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
