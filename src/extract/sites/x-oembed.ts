import type { SiteExtractor, SiteExtractorResult } from "./types"
import { escapeHtml } from "../utils/dom"
import { registerSite } from "./registry"

interface FxMediaItem {
  type: string
  url: string
}
interface FxFacet {
  type: string
  indices: [number, number]
  text?: string
  original?: string
}
interface DraftBlock {
  key: string
  text: string
  type: string
  inlineStyleRanges: Array<{ offset: number; length: number; style: string }>
  entityRanges: Array<{ key: number; offset: number; length: number }>
  data: {
    mentions?: Array<{ fromIndex: number; toIndex: number; text: string }>
    urls?: Array<{ fromIndex: number; toIndex: number; text: string }>
  }
}
interface DraftEntity {
  key: string
  value: {
    type: string
    mutability: string
    data: { url?: string; caption?: string; markdown?: string; mediaItems?: Array<{ mediaId: string }> }
  }
}
interface FxArticleMedia {
  media_id: string
  media_info: { __typename: string; original_img_url?: string }
}
interface Marker {
  offset: number
  type: "open" | "close"
  tag: string
}

interface FxResponse {
  tweet: {
    text: string
    raw_text?: { text: string; facets: FxFacet[] }
    author: { name: string; screen_name: string }
    created_at?: string
    media?: { all?: FxMediaItem[]; photos?: FxMediaItem[] }
    article?: {
      title: string
      preview_text: string
      created_at?: string
      cover_media?: { media_info?: { original_img_url?: string } }
      content: { blocks: DraftBlock[]; entityMap: DraftEntity[] }
      media_entities?: FxArticleMedia[]
    }
  }
}

// Used by `parseHtml`/extension callers that already have the rendered DOM
// and want a site-extractor pass; the CLI `parse` path routes X status URLs
// straight to `provider/x-status` (fxtwitter primary, syndication fallback)
// and skips this branch entirely.
registerSite({
  patterns: ["x.com"],
  create: (_doc, url) =>
    ({
      canExtract: () => false,
      extract: () => ({ content: "", contentHtml: "" }),
      canExtractAsync: () => /\/(status|article)\/\d+/.test(url),
      extractAsync: () => extractXPost(url),
    }) satisfies SiteExtractor,
})

const extractXPost = async (url: string): Promise<SiteExtractorResult> => {
  const match = url.match(/\/([a-zA-Z0-9_]{1,15})\/(status|article)\/(\d+)/)
  if (!match?.[1] || !match?.[3]) throw new Error(`Invalid X post URL: ${url}`)

  const data = await fetchFx(match[1], match[3])

  if (data.tweet?.article) return buildArticleResult(data)
  if (data.tweet?.text) return buildTweetResult(data)

  throw new Error("Could not fetch post content")
}

const fetchFx = async (username: string, id: string): Promise<FxResponse> => {
  const res = await fetch(`https://api.fxtwitter.com/${username}/status/${id}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; rdrr/1.0; +https://rdrr.app)" },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`FxTwitter API error: ${res.status}`)
  return res.json() as Promise<FxResponse>
}

const buildArticleResult = (data: FxResponse): SiteExtractorResult => {
  const article = data.tweet.article!
  const { blocks, entityMap } = article.content
  const mediaEntities = article.media_entities ?? []
  const contentHtml = renderArticle(blocks, entityMap, article.cover_media, mediaEntities)
  const handle = `@${data.tweet.author.screen_name}`
  return {
    content: contentHtml,
    contentHtml,
    variables: {
      title: article.title,
      author: handle,
      site: "X (Twitter)",
      description: article.preview_text,
      ...((toDateString(article.created_at) ?? toDateString(data.tweet.created_at))
        ? { published: (toDateString(article.created_at) ?? toDateString(data.tweet.created_at))! }
        : {}),
    },
  }
}

const toDateString = (dateStr?: string): string | undefined => {
  if (!dateStr) return undefined
  try {
    return new Date(dateStr).toISOString().split("T")[0]
  } catch {
    return undefined
  }
}

const buildTweetResult = (data: FxResponse): SiteExtractorResult => {
  const tweet = data.tweet
  const handle = `@${tweet.author.screen_name}`
  const contentHtml = renderTweet(tweet)
  const published = toDateString(tweet.created_at)
  return {
    content: contentHtml,
    contentHtml,
    variables: {
      title: `Post by ${handle}`,
      author: handle,
      site: "X (Twitter)",
      ...(published && { published }),
    },
  }
}

// --- Tweet rendering with facets ---

const renderTweet = (tweet: FxResponse["tweet"]): string => {
  const text = tweet.raw_text?.text ?? tweet.text
  const facets = (tweet.raw_text?.facets ?? []).filter((f) => f.type !== "media")

  const paragraphs = text.split(/\n\n+/)
  let offset = 0
  const htmlParts: string[] = []

  for (const para of paragraphs) {
    const paraStart = text.indexOf(para, offset)
    const paraEnd = paraStart + para.length
    offset = paraEnd

    const isBlockquote = para.trimStart().startsWith(">")
    const paraText = isBlockquote ? para.trimStart().slice(1).trimStart() : para
    const paraTextStart = isBlockquote
      ? paraStart +
        (para.length - para.trimStart().length) +
        1 +
        (para.trimStart().slice(1).length - para.trimStart().slice(1).trimStart().length)
      : paraStart

    const rendered = applyFacets(paraText, paraTextStart, paraEnd, facets)
    const withBreaks = rendered.replace(/\n/g, "<br>")

    if (isBlockquote) htmlParts.push(`<blockquote><p>${withBreaks}</p></blockquote>`)
    else if (withBreaks.trim()) htmlParts.push(`<p>${withBreaks}</p>`)
  }

  const photos = tweet.media?.photos ?? tweet.media?.all?.filter((m) => m.type === "photo") ?? []
  for (const photo of photos) {
    htmlParts.push(`<img src="${escapeHtml(photo.url)}" alt="">`)
  }

  const handle = escapeHtml(`@${tweet.author.screen_name}`)
  const authorName = escapeHtml(tweet.author.name)

  return (
    `<div class="tweet-thread"><div class="main-tweet"><div class="tweet">` +
    `<div class="tweet-header"><span class="tweet-author"><strong>${authorName}</strong> <span class="tweet-handle">${handle}</span></span></div>` +
    `<div class="tweet-text">${htmlParts.join("\n")}</div>` +
    `</div></div></div>`
  )
}

const applyMarkers = (text: string, markers: Marker[]): string => {
  if (markers.length === 0) return escapeHtml(text)
  markers.sort((a, b) => (a.offset !== b.offset ? a.offset - b.offset : a.type === "close" ? -1 : 1))

  let result = ""
  let pos = 0
  for (const m of markers) {
    if (m.offset > pos) result += escapeHtml(text.slice(pos, m.offset))
    result += m.tag
    pos = m.offset
  }
  if (pos < text.length) result += escapeHtml(text.slice(pos))
  return result
}

const applyFacets = (text: string, textStart: number, textEnd: number, facets: FxFacet[]): string => {
  const markers: Marker[] = []
  for (const facet of facets) {
    const [fStart, fEnd] = facet.indices
    if (fEnd <= textStart || fStart >= textEnd) continue
    const relStart = Math.max(0, fStart - textStart)
    const relEnd = Math.min(text.length, fEnd - textStart)

    if (facet.type === "italic") {
      markers.push({ offset: relStart, type: "open", tag: "<em>" })
      markers.push({ offset: relEnd, type: "close", tag: "</em>" })
    } else if (facet.type === "mention" && facet.text) {
      markers.push({ offset: relStart, type: "open", tag: `<a href="https://x.com/${escapeHtml(facet.text)}">` })
      markers.push({ offset: relEnd, type: "close", tag: "</a>" })
    } else if (facet.type === "url" && facet.original) {
      markers.push({ offset: relStart, type: "open", tag: `<a href="${escapeHtml(facet.original)}">` })
      markers.push({ offset: relEnd, type: "close", tag: "</a>" })
    }
  }
  return applyMarkers(text, markers)
}

// --- Draft.js article rendering ---

const renderArticle = (
  blocks: DraftBlock[],
  entityMap: DraftEntity[],
  coverMedia?: { media_info?: { original_img_url?: string } },
  mediaEntities?: FxArticleMedia[],
): string => {
  const parts: string[] = []

  if (coverMedia?.media_info?.original_img_url) {
    parts.push(`<img src="${escapeHtml(coverMedia.media_info.original_img_url)}" alt="Cover image">`)
  }

  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]!
    if (block.type === "unordered-list-item") {
      const items: string[] = []
      while (i < blocks.length && blocks[i]!.type === "unordered-list-item") {
        items.push(`<li>${renderInline(blocks[i]!, entityMap)}</li>`)
        i++
      }
      parts.push(`<ul>${items.join("")}</ul>`)
      continue
    }
    const html = renderBlock(block, entityMap, mediaEntities)
    if (html) parts.push(html)
    i++
  }

  return `<article class="x-article">${parts.join("")}</article>`
}

const renderBlock = (block: DraftBlock, entityMap: DraftEntity[], mediaEntities?: FxArticleMedia[]): string => {
  switch (block.type) {
    case "unstyled":
      return block.text.trim() ? `<p>${renderInline(block, entityMap)}</p>` : ""
    case "header-two":
      return `<h2>${renderInline(block, entityMap)}</h2>`
    case "header-three":
      return `<h3>${renderInline(block, entityMap)}</h3>`
    case "atomic":
      return renderAtomicBlock(block, entityMap, mediaEntities)
    default:
      return block.text.trim() ? `<p>${renderInline(block, entityMap)}</p>` : ""
  }
}

const renderAtomicBlock = (block: DraftBlock, entityMap: DraftEntity[], mediaEntities?: FxArticleMedia[]): string => {
  if (block.entityRanges.length === 0) return ""
  const entry = entityMap.find((e) => e.key === String(block.entityRanges[0]!.key))
  if (!entry) return ""

  const entity = entry.value
  if (entity.type === "MEDIA") {
    const mediaItems = entity.data.mediaItems ?? []
    const caption = entity.data.caption
    const images: string[] = []

    for (const item of mediaItems) {
      const me = mediaEntities?.find((e) => String(e.media_id) === String(item.mediaId))
      if (me?.media_info?.original_img_url) {
        images.push(
          `<img src="${escapeHtml(me.media_info.original_img_url)}" alt="${caption ? escapeHtml(caption) : ""}">`,
        )
      }
    }

    if (images.length > 0) {
      return caption
        ? `<figure>${images.join("")}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
        : images.join("")
    }
    return caption ? `<figure><figcaption>${escapeHtml(caption)}</figcaption></figure>` : ""
  }
  if (entity.type === "MARKDOWN") {
    const md = entity.data.markdown ?? ""
    const codeMatch = md.match(/^```(\w*)\n([\s\S]*?)\n?```$/)
    if (codeMatch) {
      const lang = codeMatch[1]
      const code = codeMatch[2]!
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}" data-lang="${escapeHtml(lang)}"` : ""
      return `<pre><code${langAttr}>${escapeHtml(code)}</code></pre>`
    }
    return `<pre><code>${escapeHtml(md)}</code></pre>`
  }
  return ""
}

const renderInline = (block: DraftBlock, entityMap: DraftEntity[]): string => {
  const text = block.text
  if (!text) return ""

  const markers: Marker[] = []

  for (const range of block.inlineStyleRanges) {
    if (range.style === "Bold") {
      markers.push({ offset: range.offset, type: "open", tag: "<strong>" })
      markers.push({ offset: range.offset + range.length, type: "close", tag: "</strong>" })
    }
  }

  for (const range of block.entityRanges) {
    const entry = entityMap.find((e) => e.key === String(range.key))
    if (entry?.value.type === "LINK" && entry.value.data.url) {
      markers.push({ offset: range.offset, type: "open", tag: `<a href="${escapeHtml(entry.value.data.url)}">` })
      markers.push({ offset: range.offset + range.length, type: "close", tag: "</a>" })
    }
  }

  if (block.data?.mentions) {
    for (const m of block.data.mentions) {
      markers.push({ offset: m.fromIndex, type: "open", tag: `<a href="https://x.com/${escapeHtml(m.text)}">` })
      markers.push({ offset: m.toIndex, type: "close", tag: "</a>" })
    }
  }

  if (block.data?.urls) {
    for (const u of block.data.urls) {
      markers.push({ offset: u.fromIndex, type: "open", tag: `<a href="${escapeHtml(u.text)}">` })
      markers.push({ offset: u.toIndex, type: "close", tag: "</a>" })
    }
  }

  return applyMarkers(text, markers)
}
