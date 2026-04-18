import { mergeSignals } from "@shared"
import { applyDisplayRange, extractMedia, normalizeQuote } from "../_twitter/normalize"
import type { FxStatus } from "../_twitter/types"
import type { NormalizedStatus } from "./types"

const BASE = "https://api.fxtwitter.com"
const USER_AGENT = "Mozilla/5.0 (compatible; rdrr/1.0; +https://rdrr.app)"
const REQUEST_TIMEOUT_MS = 10_000

interface FxResponse {
  code: number
  message?: string
  tweet?: FxStatus
}

interface FxFetchOptions {
  signal?: AbortSignal
  timeoutMs?: number
  userAgent?: string
}

export const fetchFromFxtwitter = async (
  handleOrI: string | null,
  id: string,
  opts: FxFetchOptions = {},
): Promise<NormalizedStatus> => {
  const base = handleOrI ? `${BASE}/${encodeURIComponent(handleOrI)}/status/${id}` : `${BASE}/status/${id}`
  const res = await fetch(base, {
    headers: { "User-Agent": opts.userAgent ?? USER_AGENT },
    signal: mergeSignals(opts.timeoutMs ?? REQUEST_TIMEOUT_MS, opts.signal),
  })
  if (!res.ok) throw new Error(`fxtwitter ${res.status} ${res.statusText}`)
  const body = (await res.json()) as FxResponse
  if (body.code !== 200 || !body.tweet) throw new Error(`fxtwitter: ${body.message ?? "no tweet"}`)
  return toNormalized(body.tweet)
}

const toNormalized = (tweet: FxStatus): NormalizedStatus => {
  const { text, facets } = applyDisplayRange(tweet.raw_text ?? { text: tweet.text })
  const createdAt = tweet.created_timestamp
    ? new Date(tweet.created_timestamp * 1000)
    : tweet.created_at
      ? new Date(tweet.created_at)
      : new Date(0)
  return {
    id: tweet.id,
    permalink: tweet.url,
    createdAt,
    author: { handle: tweet.author.screen_name, name: tweet.author.name },
    text,
    facets,
    media: extractMedia(tweet),
    replyTo: tweet.replying_to ? { handle: tweet.replying_to.screen_name } : null,
    quote: tweet.quote ? normalizeQuote(tweet.quote) : null,
    lang: tweet.lang,
  }
}
