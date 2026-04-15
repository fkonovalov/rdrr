import { countWords } from "@shared"
import { decodeHTMLEntities } from "./utils/dom"

export const extractSchemaOrg = (doc: Document): unknown[] => {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  const items: unknown[] = []

  for (const script of scripts) {
    let json = script.textContent ?? ""
    try {
      json = json
        .replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "")
        .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
        .trim()

      const data = JSON.parse(json)
      if (data?.["@graph"] && Array.isArray(data["@graph"])) {
        items.push(...(data["@graph"] as unknown[]))
      } else {
        items.push(data)
      }
    } catch {}
  }

  return items.map((item) => decodeStrings(doc, item))
}

export const getSchemaText = (data: unknown, depth = 0): string => {
  if (!data || depth > 10) return ""

  const items = Array.isArray(data) ? data : [data]
  for (const item of items) {
    if (Array.isArray(item)) {
      const found = getSchemaText(item, depth + 1)
      if (found) return found
    }
    if (isRecord(item)) {
      if (typeof item.text === "string" && item.text) return item.text
      if (typeof item.articleBody === "string" && item.articleBody) return item.articleBody
      if (Array.isArray(item["@graph"])) {
        const found = getSchemaText(item["@graph"], depth + 1)
        if (found) return found
      }
    }
  }
  return ""
}

export const findElementBySchemaText = (root: Element, schemaText: string): Element | null => {
  const firstPara = schemaText.split(/\n\s*\n/)[0]?.trim() ?? ""
  const searchPhrase = firstPara.substring(0, 100).trim()
  if (!searchPhrase) return null

  const schemaWordCount = countWords(schemaText)
  let bestMatch: Element | null = null
  let bestSize = Infinity

  for (const el of root.querySelectorAll("*")) {
    if (el === root) continue
    const text = el.textContent ?? ""
    if (!text.includes(searchPhrase)) continue
    const words = countWords(text)
    if (words >= schemaWordCount * 0.8 && words < bestSize) {
      bestSize = words
      bestMatch = el
    }
  }

  return bestMatch
}

export const collectMetaTags = (
  doc: Document,
): Array<{ name: string | null; property: string | null; content: string }> => {
  const tags: Array<{ name: string | null; property: string | null; content: string }> = []
  for (const meta of doc.querySelectorAll("meta")) {
    const content = meta.getAttribute("content")
    if (content) {
      tags.push({
        name: meta.getAttribute("name"),
        property: meta.getAttribute("property"),
        content: decodeHTMLEntities(doc, content),
      })
    }
  }
  return tags
}

const decodeStrings = (doc: Document, item: unknown): unknown => {
  if (typeof item === "string") return decodeHTMLEntities(doc, item)
  if (Array.isArray(item)) return item.map((i) => decodeStrings(doc, i))
  if (isRecord(item)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(item)) {
      result[key] = decodeStrings(doc, item[key])
    }
    return result
  }
  return item
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
