export interface ExtractOptions {
  url?: string
  markdown?: boolean
  debug?: boolean
  language?: string
}

export interface ExtractResult {
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
