import { mergeSignals } from "@shared"
import type { NormalizedFacet, NormalizedMedia, NormalizedQuote, NormalizedStatus } from "./types"

const BASE = "https://cdn.syndication.twimg.com/tweet-result"
const USER_AGENT = "Mozilla/5.0 (compatible; rdrr/1.0; +https://rdrr.app)"
const REQUEST_TIMEOUT_MS = 10_000

// X's syndication endpoint requires a `token` query parameter but currently
// accepts any non-empty string. Sending a short fixed token is honest about
// that: if Twitter ever tightens validation we'll switch to a real
// widget-derived token, but reverse-engineering their algorithm now would
// just be cargo-culting for no runtime benefit.
const SYNDICATION_TOKEN = "a"

interface SynUser {
  screen_name: string
  name: string
}

interface SynMentionEntity {
  screen_name: string
  indices: [number, number]
}

interface SynUrlEntity {
  url: string
  expanded_url: string
  display_url: string
  indices: [number, number]
}

interface SynMediaEntity {
  type: string
  media_url_https: string
  video_info?: { variants?: Array<{ url: string; content_type?: string; bitrate?: number }> }
  indices: [number, number]
}

interface SynTweet {
  __typename?: string
  id_str: string
  text: string
  lang?: string
  created_at: string
  display_text_range?: [number, number]
  user: SynUser
  in_reply_to_screen_name?: string | null
  entities?: {
    user_mentions?: SynMentionEntity[]
    urls?: SynUrlEntity[]
    media?: SynMediaEntity[]
  }
  mediaDetails?: SynMediaEntity[]
  quoted_tweet?: SynTweet
  tombstone?: { text?: { text?: string } }
}

interface SynFetchOptions {
  signal?: AbortSignal
  timeoutMs?: number
  userAgent?: string
}

export const fetchFromSyndication = async (id: string, opts: SynFetchOptions = {}): Promise<NormalizedStatus> => {
  const url = `${BASE}?id=${encodeURIComponent(id)}&token=${SYNDICATION_TOKEN}&lang=en`
  const res = await fetch(url, {
    headers: { "User-Agent": opts.userAgent ?? USER_AGENT, Accept: "application/json" },
    signal: mergeSignals(opts.timeoutMs ?? REQUEST_TIMEOUT_MS, opts.signal),
  })
  if (!res.ok) throw new Error(`syndication ${res.status} ${res.statusText}`)
  const body = (await res.json()) as SynTweet
  if (body.tombstone?.text?.text) throw new Error(`syndication: ${body.tombstone.text.text}`)
  if (!body.id_str || !body.user) throw new Error("syndication: incomplete response")
  return toNormalized(body)
}

const toNormalized = (tweet: SynTweet): NormalizedStatus => {
  const [rangeStart, rangeEnd] = tweet.display_text_range ?? [0, tweet.text.length]
  const text = tweet.text.slice(rangeStart, rangeEnd)
  const facets = buildFacets(tweet, rangeStart, rangeEnd)

  return {
    id: tweet.id_str,
    permalink: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
    createdAt: new Date(tweet.created_at),
    author: { handle: tweet.user.screen_name, name: tweet.user.name },
    text,
    facets,
    media: extractMedia(tweet),
    replyTo: tweet.in_reply_to_screen_name ? { handle: tweet.in_reply_to_screen_name } : null,
    quote: tweet.quoted_tweet ? toQuote(tweet.quoted_tweet) : null,
    lang: tweet.lang,
  }
}

const toQuote = (q: SynTweet): NormalizedQuote => {
  const [rs, re] = q.display_text_range ?? [0, q.text.length]
  return {
    author: { handle: q.user.screen_name, name: q.user.name },
    text: q.text.slice(rs, re),
    permalink: `https://x.com/${q.user.screen_name}/status/${q.id_str}`,
  }
}

const buildFacets = (tweet: SynTweet, rangeStart: number, rangeEnd: number): NormalizedFacet[] => {
  const facets: NormalizedFacet[] = []
  const reindex = (fs: number, fe: number): [number, number] | null => {
    if (fe <= rangeStart || fs >= rangeEnd) return null
    return [Math.max(0, fs - rangeStart), Math.min(rangeEnd - rangeStart, fe - rangeStart)]
  }

  for (const m of tweet.entities?.user_mentions ?? []) {
    const r = reindex(m.indices[0], m.indices[1])
    if (!r || r[1] <= r[0]) continue
    facets.push({ type: "mention", start: r[0], end: r[1], handle: m.screen_name })
  }
  for (const u of tweet.entities?.urls ?? []) {
    const r = reindex(u.indices[0], u.indices[1])
    if (!r || r[1] <= r[0] || !u.expanded_url) continue
    facets.push({ type: "url", start: r[0], end: r[1], href: u.expanded_url, display: u.display_url || u.expanded_url })
  }
  facets.sort((a, b) => a.start - b.start)
  return facets
}

const extractMedia = (tweet: SynTweet): NormalizedMedia[] => {
  const out: NormalizedMedia[] = []
  const seen = new Set<string>()
  const items = tweet.mediaDetails ?? tweet.entities?.media ?? []
  for (const m of items) {
    if (m.type === "video" || m.type === "animated_gif") {
      const variants = m.video_info?.variants ?? []
      const mp4 = variants
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
      const url = mp4?.url ?? m.media_url_https
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push({ type: m.type === "animated_gif" ? "gif" : "video", url })
    } else {
      const url = m.media_url_https
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push({ type: "photo", url })
    }
  }
  return out
}
