import type { FxFacet, FxRawText, FxStatus, NormalizedFacet, NormalizedMedia, NormalizedQuote } from "./types"

/**
 * Twitter-side indices (facets, display_text_range, entity indices) count
 * Unicode code points, while JS string ops count UTF-16 units — an emoji is 1
 * there and 2 here, shifting every index after it. Returns a mapper from
 * code-point position to UTF-16 offset (identity when no surrogates).
 */
export const codePointConverter = (text: string): ((index: number) => number) => {
  const offsets = [0]
  let acc = 0
  for (const ch of text) {
    acc += ch.length
    offsets.push(acc)
  }
  if (offsets.length - 1 === text.length) return (index) => index
  return (index) => offsets[Math.min(Math.max(index, 0), offsets.length - 1)] ?? acc
}

/**
 * Slice rawText by display_text_range and re-index facets into the sliced space.
 * Drops `media` facets (those are t.co placeholders Twitter puts in text).
 */
export const applyDisplayRange = (rt: FxRawText): { text: string; facets: NormalizedFacet[] } => {
  const fullText = rt.text
  const toUtf16 = codePointConverter(fullText)
  const range = rt.display_text_range
  const rangeStart = range ? toUtf16(range[0]) : 0
  const rangeEnd = range ? toUtf16(range[1]) : fullText.length
  const text = fullText.slice(rangeStart, rangeEnd)

  const facets: NormalizedFacet[] = []
  for (const facet of rt.facets ?? []) {
    const normalized = normalizeFacet(facet, rangeStart, rangeEnd, toUtf16)
    if (normalized) facets.push(normalized)
  }
  facets.sort((a, b) => a.start - b.start)
  return { text, facets }
}

const normalizeFacet = (
  facet: FxFacet,
  rangeStart: number,
  rangeEnd: number,
  toUtf16: (index: number) => number,
): NormalizedFacet | null => {
  const fStart = toUtf16(facet.indices[0])
  const fEnd = toUtf16(facet.indices[1])
  if (fEnd <= rangeStart || fStart >= rangeEnd) return null
  if (facet.type === "media") return null

  const start = Math.max(0, fStart - rangeStart)
  const end = Math.min(rangeEnd - rangeStart, fEnd - rangeStart)
  if (end <= start) return null

  if (facet.type === "mention") {
    const handle = facet.original ?? facet.text
    if (!handle) return null
    return { type: "mention", start, end, handle }
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

export const extractMedia = (status: FxStatus): NormalizedMedia[] => {
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

export const normalizeQuote = (quote: FxStatus): NormalizedQuote => {
  const rt = quote.raw_text
  const { text } = applyDisplayRange(rt ?? { text: quote.text })
  return {
    author: { handle: quote.author.screen_name, name: quote.author.name },
    text,
    permalink: quote.url,
  }
}
