/**
 * Shared Twitter/X shape primitives used by both `provider/x-profile` and
 * `provider/x-status`. Anything that overlaps between the FxEmbed profile
 * timeline API and the single-status API lives here; provider-specific
 * extensions (retweet metadata, language tag, etc.) stay in each provider.
 *
 * Source of truth: https://github.com/FixTweet/FxTwitter/blob/main/README.md
 * and the public twimg syndication endpoint.
 */

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
  text?: string
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

// ---------- Normalised cross-provider primitives ----------

export type NormalizedFacet =
  | { type: "mention"; start: number; end: number; handle: string }
  | { type: "url"; start: number; end: number; href: string; display: string }

export interface NormalizedMedia {
  type: "photo" | "video" | "gif"
  url: string
}

export interface NormalizedQuote {
  author: { handle: string; name: string }
  text: string
  permalink: string
}
