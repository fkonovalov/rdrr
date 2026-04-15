import { ALLOWED_ATTRIBUTES } from "../constants"

const PERMALINK_SYMBOLS = /^[#¶§🔗]$/u

export const headingRules = [
  {
    selector: "h1, h2, h3, h4, h5, h6",
    element: "keep" as const,
    transform: (el: Element, doc: Document): Element => {
      const newHeading = doc.createElement(el.tagName)

      for (const attr of el.attributes) {
        if (ALLOWED_ATTRIBUTES.has(attr.name)) {
          newHeading.setAttribute(attr.name, attr.value)
        }
      }

      if (!el.children.length) {
        newHeading.textContent = el.textContent?.trim() ?? ""
        return newHeading
      }

      const clone = el.cloneNode(true) as Element
      const navTexts: string[] = []
      const toRemove: Element[] = []

      for (const child of clone.querySelectorAll("*")) {
        if (!isHeadingNav(child)) continue
        navTexts.push(child.textContent?.trim() ?? "")
        toRemove.push(child)
      }

      for (const node of toRemove) node.remove()

      let text = clone.textContent?.trim() ?? ""
      if (!text && navTexts.length > 0) text = navTexts[0] ?? ""

      newHeading.textContent = text
      return newHeading
    },
  },
]

export const removeHeadingAnchors = (root: Element): void => {
  for (const link of root.querySelectorAll("h1 a, h2 a, h3 a, h4 a, h5 a, h6 a")) {
    if (isPermalink(link)) link.remove()
  }
}

const isPermalink = (el: Element): boolean => {
  if (el.tagName.toLowerCase() !== "a") return false
  const href = el.getAttribute("href") ?? ""
  const title = (el.getAttribute("title") ?? "").toLowerCase()
  const cls = (el.getAttribute("class") ?? "").toLowerCase()
  const text = (el.textContent ?? "").trim()

  if (href.startsWith("#") || href.includes("#")) return true
  if (title.includes("permalink")) return true
  if (cls.includes("permalink") || cls.includes("heading-anchor") || cls.includes("anchor-link")) return true
  if (PERMALINK_SYMBOLS.test(text)) return true

  return false
}

const isHeadingNav = (el: Element): boolean => {
  const tag = el.tagName.toLowerCase()
  if (tag === "button") return true
  if (tag === "a" && isPermalink(el)) return true
  if (el.classList.contains("anchor") || el.classList.contains("permalink-widget")) return true
  if ((tag === "span" || tag === "div") && Array.from(el.querySelectorAll("a")).some(isPermalink)) return true
  return false
}
