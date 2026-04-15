export interface ParseOptions {
  language?: string
  noCache?: boolean
  includeLlmsTxt?: boolean
  /** For aggregate URLs (e.g. x.com profiles): max items to include. */
  limit?: number
  /** For aggregate URLs: chronological order within the fetched window. */
  order?: "newest" | "oldest"
}

export interface ParseResult {
  type: "youtube" | "webpage" | "github" | "pdf" | "x-profile"
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
