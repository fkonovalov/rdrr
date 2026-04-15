export interface SiteExtractorResult {
  content: string
  contentHtml: string
  contentSelector?: string
  variables?: Record<string, string>
}

export interface SiteExtractor {
  canExtract: () => boolean
  extract: () => SiteExtractorResult
  canExtractAsync?: () => boolean
  extractAsync?: () => Promise<SiteExtractorResult>
}

export interface SiteExtractorFactory {
  patterns: Array<string | RegExp>
  create: (doc: Document, url: string, schemaOrg?: unknown[]) => SiteExtractor
}

export interface ConversationMessage {
  author: string
  content: string
  timestamp?: string
  role?: string
}
