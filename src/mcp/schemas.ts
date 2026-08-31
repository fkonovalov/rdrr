import { z } from "zod"
import type { UrlType } from "../detect"

// Claude Code, Claude Desktop, and Cursor enforce a 25k-token limit on MCP
// tool responses. The body appears once, in the text block (structuredContent
// carries metadata only), so even the max budget stays under the cap.
const DEFAULT_MAX_TOKENS = 10_000
const MAX_MAX_TOKENS = 20_000

const FETCH_FIELDS = ["content", "title", "author", "metadata", "quality"] as const
export type FetchField = (typeof FETCH_FIELDS)[number]

const language = z.string().optional().describe("Preferred content language (BCP 47), e.g. 'en', 'ru'")

const includeQuality = z
  .boolean()
  .default(false)
  .describe(
    "Compute a readability quality score (0-100) and verdict (good/partial/poor). Use it to decide whether to fall back to another tool",
  )

const maxTokens = z
  .number()
  .int()
  .positive()
  .max(MAX_MAX_TOKENS)
  .default(DEFAULT_MAX_TOKENS)
  .describe(
    `Token budget for the markdown body, cut at a paragraph boundary. Default ${DEFAULT_MAX_TOKENS} keeps the response inside the 25k-token limit MCP hosts enforce. Paginate with startIndex when you need more`,
  )

const startIndex = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe("Character offset into the full body. To paginate, pass the nextStartIndex from the previous response")

const fields = z
  .array(z.enum(FETCH_FIELDS))
  .optional()
  .describe("Restrict the response to specific fields to save context. Default returns content plus all metadata")

const timeoutMs = z
  .number()
  .int()
  .positive()
  .max(60_000)
  .optional()
  .describe("Per-request timeout in milliseconds. Default 25000")

const force = z.boolean().default(false).describe("Bypass the per-session in-memory cache")

export const fetchInputShape = {
  url: z.url().describe("URL to fetch and convert to clean markdown"),
  language,
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Max items for aggregate URLs like X profiles. Default 10"),
  order: z.enum(["newest", "oldest"]).optional().describe("For aggregate URLs: chronological order"),
  includeLlmsTxt: z.boolean().default(false).describe("Append the site's /llms.txt if present"),
  includeQuality,
  maxTokens,
  startIndex,
  fields,
  timeoutMs,
  force,
}

const truncatedSchema = z.object({
  kept: z.number().describe("Estimated tokens included in this response"),
  total: z.number().describe("Estimated tokens in the full document body"),
  nextStartIndex: z.number().describe("Pass as startIndex in the next call to continue reading"),
  hint: z.string(),
})

const qualitySchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["good", "partial", "poor"]),
  signals: z.object({
    textDensity: z.number(),
    linkRatio: z.number(),
    paragraphCount: z.number(),
    hasTitle: z.boolean(),
    hasByline: z.boolean(),
    contentLength: z.number(),
    boilerplateRatio: z.number(),
  }),
})

// The markdown body is NOT part of structuredContent -- it arrives once, in
// the text content block. structuredContent carries metadata and pagination.
export const fetchOutputShape = {
  type: z.enum(["webpage", "youtube", "github", "stackoverflow", "x-profile", "x-status"]).optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
  domain: z.string().optional(),
  language: z.string().optional(),
  published: z.string().nullable().optional(),
  wordCount: z.number().optional(),
  readTime: z.string().optional(),
  extractionEmpty: z
    .boolean()
    .optional()
    .describe("True when extraction produced no content: the page is likely JS-rendered or behind a bot wall"),
  truncated: truncatedSchema.optional().describe("Present when the body was cut to fit the token budget"),
  quality: qualitySchema.optional(),
}

export const parallelFetchInputShape = {
  urls: z.array(z.url()).min(1).max(10).describe("URLs to fetch concurrently, max 10 per call"),
  language,
  includeQuality,
  perItemMaxTokens: z
    .number()
    .int()
    .positive()
    .max(8000)
    .default(4000)
    .describe("Token budget per URL. The total response is additionally capped to fit the MCP 25k-token limit"),
  timeoutMs,
  force,
}

export const parallelFetchOutputShape = {
  results: z.array(
    z.object({
      url: z.string(),
      error: z
        .object({ kind: z.string(), message: z.string() })
        .optional()
        .describe("Present when this URL failed; other results are unaffected"),
      ...fetchOutputShape,
    }),
  ),
  meta: z.object({
    requested: z.number(),
    returned: z.number(),
    truncatedAt: z.number().optional().describe("Index of the first URL dropped to fit the response token budget"),
  }),
}

const URL_TYPE_VALUES = [
  "youtube",
  "github-issue",
  "github-discussion",
  "github-file",
  "stackoverflow",
  "x-profile",
  "x-status",
  "webpage",
] as const satisfies readonly UrlType[]

export const checkInputShape = {
  url: z.url().describe("URL to probe"),
}

export const checkOutputShape = {
  url: z.string().describe("The URL as submitted"),
  normalizedUrl: z.string().describe("Canonicalized URL (https, no fragment, no trailing slash)"),
  type: z.enum(URL_TYPE_VALUES).describe("Detected URL type used for routing"),
  readable: z.boolean().describe("Whether the page likely yields meaningful article content"),
}

export const extractHtmlInputShape = {
  html: z.string().min(1).describe("Raw HTML to run through the extraction pipeline"),
  url: z.url().optional().describe("Base URL used to resolve relative links and pick site-specific extractors"),
  language,
  includeQuality,
  maxTokens,
  startIndex,
  fields,
}
