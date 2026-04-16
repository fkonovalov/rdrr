import { countWords } from "@shared"
import { ENTRY_POINT_SELECTORS, BLOCK_ELEMENTS_SELECTOR } from "./constants"
import { scoreElement, findBestElement } from "./filters/scoring"

export const findMainContent = (doc: Document, contentSelector?: string): Element | null => {
  if (contentSelector) {
    const found = doc.querySelector(contentSelector)
    if (found) return found
  }

  return findByEntryPoints(doc) ?? findByScoring(doc)
}

const findByEntryPoints = (doc: Document): Element | null => {
  const candidates: Array<{ element: Element; score: number; selectorIndex: number }> = []

  for (const [index, selector] of ENTRY_POINT_SELECTORS.entries()) {
    for (const element of doc.querySelectorAll(selector)) {
      const score = (ENTRY_POINT_SELECTORS.length - index) * 40 + scoreElement(element)
      candidates.push({ element, score, selectorIndex: index })
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score)

  const top = candidates[0]!

  if (candidates.length === 1 && top.element.tagName.toLowerCase() === "body") {
    const tableContent = findTableBasedContent(doc)
    if (tableContent) return tableContent
  }

  let best = top
  for (let i = 1; i < candidates.length; i++) {
    const child = candidates[i]!
    const childWords = countWords(child.element.textContent ?? "")
    if (child.selectorIndex < best.selectorIndex && best.element.contains(child.element) && childWords > 50) {
      let siblings = 0
      for (const c of candidates) {
        if (c.selectorIndex === child.selectorIndex && top.element.contains(c.element)) {
          if (++siblings > 1) break
        }
      }
      if (siblings > 1) continue
      best = child
    }
  }

  return best.element
}

const findTableBasedContent = (doc: Document): Element | null => {
  const tables = Array.from(doc.getElementsByTagName("table"))
  const hasLayout = tables.some((table) => {
    const width = parseInt(table.getAttribute("width") ?? "0", 10)
    const cls = (table.className ?? "").toLowerCase()
    return width > 400 || table.getAttribute("align") === "center" || cls.includes("content") || cls.includes("article")
  })

  if (!hasLayout) return null
  return findBestElement(Array.from(doc.getElementsByTagName("td")))
}

const findByScoring = (doc: Document): Element | null => {
  const candidates: Array<{ score: number; element: Element }> = []

  for (const el of doc.querySelectorAll(BLOCK_ELEMENTS_SELECTOR)) {
    const score = scoreElement(el)
    if (score > 0) candidates.push({ score, element: el })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]!.element
}
