import { removeHeadingAnchors } from "./elements/headings"
import {
  normaliseHeadings,
  removeComments,
  stripAttributes,
  removeEmptyElements,
  removeTrailingHeadings,
} from "./normalise-clean"
import { flattenWrappers, unwrapBareSpans, stripExtraBr } from "./normalise-flatten"
import { normaliseRules } from "./normalise-rules"
import { normaliseSpaces, removeEmptyLines } from "./normalise-spaces"

export const normaliseContent = (element: Element, title: string, doc: Document): void => {
  normaliseSpaces(element)
  removeComments(element)
  normaliseHeadings(element, title, doc)
  wrapPreformattedCode(element, doc)
  normaliseRules(element, doc)

  flattenWrappers(element, doc)
  stripAttributes(element)
  unwrapBareSpans(element)
  unwrapSpecialLinks(element, doc)
  removeHeadingAnchors(element)
  removeObsolete(element)
  removeEmptyElements(element)
  removeTrailingHeadings(element)
  removeOrphanedDividers(element)
  flattenWrappers(element, doc)
  removeOrphanedDividers(element)
  stripExtraBr(element)
  removeEmptyLines(element, doc)
}

const removeOrphanedDividers = (element: Element): void => {
  while (true) {
    let node: Node | null = element.firstChild
    while (node?.nodeType === 3 && !(node.textContent ?? "").trim()) node = node.nextSibling
    if (node?.nodeType === 1 && (node as Element).tagName.toLowerCase() === "hr") {
      ;(node as Element).remove()
    } else break
  }
  while (true) {
    let node: Node | null = element.lastChild
    while (node?.nodeType === 3 && !(node.textContent ?? "").trim()) node = node.previousSibling
    if (node?.nodeType === 1 && (node as Element).tagName.toLowerCase() === "hr") {
      ;(node as Element).remove()
    } else break
  }
}

const wrapPreformattedCode = (element: Element, doc: Document): void => {
  for (const code of Array.from(element.querySelectorAll("code"))) {
    if (code.closest("pre")) continue
    if (!/white-space\s*:\s*pre/.test(code.getAttribute("style") ?? "")) continue
    const pre = doc.createElement("pre")
    code.parentNode?.insertBefore(pre, code)
    pre.appendChild(code)
  }
}

const unwrapSpecialLinks = (element: Element, doc: Document): void => {
  for (const a of Array.from(element.querySelectorAll("code a"))) unwrapElement(a)
  for (const a of Array.from(element.querySelectorAll('a[href^="javascript:"]'))) unwrapElement(a)

  for (const link of Array.from(element.querySelectorAll("a"))) {
    const href = link.getAttribute("href")
    if (!href || href.startsWith("#")) continue
    const heading = Array.from(link.children).find((c) => /^H[1-6]$/.test(c.nodeName))
    if (!heading) continue
    const inner = doc.createElement("a")
    inner.setAttribute("href", href)
    while (heading.firstChild) inner.appendChild(heading.firstChild)
    heading.appendChild(inner)
    unwrapElement(link)
  }

  for (const link of Array.from(element.querySelectorAll('a[href^="#"]'))) {
    if (link.querySelector("h1, h2, h3, h4, h5, h6")) unwrapElement(link)
  }
}

const removeObsolete = (element: Element): void => {
  element.querySelectorAll("object, embed, applet").forEach((el) => el.remove())
}

const unwrapElement = (el: Element): void => {
  while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el)
  el.remove()
}
