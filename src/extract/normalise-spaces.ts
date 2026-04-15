import { INLINE_ELEMENTS } from "./constants"
import { isElement, isTextNode } from "./utils/dom"

// These patterns match zero-width characters (including ZWJ \u200D) as LITERAL
// characters, not as joiner sequences. The lint rule is a false positive here.
/* eslint-disable no-misleading-character-class */
const EMPTY_ZW_PATTERN = /^[\u200C\u200B\u200D\u200E\u200F\uFEFF]*$/u
const ZW_CHARS_PATTERN = /[\u200B\u200D\u200E\u200F\uFEFF]+/gu
const BLOCK_WS_PATTERN = /^[\n\r\t \u200C\u200B\u200D\u200E\u200F\uFEFF\xA0]*$/u
const INLINE_WS_PATTERN = /^[\n\r\t\u200C\u200B\u200D\u200E\u200F\uFEFF]*$/u
/* eslint-enable no-misleading-character-class */

export const normaliseSpaces = (element: Element): void => {
  const walk = (node: Node): void => {
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase()
      if (tag === "pre" || tag === "code") return
    }

    if (isTextNode(node)) {
      const text = node.textContent ?? ""
      const normalized = text.replace(/\xA0/g, " ")
      if (normalized !== text) node.textContent = normalized
    }

    if (node.hasChildNodes()) {
      for (const child of Array.from(node.childNodes)) walk(child)
    }
  }

  walk(element)
}

export const removeEmptyLines = (element: Element, doc: Document): void => {
  removeEmptyTextNodes(element)
  cleanupElements(element, doc)
}

const removeEmptyTextNodes = (node: Node): void => {
  if (isElement(node)) {
    const tag = node.tagName.toLowerCase()
    if (tag === "pre" || tag === "code") return
  }

  for (const child of Array.from(node.childNodes)) removeEmptyTextNodes(child)

  if (isTextNode(node)) {
    const text = node.textContent ?? ""
    if (!text || EMPTY_ZW_PATTERN.test(text)) {
      node.parentNode?.removeChild(node)
    } else {
      const cleaned = text
        .replace(/[\n\r]+/g, " ")
        .replace(/\t+/g, " ")
        .replace(/ {2,}/g, " ")
        .replace(/^[ ]+$/, " ")
        .replace(/\s+([,.!?:;])/g, "$1")
        .replace(ZW_CHARS_PATTERN, "")
        .replace(/(?:\xA0){2,}/g, "\xA0")
      if (cleaned !== text) node.textContent = cleaned
    }
  }
}

const cleanupElements = (node: Node, doc: Document): void => {
  if (!isElement(node)) return
  const tag = node.tagName.toLowerCase()
  if (tag === "pre" || tag === "code") return

  for (const child of Array.from(node.childNodes).filter(isElement)) {
    cleanupElements(child, doc)
  }

  node.normalize()

  const isBlock = tag === "div" || tag === "section" || tag === "article" || tag === "main"
  const wsPattern = isBlock ? BLOCK_WS_PATTERN : INLINE_WS_PATTERN

  while (node.firstChild?.nodeType === 3 && wsPattern.test(node.firstChild.textContent ?? "")) {
    node.removeChild(node.firstChild)
  }
  while (node.lastChild?.nodeType === 3 && wsPattern.test(node.lastChild.textContent ?? "")) {
    node.removeChild(node.lastChild)
  }

  if (!isBlock && INLINE_ELEMENTS.has(tag) && node.parentNode) {
    moveWhitespaceOutside(node as Element, doc, "leading")
    moveWhitespaceOutside(node as Element, doc, "trailing")
  }

  if (!isBlock) {
    const children = Array.from(node.childNodes)
    for (let i = 0; i < children.length - 1; i++) {
      const current = children[i]!
      const next = children[i + 1]!
      if (!isElement(current) && !isElement(next)) continue

      const nextText = next.textContent ?? ""
      const currText = current.textContent ?? ""
      if (/^[,.!?:;)\]]/.test(nextText) || /[,.!?:;([]\s*$/.test(currText)) continue

      const hasSpace =
        (isTextNode(current) && (current.textContent ?? "").endsWith(" ")) ||
        (isTextNode(next) && (next.textContent ?? "").startsWith(" "))
      if (!hasSpace) node.insertBefore(doc.createTextNode(" "), next)
    }
  }
}

const moveWhitespaceOutside = (el: Element, doc: Document, direction: "leading" | "trailing"): void => {
  const child = direction === "leading" ? el.firstChild : el.lastChild
  if (!child || !isTextNode(child)) return

  const text = child.textContent ?? ""
  const trimmed = direction === "leading" ? text.replace(/^\s+/, "") : text.replace(/\s+$/, "")
  if (trimmed === text || !el.parentNode) return

  child.textContent = trimmed

  const neighbor = direction === "leading" ? el.previousSibling : el.nextSibling
  const hasSpace =
    neighbor &&
    isTextNode(neighbor) &&
    (direction === "leading"
      ? (neighbor.textContent ?? "").endsWith(" ")
      : (neighbor.textContent ?? "").startsWith(" "))

  if (!hasSpace) {
    const insertBefore = direction === "leading" ? el : el.nextSibling
    el.parentNode.insertBefore(doc.createTextNode(" "), insertBefore)
  }
}
