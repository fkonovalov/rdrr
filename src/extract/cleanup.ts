import { countWords } from "@shared"
import { isDangerousUrl } from "./utils/dom"

const UNSAFE_ELEMENTS_SELECTOR =
  'script:not([type^="math/"]), style, noscript, frame, frameset, object, embed, applet, base, ' +
  "animate, set, animatemotion, animatetransform, animatecolor, discard"

const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "xlink:href"])

export const stripUnsafeElements = (root: Document | Element): void => {
  // For a Document, body content is what gets serialized (innerHTML); for an
  // Element the root's own attributes end up in the output via outerHTML.
  const base = "body" in root ? root.body : root
  if (!base) return

  for (const el of base.querySelectorAll(UNSAFE_ELEMENTS_SELECTOR)) el.remove()

  const elements = "body" in root ? base.querySelectorAll("*") : [base, ...base.querySelectorAll("*")]
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name)
      } else if (name === "srcdoc") {
        el.removeAttribute(attr.name)
      } else if (URL_ATTRIBUTES.has(name)) {
        // An SVG document loaded into an iframe can execute script, so no
        // data: URI is allowed there at all.
        const allowInlineImage = !(name === "src" && el.tagName === "IFRAME")
        if (isDangerousUrl(attr.value, allowInlineImage)) el.removeAttribute(attr.name)
      }
    }
  }
}

export const sanitizeHtmlFragment = (doc: Document, html: string): string => {
  const container = doc.createElement("div")
  container.innerHTML = html
  stripUnsafeElements(container)
  return container.innerHTML
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

const HTML_STRIP_RE = /<[^>]*>|&#\d+;|&(?:amp|lt|gt|quot);|&\w+;/gi
const ENTITY_MAP: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"' }

export const countHtmlWords = (content: string): number => {
  const text = content.replace(HTML_STRIP_RE, (m) => (m.startsWith("<") ? " " : (ENTITY_MAP[m.toLowerCase()] ?? " ")))
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
