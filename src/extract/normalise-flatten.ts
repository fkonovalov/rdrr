import {
  BLOCK_ELEMENTS_SET,
  BLOCK_ELEMENTS_SELECTOR,
  BLOCK_LEVEL_ELEMENTS,
  PRESERVE_ELEMENTS,
  INLINE_ELEMENTS,
  ALLOWED_EMPTY_ELEMENTS,
} from "./constants"
import { isElement, isTextNode, getClassName } from "./utils/dom"

export const flattenWrappers = (element: Element, doc: Document): void => {
  let changed = true
  while (changed) {
    changed = false
    if (processTopLevel(element, doc)) changed = true
    if (processDeepest(element, doc)) changed = true
    if (finalCleanup(element, doc)) changed = true
  }
}

export const unwrapBareSpans = (element: Element): void => {
  let count = 0
  for (const span of Array.from(element.querySelectorAll("span")).reverse()) {
    if (!span.parentNode || span.attributes.length > 0) continue
    while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span)
    span.remove()
    count++
  }
  if (count > 0) element.normalize()
}

export const stripExtraBr = (element: Element): void => {
  const brs = Array.from(element.getElementsByTagName("br"))
  let group: Element[] = []

  const flush = (): void => {
    if (group.length > 2) {
      for (let i = 2; i < group.length; i++) group[i]!.remove()
    }
    group = []
  }

  for (const br of brs) {
    let isConsecutive = false
    if (group.length > 0) {
      let node: Node | null = br.previousSibling
      while (node?.nodeType === 3 && !(node.textContent ?? "").trim()) node = node.previousSibling
      if (node === group.at(-1)) isConsecutive = true
    }
    if (isConsecutive) group.push(br)
    else {
      flush()
      group = [br]
    }
  }
  flush()
}

const processTopLevel = (element: Element, doc: Document): boolean => {
  let modified = false
  for (const el of Array.from(element.children)) {
    if (!BLOCK_ELEMENTS_SET.has(el.tagName.toLowerCase())) continue
    if (processElement(el, element, doc)) modified = true
  }
  return modified
}

const processDeepest = (element: Element, doc: Document): boolean => {
  const sorted = Array.from(element.querySelectorAll(BLOCK_ELEMENTS_SELECTOR)).sort((a, b) => depth(b) - depth(a))

  let modified = false
  for (const el of sorted) {
    if (processElement(el, element, doc)) modified = true
  }
  return modified
}

const finalCleanup = (element: Element, doc: Document): boolean => {
  let modified = false
  for (const el of Array.from(element.querySelectorAll(BLOCK_ELEMENTS_SELECTOR))) {
    const children = Array.from(el.children)
    const onlyParagraphs = children.length > 0 && children.every((c) => c.tagName.toLowerCase() === "p")
    if (onlyParagraphs || (!shouldPreserve(el) && isWrapper(el))) {
      replaceWithChildren(el, doc)
      modified = true
    }
  }
  return modified
}

const processElement = (el: Element, root: Element, doc: Document): boolean => {
  if (!el.parentNode || shouldPreserve(el)) return false
  const tag = el.tagName.toLowerCase()

  if (!ALLOWED_EMPTY_ELEMENTS.has(tag) && !el.children.length && !(el.textContent ?? "").trim()) {
    el.remove()
    return true
  }

  if (el.parentElement === root) {
    const children = Array.from(el.children)
    if (children.length > 0 && !children.some((c) => INLINE_ELEMENTS.has(c.tagName.toLowerCase()))) {
      replaceWithChildren(el, doc)
      return true
    }
  }

  if (isWrapper(el)) {
    replaceWithChildren(el, doc)
    return true
  }

  const nodes = Array.from(el.childNodes)
  if (
    nodes.length > 0 &&
    nodes.every((n) => isTextNode(n) || (isElement(n) && INLINE_ELEMENTS.has(n.nodeName.toLowerCase())))
  ) {
    if ((el.textContent ?? "").trim()) {
      const p = doc.createElement("p")
      while (el.firstChild) p.appendChild(el.firstChild)
      el.replaceWith(p)
      return true
    }
  }

  if (el.children.length === 1) {
    const child = el.firstElementChild!
    if (BLOCK_ELEMENTS_SET.has(child.tagName.toLowerCase()) && !shouldPreserve(child)) {
      el.replaceWith(child)
      return true
    }
  }

  if (depth(el) > 0 && !hasDirectInlineContent(el)) {
    replaceWithChildren(el, doc)
    return true
  }

  return false
}

const shouldPreserve = (el: Element): boolean => {
  if (PRESERVE_ELEMENTS.has(el.tagName.toLowerCase())) return true
  if (el.getAttribute("data-callout") || el.closest?.("[data-callout]")) return true

  const role = el.getAttribute("role")
  if (role && ["article", "main", "navigation", "banner", "contentinfo"].includes(role)) return true

  const cls = getClassName(el).toLowerCase()
  if (/(?:article|main|content|footnote|reference|bibliography)/.test(cls)) return true

  return Array.from(el.children).some(
    (child) =>
      PRESERVE_ELEMENTS.has(child.tagName.toLowerCase()) ||
      child.getAttribute("role") === "article" ||
      /(?:article|main|content|footnote|reference|bibliography)/.test(getClassName(child).toLowerCase()),
  )
}

const isWrapper = (el: Element): boolean => {
  if (hasDirectInlineContent(el)) return false
  if (!(el.textContent ?? "").trim()) return true

  const children = Array.from(el.children)
  if (children.length === 0) return true
  if (children.every((c) => BLOCK_LEVEL_ELEMENTS.has(c.tagName.toLowerCase()))) return true
  if (/(?:wrapper|container|layout|row|col|grid|flex|outer|inner|content-area)/i.test(getClassName(el))) return true

  const textNodes = Array.from(el.childNodes).filter((n) => isTextNode(n) && (n.textContent ?? "").trim())
  if (textNodes.length === 0) return true

  return children.length > 0 && !children.some((c) => INLINE_ELEMENTS.has(c.tagName.toLowerCase()))
}

const hasDirectInlineContent = (el: Element): boolean => {
  for (const child of el.childNodes) {
    if (isTextNode(child) && (child.textContent ?? "").trim()) return true
    if (isElement(child) && INLINE_ELEMENTS.has(child.nodeName.toLowerCase())) return true
  }
  return false
}

const replaceWithChildren = (el: Element, doc: Document): void => {
  const fragment = doc.createDocumentFragment()
  while (el.firstChild) fragment.appendChild(el.firstChild)
  el.replaceWith(fragment)
}

const depth = (el: Element): number => {
  let d = 0
  let parent = el.parentElement
  while (parent) {
    if (BLOCK_ELEMENTS_SET.has(parent.tagName.toLowerCase())) d++
    parent = parent.parentElement
  }
  return d
}
