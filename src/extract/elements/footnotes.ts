import type { FootnoteData, FootnoteMap } from "./footnotes-collect"
import { FOOTNOTE_LIST_SELECTORS, FOOTNOTE_INLINE_REFERENCES } from "../constants"
import { transferContent, parseHTML } from "../utils/dom"
import { collectFootnotes, collectSidenotes, collectAsideFootnotes, createRef } from "./footnotes-collect"

export const normaliseFootnotes = (root: Element): void => {
  const doc = root.ownerDocument
  if (!doc) return

  const sidenotes = collectSidenotes(root, doc)
  const { footnotes, generics, extras } = collectFootnotes(root)

  const asideFootnotes = collectAsideFootnotes(root, doc)
  for (const [num, data] of Object.entries(asideFootnotes)) {
    const n = parseInt(num)
    if (!footnotes[n]) footnotes[n] = data
  }

  matchInlineRefs(root, footnotes, generics, doc)

  const allFootnotes = { ...sidenotes, ...footnotes }
  buildFootnoteList(root, allFootnotes, generics, extras, doc)
}

const matchInlineRefs = (root: Element, footnotes: FootnoteMap, generics: Element[], doc: Document): void => {
  const supGroups = new Map<Element, Element[]>()

  for (const el of root.querySelectorAll(FOOTNOTE_INLINE_REFERENCES)) {
    if (!el.parentNode) continue
    const footnoteId = extractFootnoteId(el, footnotes)
    if (!footnoteId) continue

    const entry = Object.entries(footnotes).find(([, data]) => data.originalId === footnoteId.toLowerCase())
    if (!entry) continue

    const [fnNum, fnData] = entry
    const refId = fnData.refs.length > 0 ? `fnref:${fnNum}-${fnData.refs.length + 1}` : `fnref:${fnNum}`
    fnData.refs.push(refId)

    const container = findOuterContainer(el)
    if (container.tagName.toLowerCase() === "sup") {
      if (!supGroups.has(container)) supGroups.set(container, [])
      supGroups.get(container)!.push(createRef(doc, fnNum, refId))
    } else {
      container.replaceWith(createRef(doc, fnNum, refId))
    }
  }

  // Handle grouped sup references
  for (const [container, refs] of supGroups) {
    const fragment = doc.createDocumentFragment()
    for (const ref of refs) {
      const link = ref.querySelector("a")
      if (link) {
        const sup = doc.createElement("sup")
        sup.id = ref.id
        sup.appendChild(link.cloneNode(true))
        fragment.appendChild(sup)
      }
    }
    container.replaceWith(fragment)
  }

  // Fallback: match remaining unmatched footnotes
  matchUnmatched(root, footnotes, generics, doc)
}

const matchUnmatched = (root: Element, footnotes: FootnoteMap, generics: Element[], doc: Document): void => {
  const unmatched = Object.entries(footnotes).filter(([, data]) => data.refs.length === 0)
  if (unmatched.length === 0) return

  const idMap = new Map<string, [string, FootnoteData]>()
  const numMap = new Map<string, [string, FootnoteData]>()
  for (const [num, data] of unmatched) {
    idMap.set(data.originalId, [num, data])
    numMap.set(num, [num, data])
  }

  // Pass 1: Match by fragment link
  for (const link of root.querySelectorAll('a[href*="#"]')) {
    if (!link.parentNode) continue
    if (link.closest('[id^="fnref:"]') || link.closest("#footnotes")) continue
    if (generics.some((g) => g.contains(link))) continue

    const fragment = (link.getAttribute("href") ?? "").split("#").pop()?.toLowerCase()
    if (!fragment) continue

    const entry = idMap.get(fragment)
    if (!entry) continue

    const text = link.textContent?.trim() ?? ""
    if (!/^[[(]?\d{1,4}[\])]?$/.test(text)) continue

    const [fnNum, fnData] = entry
    const refId = fnData.refs.length > 0 ? `fnref:${fnNum}-${fnData.refs.length + 1}` : `fnref:${fnNum}`
    fnData.refs.push(refId)
    findOuterContainer(link).replaceWith(createRef(doc, fnNum, refId))
  }

  // Pass 2: Match bare sup/span with numeric text
  const stillUnmatched = Object.entries(footnotes).filter(([, data]) => data.refs.length === 0)
  if (stillUnmatched.length === 0) return

  for (const el of root.querySelectorAll("sup, span.footnote-ref")) {
    if (!el.parentNode || el.id?.startsWith("fnref:") || el.closest("#footnotes")) continue

    const text = el.textContent?.trim() ?? ""
    const match = text.match(/^[[(]?(\d{1,4})[\])]?$/)
    if (!match?.[1]) continue

    const entry = numMap.get(match[1]) ?? idMap.get(match[1])
    if (!entry) continue

    const [fnNum, fnData] = entry
    if (fnData.refs.length > 0) continue

    fnData.refs.push(`fnref:${fnNum}`)
    findOuterContainer(el).replaceWith(createRef(doc, fnNum, `fnref:${fnNum}`))
  }
}

const buildFootnoteList = (
  root: Element,
  allFootnotes: FootnoteMap,
  generics: Element[],
  extras: Element[],
  doc: Document,
): void => {
  const wrapper = doc.createElement("div")
  wrapper.id = "footnotes"
  const ol = doc.createElement("ol")

  for (const [num, data] of Object.entries(allFootnotes)) {
    ol.appendChild(createFootnoteItem(doc, parseInt(num), data.content, data.refs))
  }

  // Remove original lists
  for (const list of root.querySelectorAll(FOOTNOTE_LIST_SELECTORS)) list.remove()
  for (const el of generics) el.parentNode?.removeChild(el)
  for (const el of extras) el.parentNode?.removeChild(el)

  // Remove orphaned trailing <hr>
  const lastChild = root.lastElementChild
  if (lastChild?.tagName.toLowerCase() === "hr") lastChild.remove()

  if (ol.children.length > 0) {
    wrapper.appendChild(ol)
    root.appendChild(wrapper)
  }
}

const BLOCK_TAGS = new Set([
  "div",
  "section",
  "article",
  "aside",
  "blockquote",
  "dl",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "table",
  "ul",
])

const createFootnoteItem = (doc: Document, num: number, content: string | Element, refs: string[]): Element => {
  const li = doc.createElement("li")
  li.className = "footnote"
  li.id = `fn:${num}`

  if (typeof content === "string") {
    const p = doc.createElement("p")
    p.appendChild(parseHTML(doc, content))
    li.appendChild(p)
  } else {
    const children = Array.from(content.children)
    const hasParagraphs = children.some((c) => c.tagName.toLowerCase() === "p")
    const hasBlocks = children.some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()))

    if (!hasParagraphs && !hasBlocks) {
      const p = doc.createElement("p")
      transferContent(content, p)
      removeBackrefs(p)
      li.appendChild(p)
    } else if (!hasParagraphs && hasBlocks) {
      for (const child of children) {
        const clone = child.cloneNode(true) as Element
        removeBackrefs(clone)
        li.appendChild(clone)
      }
    } else {
      for (const child of children) {
        if (child.tagName.toLowerCase() === "p") {
          if (!child.textContent?.trim() && !child.querySelector("img, br")) continue
          const p = doc.createElement("p")
          transferContent(child, p)
          removeBackrefs(p)
          li.appendChild(p)
        } else {
          const clone = child.cloneNode(true) as Element
          removeBackrefs(clone)
          li.appendChild(clone)
        }
      }
    }
  }

  const lastP = li.querySelector("p:last-of-type") ?? li
  for (const [i, refId] of refs.entries()) {
    const backlink = doc.createElement("a")
    backlink.setAttribute("href", `#${refId}`)
    backlink.setAttribute("title", "return to article")
    backlink.className = "footnote-backref"
    backlink.textContent = i < refs.length - 1 ? "\u21A9 " : "\u21A9"
    lastP.appendChild(backlink)
  }

  return li
}

const BACKREF_CHARS = /^[\u21A9\u21A5\u2191\u21B5\u2934\u2935\u23CE]+$/

const removeBackrefs = (el: Element): void => {
  for (const a of Array.from(el.querySelectorAll("a"))) {
    const text = a.textContent?.trim().replace(/\uFE0E|\uFE0F/g, "") ?? ""
    if (BACKREF_CHARS.test(text) || a.classList?.contains("footnote-backref")) a.remove()
  }
  while (el.lastChild?.nodeType === 3 && /^[\s,.;]*$/.test(el.lastChild.textContent ?? "")) {
    el.lastChild.remove()
  }
}

const extractFootnoteId = (el: Element, _footnotes: FootnoteMap): string => {
  if (el.matches("sup.footnoteref")) {
    const link = el.querySelector('a[id^="footnoteref-"]')
    return link?.id?.match(/^footnoteref-(\d+)$/)?.[1] ?? ""
  }
  if (el.matches('a[id^="ref-link"]')) return el.textContent?.trim() ?? ""
  if (el.matches('a[role="doc-biblioref"]')) {
    return el.getAttribute("data-xml-rid") ?? (el.getAttribute("href") ?? "").replace("#core-", "")
  }
  if (el.matches("a.footnote-anchor, span.footnote-hovercard-target a")) {
    return (el.id ?? "").replace("footnote-anchor-", "").toLowerCase()
  }
  if (el.matches("sup.reference")) {
    const link = el.querySelector("a")
    const href = link?.getAttribute("href") ?? ""
    const match = href
      .split("/")
      .pop()
      ?.match(/(?:cite_note|cite_ref)-(.+)/)
    return match?.[1]?.toLowerCase() ?? ""
  }
  if (el.matches('sup[id^="fnref:"]')) return el.id.replace("fnref:", "").toLowerCase()
  if (el.matches('sup[id^="fnr"]')) return el.id.replace("fnr", "").toLowerCase()
  if (el.matches("span.footnote-reference")) {
    return (
      el.getAttribute("data-footnote-id") ??
      (el.id?.startsWith("fnref") ? el.id.replace("fnref", "") : "").toLowerCase()
    )
  }
  if (el.matches("span.footnote-link")) return el.getAttribute("data-footnote-id") ?? ""
  if (el.matches("a.citation")) return el.textContent?.trim() ?? ""
  if (el.matches('a[id^="fnref"]')) return el.id.replace("fnref", "").toLowerCase()

  const href = el.getAttribute("href")
  if (href) return href.replace(/^#/, "").toLowerCase()
  return ""
}

const findOuterContainer = (el: Element): Element => {
  let current = el
  let parent = el.parentElement
  while (parent && (parent.tagName.toLowerCase() === "span" || parent.tagName.toLowerCase() === "sup")) {
    current = parent
    parent = parent.parentElement
  }
  return current
}
