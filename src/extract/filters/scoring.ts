import { countWords } from "@shared"
import { BLOCK_ELEMENTS_SELECTOR, FOOTNOTE_LIST_SELECTORS, FOOTNOTE_INLINE_REFERENCES } from "../constants"
import { closestByTag, collectAncestors, hasAncestorIn, safeQueryAll } from "../utils/dom"

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

const PRE_TAG = new Set(["pre"])
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"]

interface LazyText {
  text: () => string
  words: () => number
}

const makeLazyText = (el: Element): LazyText => {
  let text: string | undefined
  let words: number | undefined
  return {
    text: () => (text ??= el.textContent ?? ""),
    words: () => (words ??= countWords((text ??= el.textContent ?? ""))),
  }
}

interface BlockContext {
  footnoteMatches: Set<Element>
  footnoteAncestors: Set<Element>
  preTableAncestors: Set<Element>
}

const buildBlockContext = (root: Document | Element): BlockContext => {
  const footnoteMatches = new Set(safeQueryAll(root, FOOTNOTE_LIST_SELECTORS))
  const preTable = [...root.getElementsByTagName("pre"), ...root.getElementsByTagName("table")]
  return {
    footnoteMatches,
    footnoteAncestors: collectAncestors(footnoteMatches),
    preTableAncestors: collectAncestors(preTable),
  }
}

export const filterLowScoringBlocks = (root: Document | Element, mainContent?: Element | null): number => {
  const targets: Element[] = []
  const ctx = buildBlockContext(root)

  for (const el of root.querySelectorAll(BLOCK_ELEMENTS_SELECTOR)) {
    if (mainContent && el.contains(mainContent)) continue
    if (closestByTag(el, PRE_TAG)) continue
    const lz = makeLazyText(el)
    if (isLikelyContent(el, lz, ctx)) continue

    const score = scoreBlock(el, lz, ctx)
    if (score < 0) targets.push(el)
  }

  for (const el of targets) el.remove()
  return targets.length
}

export interface ScoreContext {
  inlineRefAncestors: ReadonlySet<Element>
  listAncestors: ReadonlySet<Element>
}

export const buildScoreContext = (doc: Document): ScoreContext => ({
  inlineRefAncestors: collectAncestors(safeQueryAll(doc, FOOTNOTE_INLINE_REFERENCES)),
  listAncestors: collectAncestors(safeQueryAll(doc, FOOTNOTE_LIST_SELECTORS)),
})

export const scoreElement = (el: Element, ctx?: ScoreContext): number => {
  const text = el.textContent ?? ""
  const words = countWords(text)
  let score = words

  score += el.getElementsByTagName("p").length * 10
  score += countCommas(text)

  const images = el.getElementsByTagName("img").length
  score -= (images / (words || 1)) * 3

  if (ctx ? ctx.inlineRefAncestors.has(el) : el.querySelector(FOOTNOTE_INLINE_REFERENCES)) score += 10
  if (ctx ? ctx.listAncestors.has(el) : el.querySelector(FOOTNOTE_LIST_SELECTORS)) score += 10

  score -= el.getElementsByTagName("table").length * 5

  const linkEls = el.getElementsByTagName("a")
  let linkLen = 0
  for (let i = 0; i < linkEls.length; i++) linkLen += (linkEls[i]!.textContent ?? "").length
  const linkDensity = Math.min(linkLen / (text.length || 1), 0.5)
  score *= 1 - linkDensity

  return score
}

export const findBestElement = (elements: Element[], minScore = 50, ctx?: ScoreContext): Element | null => {
  let best: Element | null = null
  let bestScore = 0

  for (const el of elements) {
    const s = scoreElement(el, ctx)
    if (s > bestScore) {
      bestScore = s
      best = el
    }
  }

  return bestScore > minScore ? best : null
}

const countCommas = (text: string): number => {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 44) count++
  }
  return count
}

const isLikelyContent = (el: Element, lz: LazyText, ctx: BlockContext): boolean => {
  const role = el.getAttribute("role")
  if (role && ["article", "main", "contentinfo"].includes(role)) return true

  const cls = (el.getAttribute("class") ?? "").toLowerCase()
  const id = (el.id ?? "").toLowerCase()
  for (const signal of CONTENT_SIGNALS) {
    if (cls.includes(signal) || id.includes(signal)) return true
  }

  if (ctx.preTableAncestors.has(el)) return true

  const text = lz.text()
  const words = lz.words()

  if (words < 1000) {
    let hasNavHeading = false
    for (const tag of HEADING_TAGS) {
      for (const h of el.getElementsByTagName(tag)) {
        if (NAV_HEADING_RE.test((h.textContent ?? "").toLowerCase().trim())) {
          hasNavHeading = true
          break
        }
      }
      if (hasNavHeading) break
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

const scoreBlock = (el: Element, lz: LazyText, ctx: BlockContext): number => {
  if (ctx.footnoteMatches.has(el) || ctx.footnoteAncestors.has(el) || hasAncestorIn(el, ctx.footnoteMatches)) {
    return 0
  }

  const text = lz.text()
  const words = lz.words()
  if (words < 3) return 0

  const textLen = text.length
  const linkEls = el.getElementsByTagName("a")
  const links = linkEls.length

  let score = countCommas(text)

  const lower = text.toLowerCase()
  if (NAV_HEADING_RE.test(lower)) {
    for (const re of NAV_WORD_RES) {
      if (re.test(lower)) score -= 10
    }
  }

  if (links / (words || 1) > 0.5) score -= 15

  if (links > 1 && words < 80) {
    let linkLen = 0
    for (let i = 0; i < linkEls.length; i++) linkLen += (linkEls[i]!.textContent ?? "").length
    if (textLen > 0 && linkLen / textLen > 0.8) score -= 15
  }

  const lists = el.getElementsByTagName("ul").length + el.getElementsByTagName("ol").length
  if (lists > 0 && links > lists * 3) score -= 10

  if (words < 80) {
    for (let i = 0; i < links; i++) {
      if (SOCIAL_PROFILE.test(linkEls[i]!.getAttribute("href") ?? "")) {
        score -= 15
        break
      }
    }
  }

  if (words < 15 && BYLINE.test(text) && DATE_PATTERN.test(text)) score -= 10
  if (isCardGrid(el, words)) score -= 15

  const cls = (el.getAttribute("class") ?? "").toLowerCase()
  const id = (el.id ?? "").toLowerCase()
  if (cls || id) {
    for (const pat of NON_CONTENT_CLASSES) {
      if (cls.includes(pat) || id.includes(pat)) score -= 8
    }
  }

  return score
}

const isCardGrid = (el: Element, words: number): boolean => {
  if (words < 3 || words >= 500) return false
  const headings = [
    ...el.getElementsByTagName("h2"),
    ...el.getElementsByTagName("h3"),
    ...el.getElementsByTagName("h4"),
  ]
  if (headings.length < 3) return false
  if (el.getElementsByTagName("img").length < 2) return false
  let hw = 0
  for (const h of headings) hw += countWords(h.textContent ?? "")
  return (words - hw) / headings.length < 20
}
