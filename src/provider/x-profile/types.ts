// Minimal subset of the FxEmbed API shape we actually consume.
// Source: https://api.fxtwitter.com/2/profile/<handle>/statuses
// and https://api.fxtwitter.com/<handle>

export interface FxAuthor {
  screen_name: string
  name: string
  id?: string
  followers?: number
  following?: number
  statuses?: number
  media_count?: number
  avatar_url?: string
  banner_url?: string
  description?: string
  raw_description?: FxRawText
  location?: string
  website?: { url?: string } | null
  joined?: string
  protected?: boolean
}

export interface FxFacet {
  type: string
  indices: [number, number]
  original?: string
  display?: string
  replacement?: string
  id?: string
}

export interface FxRawText {
  text: string
  display_text_range?: [number, number]
  facets?: FxFacet[]
}

export interface FxMediaItem {
  type: "photo" | "video" | "gif" | string
  url: string
  thumbnail_url?: string
  width?: number
  height?: number
}

export interface FxStatus {
  id: string
  url: string
  text: string
  raw_text?: FxRawText
  author: FxAuthor
  created_at: string
  created_timestamp: number
  media?: { all?: FxMediaItem[]; photos?: FxMediaItem[]; videos?: FxMediaItem[] }
  replying_to?: { screen_name: string; status: string } | null
  reposted_by?: { screen_name: string; name: string } | null
  quote?: FxStatus
  community_note?: { text?: string } | string | null
  lang?: string
  is_note_tweet?: boolean
}

export interface FxStatusesResponse {
  code: number
  message?: string
  results: FxStatus[]
  cursor?: { top?: string | null; bottom?: string | null } | null
}

export interface FxProfileResponse {
  code: number
  message?: string
  user?: FxAuthor
}

// ---------- Normalized internal shape ----------

export interface NormalizedMedia {
  type: "photo" | "video" | "gif"
  url: string
}

export type NormalizedFacet =
  | { type: "mention"; start: number; end: number; handle: string }
  | { type: "url"; start: number; end: number; href: string; display: string }

export interface NormalizedQuote {
  author: { handle: string; name: string }
  text: string
  permalink: string
}

export interface NormalizedTweet {
  id: string
  createdAt: Date
  permalink: string
  author: { handle: string; name: string }
  text: string
  facets: NormalizedFacet[]
  media: NormalizedMedia[]
  isRetweet: boolean
  /** Present when this post is a retweet — the account that performed the repost. */
  repostedBy?: { handle: string; name: string }
  replyTo?: { handle: string }
  quote?: NormalizedQuote
}

export interface ProfileInfo {
  handle: string
  name: string
  description: string
  followers: number
  statuses: number
  avatarUrl?: string
}
