import type { NormalizedFacet, NormalizedMedia, NormalizedQuote } from "../_twitter/types"

export type { NormalizedFacet, NormalizedMedia, NormalizedQuote }

/**
 * Shape we normalise upstream single-tweet responses into.
 *
 * Both the fxtwitter API and the public twimg syndication endpoint can produce
 * this; providers should populate what they know and leave the rest.
 */
export interface NormalizedStatus {
  id: string
  permalink: string
  createdAt: Date
  author: { handle: string; name: string }
  text: string
  /** Inline mention/url facets, sorted by start offset. */
  facets: NormalizedFacet[]
  media: NormalizedMedia[]
  replyTo?: { handle: string } | null
  quote?: NormalizedQuote | null
  lang?: string
}

export interface FetchOutcome {
  status: NormalizedStatus
  /** Strategy name — surfaces in the result for debugging/agents. */
  source: string
}
