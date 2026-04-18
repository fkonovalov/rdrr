import type { FxFacet, FxRawText, FxStatus, NormalizedFacet, NormalizedMedia, NormalizedQuote } from "./types"

/**
 * Slice rawText by display_text_range and re-index facets into the sliced space.
 * Drops `media` facets (those are t.co placeholders Twitter puts in text).
 *
 * FxEmbed facet indices are UTF-16 code-units (matching JS String semantics),
 * so plain String#slice is correct.
 */
export const applyDisplayRange = (rt: FxRawText): { text: string; facets: NormalizedFacet[] } => {
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
