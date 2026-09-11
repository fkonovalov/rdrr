export interface ExtractOptions {
  signal?: AbortSignal
  timeoutMs?: number
  userAgent?: string
  url?: string
  markdown?: boolean
  debug?: boolean
  language?: string
}

export interface ExtractResult {
  nextPageUrl?: string
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
}
