import { countWords } from "@shared"
import { BLOCK_ELEMENTS_SELECTOR, FOOTNOTE_LIST_SELECTORS, FOOTNOTE_INLINE_REFERENCES } from "../constants"

const CONTENT_SIGNALS = [
  "admonition",
  "article",
  "content",
  "entry",
  "image",
  "img",
  "font",
  "figure",
  "figcaption",
  "pre",
  "main",
  "post",
  "story",
  "table",
]

const NAVIGATION_WORDS = [
  "advertisement",
  "all rights reserved",
  "banner",
  "cookie",
  "comments",
  "copyright",
  "follow me",
  "follow us",
  "footer",
  "header",
  "homepage",
  "login",
  "menu",
  "more articles",
  "more like this",
  "most read",
  "nav",
  "navigation",
  "newsletter",
  "popular",
  "privacy",
  "recommended",
  "register",
  "related",
  "responses",
  "share",
  "sidebar",
  "sign in",
  "sign up",
  "signup",
  "social",
  "sponsored",
  "subscribe",
  "terms",
  "trending",
]

const NON_CONTENT_CLASSES = [
  "advert",
  "ad-",
  "ads",
  "banner",
  "cookie",
  "copyright",
  "footer",
  "header",
  "homepage",
  "menu",
  "nav",
  "newsletter",
  "popular",
  "privacy",
  "recommended",
  "related",
  "rights",
  "share",
  "sidebar",
  "social",
  "sponsored",
  "subscribe",
  "terms",
  "trending",
  "widget",
]

const SOCIAL_PROFILE =
  /\b(linkedin\.com\/(in|company)\/|x\.com\/(?!intent\b)\w|facebook\.com\/(?!share\b)\w|instagram\.com\/\w|threads\.net\/\w|mastodon\.\w)/i
const BYLINE = /\bBy\s+[A-Z]/
const DATE_PATTERN = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/i
const NAV_HEADING_RE = new RegExp(NAVIGATION_WORDS.map((w) => w.replace(/\s+/g, "\\s+")).join("|"), "i")
const NAV_WORD_RES = NAVIGATION_WORDS.map((w) => new RegExp(`\\b${w.replace(/\s+/g, "\\s+")}\\b`))

export const filterLowScoringBlocks = (doc: Document, mainContent?: Element | null): number => {
  const targets = new Map<Element, number>()

  for (const el of doc.querySelectorAll(BLOCK_ELEMENTS_SELECTOR)) {
    if (targets.has(el)) continue
    if (mainContent && el.contains(mainContent)) continue
    if (el.closest("pre")) continue
    if (isLikelyContent(el)) continue

    const score = scoreBlock(el)
    if (score < 0) targets.set(el, score)
  }

  for (const el of targets.keys()) el.remove()
  return targets.size
}

export const scoreElement = (el: Element): number => {
  const text = el.textContent ?? ""
  const words = countWords(text)
  let score = words

  score += el.getElementsByTagName("p").length * 10
  score += text.split(",").length - 1

  const images = el.getElementsByTagName("img").length
  score -= (images / (words || 1)) * 3

  if (el.querySelector(FOOTNOTE_INLINE_REFERENCES)) score += 10
  if (el.querySelector(FOOTNOTE_LIST_SELECTORS)) score += 10

  score -= el.getElementsByTagName("table").length * 5

  const linkEls = el.getElementsByTagName("a")
  let linkLen = 0
  for (let i = 0; i < linkEls.length; i++) linkLen += (linkEls[i]!.textContent ?? "").length
  const linkDensity = Math.min(linkLen / (text.length || 1), 0.5)
  score *= 1 - linkDensity

  return score
}

export const findBestElement = (elements: Element[], minScore = 50): Element | null => {
  let best: Element | null = null
  let bestScore = 0

  for (const el of elements) {
    const s = scoreElement(el)
    if (s > bestScore) {
      bestScore = s
      best = el
    }
  }

  return bestScore > minScore ? best : null
}

const isLikelyContent = (el: Element): boolean => {
  const role = el.getAttribute("role")
  if (role && ["article", "main", "contentinfo"].includes(role)) return true

  const cls = (el.getAttribute("class") ?? "").toLowerCase()
  const id = (el.id ?? "").toLowerCase()
  for (const signal of CONTENT_SIGNALS) {
    if (cls.includes(signal) || id.includes(signal)) return true
  }

  if (el.querySelector("pre, table")) return true

  const text = el.textContent ?? ""
  const words = countWords(text)

  if (words < 1000) {
    let hasNavHeading = false
    for (const h of el.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      if (NAV_HEADING_RE.test((h.textContent ?? "").toLowerCase().trim())) {
        hasNavHeading = true
        break
      }
    }
    if (hasNavHeading) {
      if (words < 200) return false
      const linkDensity = el.getElementsByTagName("a").length / (words || 1)
      if (linkDensity > 0.2) return false
    }
  }

  if (isCardGrid(el, words)) return false

  if (words < 80) {
    for (const a of el.getElementsByTagName("a")) {
      if (SOCIAL_PROFILE.test(a.getAttribute("href") ?? "")) return false
    }
  }

  const paragraphs = el.getElementsByTagName("p").length
  const listItems = el.getElementsByTagName("li").length
  const blocks = paragraphs + listItems

  if (words > 50 && blocks > 1) return true
  if (words > 100) return true
  if (words > 30 && blocks > 0) return true
  if (words >= 10 && /[.?!]/.test(text)) {
    if (el.getElementsByTagName("a").length / words < 0.1) return true
  }

  return false
}

const scoreBlock = (el: Element): number => {
  try {
    if (
      el.matches(FOOTNOTE_LIST_SELECTORS) ||
      el.querySelector(FOOTNOTE_LIST_SELECTORS) ||
      el.closest(FOOTNOTE_LIST_SELECTORS)
    )
      return 0
  } catch {}

  const text = el.textContent ?? ""
  const words = countWords(text)
  if (words < 3) return 0

  let score = text.split(",").length - 1

  const lower = text.toLowerCase()
  for (const re of NAV_WORD_RES) {
    if (re.test(lower)) score -= 10
  }

  const linkEls = el.getElementsByTagName("a")
  const links = linkEls.length
  if (links / (words || 1) > 0.5) score -= 15

  if (links > 1 && words < 80) {
    let linkLen = 0
    for (let i = 0; i < linkEls.length; i++) linkLen += (linkEls[i]!.textContent ?? "").length
    if (text.length > 0 && linkLen / text.length > 0.8) score -= 15
  }

  const lists = el.getElementsByTagName("ul").length + el.getElementsByTagName("ol").length
  if (lists > 0 && links > lists * 3) score -= 10

  if (words < 80) {
    for (const a of el.getElementsByTagName("a")) {
      if (SOCIAL_PROFILE.test(a.getAttribute("href") ?? "")) {
        score -= 15
        break
      }
    }
  }

  if (words < 15 && BYLINE.test(text) && DATE_PATTERN.test(text)) score -= 10
  if (isCardGrid(el, words)) score -= 15

  const cls = (el.getAttribute("class") ?? "").toLowerCase()
  const id = (el.id ?? "").toLowerCase()
  for (const pat of NON_CONTENT_CLASSES) {
    if (cls.includes(pat) || id.includes(pat)) score -= 8
  }

  return score
}

const isCardGrid = (el: Element, words: number): boolean => {
  if (words < 3 || words >= 500) return false
  const headings = el.querySelectorAll("h2, h3, h4")
  if (headings.length < 3) return false
  const images = el.querySelectorAll("img")
  if (images.length < 2) return false
  let hw = 0
  for (const h of headings) hw += countWords(h.textContent ?? "")
  return (words - hw) / headings.length < 20
}
