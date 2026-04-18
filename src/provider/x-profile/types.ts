import type { FxAuthor, FxStatus, NormalizedFacet, NormalizedMedia, NormalizedQuote } from "../_twitter/types"

export type { FxAuthor, FxStatus, NormalizedFacet, NormalizedMedia, NormalizedQuote }

// Profile-API responses (not the single-status ones).
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
