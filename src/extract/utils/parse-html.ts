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
  // linkedom throws from deep inside its internals on empty/whitespace-only
  // input ("Cannot destructure property 'firstElementChild' of 'e' as it is
  // null"). Substitute a minimal valid shell so downstream code handles it
  // like any other content-less document instead of crashing.
  const safe = html && html.trim() ? html : "<!doctype html><html><head></head><body></body></html>"
  const { document } = parseHTML(safe)
  const doc = document as unknown as Record<string, unknown>
  if (!doc.styleSheets) doc.styleSheets = []
  if (doc.defaultView && !(doc.defaultView as Record<string, unknown>).getComputedStyle) {
    ;(doc.defaultView as Record<string, unknown>).getComputedStyle = makeComputedStyleStub()
  }
  if (url) doc.URL = url
  return document as unknown as Document
}
