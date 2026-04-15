import type {
  FxAuthor,
  FxFacet,
  FxRawText,
  FxStatus,
  NormalizedFacet,
  NormalizedMedia,
  NormalizedQuote,
  NormalizedTweet,
  ProfileInfo,
} from "./types"

export const normalizeProfile = (user: FxAuthor): ProfileInfo => ({
  handle: user.screen_name,
  name: user.name,
  // `user.description` already has t.co URLs expanded to their final destinations;
  // `raw_description.text` keeps the t.co form, which is useless for humans.
  description: user.description ?? "",
  followers: user.followers ?? 0,
  statuses: user.statuses ?? 0,
  avatarUrl: user.avatar_url,
})

export const normalizeStatus = (status: FxStatus): NormalizedTweet => {
  const rt = status.raw_text
  const { text, facets } = extractDisplayText(rt ?? { text: status.text })
  const isRetweet = Boolean(status.reposted_by)

  const normalized: NormalizedTweet = {
    id: status.id,
    createdAt: new Date(status.created_timestamp * 1000),
    permalink: status.url,
    author: { handle: status.author.screen_name, name: status.author.name },
    text,
    facets,
    media: extractMedia(status),
    isRetweet,
  }

  if (isRetweet && status.reposted_by) {
    normalized.repostedBy = {
      handle: status.reposted_by.screen_name,
      name: status.reposted_by.name,
    }
  }

  if (status.replying_to) normalized.replyTo = { handle: status.replying_to.screen_name }

  if (status.quote) normalized.quote = normalizeQuote(status.quote)

  return normalized
}

/**
 * Slice rawText by display_text_range and re-index facets into the sliced space.
 * Drops `media` facets (those are t.co placeholders Twitter puts in text).
 *
 * FxEmbed facet indices are UTF-16 code-units (matching JS String semantics),
 * so plain String#slice is correct — this is consistent with how the existing
 * single-tweet extractor (`x-oembed.ts`) treats them.
 */
const extractDisplayText = (rt: FxRawText): { text: string; facets: NormalizedFacet[] } => {
  const fullText = rt.text
  const [rangeStart, rangeEnd] = rt.display_text_range ?? [0, fullText.length]
  const text = fullText.slice(rangeStart, rangeEnd)

  const facets: NormalizedFacet[] = []
  for (const facet of rt.facets ?? []) {
    const normalized = normalizeFacet(facet, rangeStart, rangeEnd)
    if (normalized) facets.push(normalized)
  }
  facets.sort((a, b) => a.start - b.start)
  return { text, facets }
}

const normalizeFacet = (facet: FxFacet, rangeStart: number, rangeEnd: number): NormalizedFacet | null => {
  const [fStart, fEnd] = facet.indices
  if (fEnd <= rangeStart || fStart >= rangeEnd) return null
  if (facet.type === "media") return null

  const start = Math.max(0, fStart - rangeStart)
  const end = Math.min(rangeEnd - rangeStart, fEnd - rangeStart)
  if (end <= start) return null

  if (facet.type === "mention" && facet.original) {
    return { type: "mention", start, end, handle: facet.original }
  }
  if (facet.type === "url") {
    // FxEmbed exposes `replacement` as the real destination and `display` as the label.
    const href = facet.replacement ?? facet.original
    const display = facet.display ?? href ?? ""
    if (!href) return null
    return { type: "url", start, end, href, display }
  }
  return null
}

const extractMedia = (status: FxStatus): NormalizedMedia[] => {
  const all = status.media?.all ?? []
  const out: NormalizedMedia[] = []
  const seen = new Set<string>()
  for (const m of all) {
    if (!m.url || seen.has(m.url)) continue
    seen.add(m.url)
    const type = m.type === "video" || m.type === "gif" || m.type === "photo" ? m.type : "photo"
    out.push({ type, url: m.url })
  }
  return out
}

const normalizeQuote = (quote: FxStatus): NormalizedQuote => {
  const rt = quote.raw_text
  const { text } = extractDisplayText(rt ?? { text: quote.text })
  return {
    author: { handle: quote.author.screen_name, name: quote.author.name },
    text,
    permalink: quote.url,
  }
}
