import { countWords } from "@shared"
import { isDangerousUrl } from "./utils/dom"

export const stripUnsafeElements = (doc: Document): void => {
  const body = doc.body
  if (!body) return

  for (const el of body.querySelectorAll(
    'script:not([type^="math/"]), style, noscript, frame, frameset, object, embed, applet, base',
  )) {
    el.remove()
  }

  for (const el of body.querySelectorAll("*")) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name)
      } else if (name === "srcdoc") {
        el.removeAttribute(attr.name)
      } else if (["href", "src", "action", "formaction", "xlink:href"].includes(name)) {
        if (isDangerousUrl(attr.value)) el.removeAttribute(attr.name)
      }
    }
  }
}

export const resolveRelativeUrls = (element: Element, docUrl: string, doc: Document): void => {
  if (!docUrl) return

  let baseUrl = docUrl
  const baseEl = doc.querySelector("base[href]")
  if (baseEl) {
    const baseHref = baseEl.getAttribute("href")
    if (baseHref) {
      try {
        baseUrl = new URL(baseHref, docUrl).href
      } catch {}
    }
  }

  const resolve = (url: string): string => {
    const normalized = url
      .trim()
      .replace(/^\\?["']+/, "")
      .replace(/\\?["']+$/, "")
    if (normalized.startsWith("#")) return normalized
    try {
      return new URL(normalized, baseUrl).href
    } catch {
      return normalized || url
    }
  }

  for (const el of element.querySelectorAll("[href]")) {
    const href = el.getAttribute("href")
    if (href) el.setAttribute("href", resolve(href))
  }

  for (const el of element.querySelectorAll("[src]")) {
    const src = el.getAttribute("src")
    if (src) el.setAttribute("src", resolve(src))
  }

  for (const el of element.querySelectorAll("[srcset]")) {
    const srcset = el.getAttribute("srcset")
    if (srcset) el.setAttribute("srcset", resolveSrcset(srcset, resolve))
  }

  for (const el of element.querySelectorAll("[poster]")) {
    const poster = el.getAttribute("poster")
    if (poster) el.setAttribute("poster", resolve(poster))
  }
}

export const countHtmlWords = (content: string): number => {
  const text = content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/&\w+;/g, " ")
  return countWords(text)
}

const resolveSrcset = (srcset: string, resolve: (url: string) => string): string => {
  const entryPattern = /(.+?)\s+(\d+(?:\.\d+)?[wx])/g
  const entries: string[] = []
  let match: RegExpExecArray | null
  let lastIdx = 0

  while ((match = entryPattern.exec(srcset)) !== null) {
    let url = match[1]!.trim()
    if (lastIdx > 0) url = url.replace(/^,\s*/, "")
    lastIdx = entryPattern.lastIndex
    entries.push(`${resolve(url)} ${match[2]}`)
  }

  if (entries.length > 0) return entries.join(", ")

  return srcset
    .split(",")
    .map((entry) => {
      const parts = entry.trim().split(/\s+/)
      if (parts[0]) parts[0] = resolve(parts[0])
      return parts.join(" ")
    })
    .join(", ")
}
