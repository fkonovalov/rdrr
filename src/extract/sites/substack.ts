import type { SiteExtractor, SiteExtractorResult } from "./types"
import { parseHTML } from "../utils/dom"
import { registerSite } from "./registry"

const INJECTED_ATTR = "data-rdrr-substack-post"

interface SubstackPostData {
  title?: string
  subtitle?: string
  body_html?: string
  post_date?: string
  canonical_url?: string
  publishedBylines?: Array<{ name?: string; handle?: string }>
}

registerSite({
  patterns: [
    /\.substack\.com/,
    /^https?:\/\/substack\.com\/@[^/]+\/note\/.+/,
    /^https?:\/\/substack\.com\/home\/post\/p-\d+/,
  ],
  create: (doc) => {
    const hasRenderedBody = !!doc.querySelector("div.body.markup")
    const postData = extractPreloadData(doc)
    const noteText = doc.querySelector("div.ProseMirror.FeedProseMirror")

    let postContentSelector: string | null = null

    if (hasRenderedBody) {
      postContentSelector = "div.body.markup"
    } else if (postData?.body_html) {
      const existing = doc.querySelector(`[${INJECTED_ATTR}]`)
      if (!existing) {
        const wrapper = doc.createElement("div")
        wrapper.setAttribute(INJECTED_ATTR, "")
        wrapper.appendChild(parseHTML(doc, postData.body_html))
        doc.body?.appendChild(wrapper)
      }
      postContentSelector = `[${INJECTED_ATTR}]`
    }

    return {
      canExtract: () => postContentSelector !== null || noteText !== null,
      extract: (): SiteExtractorResult => {
        if (postContentSelector) return extractPost(doc, postData, postContentSelector)
        return extractNote(doc, noteText!)
      },
    } satisfies SiteExtractor
  },
})

const extractPost = (doc: Document, postData: SubstackPostData | null, selector: string): SiteExtractorResult => {
  const title = postData?.title ?? doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? ""
  const description =
    postData?.subtitle ?? doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? ""
  const author =
    postData?.publishedBylines?.[0]?.name ?? doc.querySelector('a[href*="substack.com/@"]')?.textContent?.trim() ?? ""
  const published = postData?.post_date ?? parseDateFromByline(doc) ?? ""

  return {
    content: "",
    contentHtml: "",
    contentSelector: selector,
    variables: { title, author, site: "Substack", description, published },
  }
}

const extractNote = (doc: Document, noteText: Element): SiteExtractorResult => {
  const textHtml = noteText.outerHTML
  const imageHtml = buildNoteImageHtml(doc, noteText)
  const content = imageHtml ? `${textHtml}\n${imageHtml}` : textHtml
  const title = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? ""
  const description = doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? ""
  const author = title.replace(/\s*\(@[^)]+\)\s*$/, "").trim()

  return {
    content,
    contentHtml: content,
    variables: { title, author, site: "Substack", description },
  }
}

const ABBREV_MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
}

const parseDateFromByline = (doc: Document): string => {
  const byline = doc.querySelector('[class*="byline-wrapper"]')
  if (!byline) return ""
  const text = (byline.textContent ?? "").trim().replace(/([a-z])([A-Z])/g, "$1 $2")
  const match = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/)
  if (match) {
    const month = ABBREV_MONTHS[match[1]!]
    const day = match[2]!.padStart(2, "0")
    return `${match[3]}-${month}-${day}T00:00:00+00:00`
  }
  return ""
}

const extractPreloadData = (doc: Document): SubstackPostData | null => {
  for (const script of doc.querySelectorAll("script")) {
    const text = script.textContent ?? ""
    if (!text.includes("window._preloads") || !text.includes("body_html")) continue

    const jsonParseIdx = text.indexOf('JSON.parse("')
    if (jsonParseIdx === -1) continue

    const startIdx = jsonParseIdx + 'JSON.parse("'.length
    let i = startIdx
    while (i < text.length) {
      if (text[i] === "\\") {
        i += 2
      } else if (text[i] === '"') {
        break
      } else {
        i++
      }
    }

    try {
      const innerStr = text.slice(startIdx, i)
      const jsonString = JSON.parse('"' + innerStr + '"') as string
      const data = JSON.parse(jsonString) as Record<string, unknown>
      const feed = data?.feedData as Record<string, unknown> | undefined
      const initial = feed?.initialPost as Record<string, unknown> | undefined
      const post = initial?.post as SubstackPostData | undefined
      if (post?.body_html) return post
    } catch {}
  }
  return null
}

const buildNoteImageHtml = (doc: Document, noteText: Element): string => {
  const feedCommentBody = noteText.closest('[class*="feedCommentBody"]:not([class*="feedCommentBodyInner"])')
  const sibling = feedCommentBody?.parentElement?.nextElementSibling
  const siblingClass = sibling?.getAttribute("class") ?? ""
  if (!sibling || !siblingClass.includes("imageGrid")) return ""

  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content")
  if (ogImage) return `<img src="${ogImage}" alt="" />`

  const img = sibling.querySelector("img")
  if (!img) return ""
  const src = getLargestSrc(img)
  return src ? `<img src="${src}" alt="" />` : ""
}

const getLargestSrc = (img: Element): string => {
  const srcset = img.getAttribute("srcset") ?? ""
  if (srcset) {
    const entryPattern = /(.+?)\s+(\d+(?:\.\d+)?)w/g
    let bestUrl = ""
    let bestWidth = 0
    let match: RegExpExecArray | null
    let lastIndex = 0
    while ((match = entryPattern.exec(srcset)) !== null) {
      let url = match[1]!.trim()
      if (lastIndex > 0) url = url.replace(/^,\s*/, "")
      lastIndex = entryPattern.lastIndex
      const width = parseFloat(match[2]!)
      if (url && width > bestWidth) {
        bestWidth = width
        bestUrl = url
      }
    }
    if (bestUrl) return bestUrl.replace(/,w_\d+/g, "").replace(/,c_\w+/g, "")
  }
  return img.getAttribute("src") ?? ""
}
