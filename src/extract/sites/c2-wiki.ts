import type { SiteExtractor, SiteExtractorResult } from "./types"
import { escapeHtml, isDangerousUrl } from "../utils/dom"
import { registerSite } from "./registry"

const C2_API = "https://c2.com/wiki/remodel/pages/"

registerSite({
  patterns: ["wiki.c2.com"],
  create: (_doc, url) => {
    let pageTitle: string | null = null
    try {
      const search = new URL(url).search
      const match = search.match(/[?&]([A-Za-z]\w*)/)
      pageTitle = match ? match[1]! : "WelcomeVisitors"
    } catch {}

    return {
      canExtract: () => false,
      extract: () => ({ content: "", contentHtml: "" }),
      canExtractAsync: () => pageTitle !== null,
      extractAsync: async (): Promise<SiteExtractorResult> => {
        if (!pageTitle) return { content: "", contentHtml: "" }

        const json = (await fetch(C2_API + pageTitle).then((res) => res.json())) as Record<string, unknown>
        if (!json?.text) return { content: "", contentHtml: "" }

        const words = pageTitle.replace(/([a-z])([A-Z])/g, "$1 $2")
        const body = markup(String(json.text))
        const footer = json.date ? `<hr><p>Last edit ${escapeHtml(String(json.date))}</p>` : ""
        const contentHtml = `${body}${footer}`

        return {
          content: contentHtml,
          contentHtml,
          variables: {
            title: words,
            site: "C2 Wiki",
            ...(json.date ? { published: String(json.date) } : {}),
          },
        }
      },
    } satisfies SiteExtractor
  },
})

const markup = (text: string): string => {
  const lines = text.replace(/\\\n/g, " ").split(/\r?\n/)
  const parts: string[] = []
  let openTags: string[] = []

  for (const line of lines) {
    const { html, tags } = applyBullets(line, openTags)
    parts.push(applyInline(html))
    openTags = tags
  }

  while (openTags.length > 0) parts.push(`</${openTags.pop()}>`)
  return parts.join("\n")
}

const applyBullets = (text: string, openTags: string[]): { html: string; tags: string[] } => {
  const tags = [...openTags]
  let prefix = ""

  const closeToDepth = (depth: number, tag?: string) => {
    while (tags.length > depth) prefix += `</${tags.pop()}>`
    if (tag && tags.length < depth) {
      prefix += `<${tag}>`
      tags.push(tag)
    } else if (tag && tags.length === depth && tags[depth - 1] !== tag) {
      prefix += `</${tags.pop()}><${tag}>`
      tags.push(tag)
    }
  }

  if (/^\s*$/.test(text)) {
    const inList = tags.some((t) => t === "ul" || t === "ol" || t === "dl")
    if (inList) return { html: "", tags }
    closeToDepth(0)
    return { html: prefix + "<p></p>", tags }
  }

  if (/^-----*/.test(text)) {
    closeToDepth(0)
    return { html: prefix + "<hr>", tags }
  }

  const dlMatch = text.match(/^(\t+)(.+):\t/)
  if (dlMatch) {
    closeToDepth(dlMatch[1]!.length, "dl")
    return { html: prefix + `<dt>${dlMatch[2]}<dd>` + text.slice(dlMatch[0].length), tags }
  }

  const tabUlMatch = text.match(/^(\t+)\*/)
  if (tabUlMatch) {
    closeToDepth(tabUlMatch[1]!.length, "ul")
    return { html: prefix + "<li>" + text.slice(tabUlMatch[0].length), tags }
  }

  const starUlMatch = text.match(/^(\*+)/)
  if (starUlMatch) {
    closeToDepth(starUlMatch[1]!.length, "ul")
    return { html: prefix + "<li>" + text.slice(starUlMatch[0].length), tags }
  }

  const olMatch = text.match(/^(\t+)\d+\.?/)
  if (olMatch) {
    closeToDepth(olMatch[1]!.length, "ol")
    return { html: prefix + "<li>" + text.slice(olMatch[0].length), tags }
  }

  if (/^\s/.test(text)) {
    closeToDepth(1, "pre")
    return { html: prefix + text, tags }
  }

  closeToDepth(0)
  return { html: prefix + text, tags }
}

const escapeAttr = (text: string): string => text.replace(/"/g, "&quot;").replace(/'/g, "&#39;")

const applyInline = (text: string): string =>
  text
    .replace(/'''(.*?)'''/g, "<strong>$1</strong>")
    .replace(/''(.*?)''/g, "<em>$1</em>")
    .replace(/\b(https?|ftp|mailto|file|telnet|news):[^\s<>[\]"'()]*[^\s<>[\]"'(),.?]/g, (url) => {
      if (isDangerousUrl(url)) return escapeHtml(url)
      if (/\.(gif|jpg|jpeg|png)$/i.test(url)) return `<img src="${escapeAttr(url)}">`
      return `<a href="${escapeAttr(url)}" rel="nofollow" target="_blank">${escapeHtml(url)}</a>`
    })
