import { parseHTML } from "linkedom"

// Proxy handler that returns "" for any CSS property the caller asks for.
// Some site-specific extractors read `getComputedStyle(el).visibility` or
// `.opacity`; a fixed { display: "" } stub silently returned undefined for
// those, breaking guards like `style.visibility === "hidden"`.
const COMPUTED_STYLE_STUB: ProxyHandler<Record<string, unknown>> = {
  get(_, prop) {
    if (prop === Symbol.toPrimitive || prop === "toString") return () => ""
    return ""
  },
  has: () => true,
}

const makeComputedStyleStub = (): () => Record<string, unknown> => () =>
  new Proxy({}, COMPUTED_STYLE_STUB) as Record<string, unknown>

export const parseLinkedomHTML = (html: string, url?: string): Document => {
  const { document } = parseHTML(html)
  const doc = document as unknown as Record<string, unknown>
  if (!doc.styleSheets) doc.styleSheets = []
  if (doc.defaultView && !(doc.defaultView as Record<string, unknown>).getComputedStyle) {
    ;(doc.defaultView as Record<string, unknown>).getComputedStyle = makeComputedStyleStub()
  }
  if (url) doc.URL = url
  return document as unknown as Document
}
