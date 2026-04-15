import { ALLOWED_ATTRIBUTES, ALLOWED_EMPTY_ELEMENTS } from "./constants"
import { isElement, isTextNode, transferContent } from "./utils/dom"

export const normaliseHeadings = (element: Element, title: string, doc: Document): void => {
  const normalize = (text: string): string =>
    text
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()

  for (const h1 of Array.from(element.getElementsByTagName("h1"))) {
    const h2 = doc.createElement("h2")
    transferContent(h1, h2)
    for (const attr of h1.attributes) {
      if (ALLOWED_ATTRIBUTES.has(attr.name)) h2.setAttribute(attr.name, attr.value)
    }
    h1.parentNode?.replaceChild(h2, h1)
  }

  const h2s = element.getElementsByTagName("h2")
  if (h2s.length > 0) {
    const first = h2s[0]!
    if (normalize(title) && normalize(title) === normalize(first.textContent ?? "")) {
      first.remove()
    }
  }
}

export const removeComments = (element: Element): void => {
  const doc = element.ownerDocument
  const walker = doc.createTreeWalker(element, 128 /* NodeFilter.SHOW_COMMENT */)
  const comments: Node[] = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  for (const node of comments) node.parentNode?.removeChild(node)
}

export const stripAttributes = (element: Element): void => {
  const process = (el: Element): void => {
    if (el.tagName.toLowerCase() === "svg" || el.namespaceURI === "http://www.w3.org/2000/svg") return

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value

      const isPreserved =
        (name === "id" && (value.startsWith("fnref:") || value.startsWith("fn:") || value === "footnotes")) ||
        (name === "class" &&
          ((el.tagName === "CODE" && value.startsWith("language-")) ||
            value === "footnote-backref" ||
            /^callout(?:-|$)/.test(value)))

      if (isPreserved) continue
      if (!ALLOWED_ATTRIBUTES.has(name)) el.removeAttribute(attr.name)
    }
  }

  process(element)
  for (const el of element.querySelectorAll("*")) process(el)
}

export const removeEmptyElements = (element: Element): void => {
  for (const el of Array.from(element.querySelectorAll("*")).reverse()) {
    if (!el.parentNode) continue
    if (ALLOWED_EMPTY_ELEMENTS.has(el.tagName.toLowerCase())) continue

    if (el.tagName === "DIV") {
      const children = el.children
      if (children.length > 0) {
        let allEmpty = true
        for (const child of children) {
          if (child.tagName !== "SPAN") {
            allEmpty = false
            break
          }
          const text = child.textContent?.trim() ?? ""
          if (text !== "," && text !== "" && text !== " ") {
            allEmpty = false
            break
          }
        }
        if (allEmpty) {
          el.remove()
          continue
        }
      }
    }

    const text = el.textContent ?? ""
    if (text.trim().length > 0 || text.includes("\u00A0")) continue

    if (!el.hasChildNodes()) {
      el.remove()
      continue
    }

    let isEmpty = true
    for (const child of el.childNodes) {
      if (isElement(child) && child.tagName.toLowerCase() !== "br") {
        isEmpty = false
        break
      }
      if (isTextNode(child)) {
        const t = child.textContent ?? ""
        if (t.trim().length > 0 || t.includes("\u00A0")) {
          isEmpty = false
          break
        }
      }
    }
    if (isEmpty) el.remove()
  }
}

export const removeTrailingHeadings = (element: Element): void => {
  const hasContentAfter = (el: Element): boolean => {
    let text = ""
    let sibling = el.nextSibling
    while (sibling) {
      text += sibling.textContent ?? ""
      sibling = sibling.nextSibling
    }
    if (text.trim()) return true
    const parent = el.parentElement
    return parent && parent !== element ? hasContentAfter(parent) : false
  }

  for (const heading of Array.from(element.querySelectorAll("h1, h2, h3, h4, h5, h6")).reverse()) {
    if (!hasContentAfter(heading)) heading.remove()
    else break
  }
}
