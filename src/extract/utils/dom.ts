export const transferContent = (source: Node, target: Node): void => {
  if ("replaceChildren" in target) {
    ;(target as Element).replaceChildren()
  } else {
    while (target.firstChild) target.removeChild(target.firstChild)
  }
  while (source.firstChild) target.appendChild(source.firstChild)
}

export const serializeHTML = (el: { innerHTML: string }): string => el.innerHTML

export const parseHTML = (doc: Document, html: string): DocumentFragment => {
  if (!html) return doc.createDocumentFragment()

  const template = doc.createElement("template")
  template.innerHTML = html
  if (template.content) return template.content

  const div = doc.createElement("div")
  div.innerHTML = html
  const fragment = doc.createDocumentFragment()
  while (div.firstChild) fragment.appendChild(div.firstChild)
  return fragment
}

export const decodeHTMLEntities = (doc: Document, text: string): string => {
  const textarea = doc.createElement("textarea")
  textarea.innerHTML = text
  return textarea.value
}

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export const getClassName = (el: Element): string =>
  typeof el.className === "string" ? el.className : (el.getAttribute("class") ?? "")

const DANGEROUS_SCHEMES = ["javascript:", "vbscript:", "livescript:", "mocha:"]

// blob: and data: encode a whole document into an attribute, bypassing element
// stripping. Only data:image/* survives (inline images), and never SVG, whose
// documents may carry <script>; pass allowInlineImage=false for iframe src.
export const isDangerousUrl = (url: string, allowInlineImage = true): boolean => {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars to detect obfuscated URL schemes
  const normalized = url.replace(/[\s\u0000-\u001F]+/g, "").toLowerCase()
  if (DANGEROUS_SCHEMES.some((scheme) => normalized.startsWith(scheme))) return true
  if (normalized.startsWith("blob:")) return true
  if (normalized.startsWith("data:")) {
    if (!allowInlineImage) return true
    return !normalized.startsWith("data:image/") || normalized.startsWith("data:image/svg+xml")
  }
  return false
}

export const safeQueryAll = (root: Document | Element, selector: string): Element[] => {
  try {
    return Array.from(root.querySelectorAll(selector))
  } catch {
    return []
  }
}

export const closestByTag = (el: Element, tags: ReadonlySet<string>): boolean => {
  let current: Element | null = el
  while (current) {
    if (tags.has(current.localName)) return true
    current = current.parentElement
  }
  return false
}

export const hasAncestorIn = (el: Element, set: ReadonlySet<Element>): boolean => {
  let current = el.parentElement
  while (current) {
    if (set.has(current)) return true
    current = current.parentElement
  }
  return false
}

export const collectAncestors = (matches: Iterable<Element>): Set<Element> => {
  const ancestors = new Set<Element>()
  for (const match of matches) {
    let current = match.parentElement
    while (current && !ancestors.has(current)) {
      ancestors.add(current)
      current = current.parentElement
    }
  }
  return ancestors
}

export const isElement = (node: Node): node is Element => node.nodeType === 1

export const isTextNode = (node: Node): node is Text => node.nodeType === 3

export const hasVisibleText = (el: Element, countNbsp = false): boolean => {
  let node = el.firstChild
  while (node) {
    if (isTextNode(node)) {
      const t = node.textContent ?? ""
      if (t.trim().length > 0 || (countNbsp && t.includes("\u00A0"))) return true
    } else if (isElement(node) && hasVisibleText(node, countNbsp)) {
      return true
    }
    node = node.nextSibling
  }
  return false
}
