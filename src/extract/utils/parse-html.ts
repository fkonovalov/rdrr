import { parseHTML } from "linkedom"

export const parseLinkedomHTML = (html: string, url?: string): Document => {
  const { document } = parseHTML(html)
  const doc = document as unknown as Record<string, unknown>
  if (!doc.styleSheets) doc.styleSheets = []
  if (doc.defaultView && !(doc.defaultView as Record<string, unknown>).getComputedStyle) {
    ;(doc.defaultView as Record<string, unknown>).getComputedStyle = () => ({ display: "" })
  }
  if (url) doc.URL = url
  return document as unknown as Document
}
