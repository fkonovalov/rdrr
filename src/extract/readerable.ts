import { fetchWithRedirects } from "../provider/web"
import { PARTIAL_SELECTORS_REGEX } from "./constants"
import { parseLinkedomHTML } from "./utils/parse-html"

export interface ReaderableOptions {
  minContentLength?: number
  minScore?: number
}

// Quick lightweight heuristic to estimate whether a document is likely to
// contain an extractable article. Ported from Mozilla Readability-readerable.js.
// Does not run the full extraction pipeline -- cheap pre-check suitable for
// batch processing or agent routing.
export const isProbablyReaderable = async (
  input: string | Document,
  options: ReaderableOptions = {},
): Promise<boolean> => {
  const doc = typeof input === "string" ? await fetchAndParse(input) : input
  return scoreDocument(doc, options)
}

const fetchAndParse = async (url: string): Promise<Document> => {
  const res = await fetchWithRedirects(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`)
  const html = await res.text()
  return parseLinkedomHTML(html, url)
}

const scoreDocument = (doc: Document, { minContentLength = 140, minScore = 20 }: ReaderableOptions): boolean => {
  const nodes = new Set<Element>(doc.querySelectorAll("p, pre, article"))

  // Older-style content may use <div><br><br> instead of <p>. Include those div parents.
  for (const br of doc.querySelectorAll("div > br")) {
    const parent = br.parentElement
    if (parent) nodes.add(parent)
  }

  let score = 0
  for (const node of nodes) {
    if (!isVisible(node)) continue

    const matchString = `${node.className ?? ""} ${node.id ?? ""}`
    if (PARTIAL_SELECTORS_REGEX.test(matchString)) continue
    if (node.matches?.("li p")) continue

    const textLength = (node.textContent ?? "").trim().length
    if (textLength < minContentLength) continue

    score += Math.sqrt(textLength - minContentLength)
    if (score > minScore) return true
  }

  return false
}

const isVisible = (node: Element): boolean => {
  const style = (node as HTMLElement).style
  if (style?.display === "none") return false
  if (node.hasAttribute("hidden")) return false
  if (node.getAttribute("aria-hidden") === "true") return false
  return true
}
