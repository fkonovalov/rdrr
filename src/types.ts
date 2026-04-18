export interface ParseOptions {
  language?: string
  includeLlmsTxt?: boolean
  /** For aggregate URLs (e.g. x.com profiles): max items to include. */
  limit?: number
  /** For aggregate URLs: chronological order within the fetched window. */
  order?: "newest" | "oldest"
  /**
   * Allow requests to private, loopback, link-local and ULA addresses.
   * Defaults to `false` to prevent SSRF when `rdrr` is exposed as a service.
   */
  allowPrivateNetworks?: boolean
  /**
   * GitHub API token for issue/PR/file requests. Falls back to `process.env.GITHUB_TOKEN`.
   * Use a fine-grained token with `public_repo` read scope for most cases.
   */
  githubToken?: string
  /** Words-per-minute for `readTime` estimation. Defaults to 200. */
  wordsPerMinute?: number
  /** Abort signal forwarded to every underlying fetch. */
  signal?: AbortSignal
  /** Per-request timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number
  /** Override the outbound User-Agent header. */
  userAgent?: string
}

export interface ParseResult {
  type: "youtube" | "webpage" | "github" | "pdf" | "x-profile" | "x-status"
  title: string
  author: string
  content: string
  description: string
  domain: string
  siteName: string
  language?: string
  dir?: "ltr" | "rtl"
  published: string | null
  wordCount: number
  readTime: string
  llmsTxt?: string
}

export interface Chapter {
  title: string
  startTime: number
  formattedTime: string
}

export interface TranscriptSegment {
  text: string
  startTime: number
  endTime: number
  formattedTime: string
  speaker?: string
  chapterIndex: number
}

export interface YouTubeResult extends ParseResult {
  type: "youtube"
  videoId: string
  thumbnailUrl: string | null
  chapters: Chapter[]
  transcript: TranscriptSegment[]
  isLyric: boolean
}

export interface WebpageResult extends ParseResult {
  type: "webpage"
}

export interface GitHubResult extends ParseResult {
  type: "github"
}

export interface PdfResult extends ParseResult {
  type: "pdf"
}

export interface XProfileResult extends ParseResult {
  type: "x-profile"
  handle: string
  postCount: number
}

export interface XStatusResult extends ParseResult {
  type: "x-status"
  handle: string
  statusId: string
  /** Which upstream strategy produced the result (e.g. "fxtwitter", "syndication"). */
  source: string
}
