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

// URL schemes that can execute script or deliver HTML in ways that survive
// sanitisation of the rendered markdown. SVG is blocked because inline <script>
// is valid in image/svg+xml.
const DANGEROUS_SCHEMES = [
  "javascript:",
  "vbscript:",
  "livescript:",
  "mocha:",
  "data:text/html",
  "data:application/xhtml",
  "data:image/svg+xml",
  "data:application/x-msdownload",
]

export const isDangerousUrl = (url: string): boolean => {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars to detect obfuscated URL schemes
  const normalized = url.replace(/[\s\u0000-\u001F]+/g, "").toLowerCase()
  return DANGEROUS_SCHEMES.some((scheme) => normalized.startsWith(scheme))
}

export const isElement = (node: Node): node is Element => node.nodeType === 1

export const isTextNode = (node: Node): node is Text => node.nodeType === 3
