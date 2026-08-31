import {
  EXACT_SELECTORS_JOINED,
  HIDDEN_EXACT_SELECTOR,
  HIDDEN_EXACT_SKIP_SELECTOR,
  PARTIAL_SELECTORS_ANCHORED_REGEX,
  PARTIAL_SELECTORS_REGEX,
  TEST_ATTRIBUTES_SELECTOR,
  FOOTNOTE_LIST_SELECTORS,
} from "../constants"
import { closestByTag, collectAncestors, hasAncestorIn, safeQueryAll } from "../utils/dom"

export { filterContentPatterns } from "./content-patterns"

const PRE_CODE = new Set(["pre", "code"])
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])

export const filterBySelectors = (
  root: Document | Element,
  mainContent?: Element | null,
  skipHiddenExact: boolean = false,
): number => {
  let count = 0
  count += filterExactSelectors(root, mainContent, skipHiddenExact)
  count += filterPartialSelectors(root, mainContent)
  count += filterMetadataBlocks(mainContent)
  return count
}

const filterExactSelectors = (
  root: Document | Element,
  mainContent?: Element | null,
  skipHiddenExact: boolean = false,
): number => {
  let count = 0
  const hiddenExact = skipHiddenExact ? new Set(safeQueryAll(root, HIDDEN_EXACT_SELECTOR)) : null
  const hiddenSkip = skipHiddenExact ? new Set(safeQueryAll(root, HIDDEN_EXACT_SKIP_SELECTOR)) : null

  for (const el of root.querySelectorAll(EXACT_SELECTORS_JOINED)) {
    if (!el.parentNode) continue
    if (closestByTag(el, PRE_CODE)) continue
    if (mainContent && el.contains(mainContent)) continue

    if (hiddenExact && hiddenSkip) {
      const role = (el.getAttribute("role") ?? "").toLowerCase()
      if (hiddenExact.has(el) || ((hiddenSkip.has(el) || hasAncestorIn(el, hiddenSkip)) && role === "dialog")) {
        continue
      }
    }

    el.remove()
    count++
  }
  return count
}

const filterPartialSelectors = (root: Document | Element, mainContent?: Element | null): number => {
  let count = 0
  let footnotes: FootnoteSets | null = null

  for (const el of root.querySelectorAll(TEST_ATTRIBUTES_SELECTOR)) {
    if (closestByTag(el, PRE_CODE)) continue
    if (mainContent && el.contains(mainContent)) continue

    if (matchesPartialSelectors(el)) {
      footnotes ??= buildFootnoteSets(root)
      if (isProtectedElement(el, footnotes)) continue
      el.remove()
      count++
    }
  }
  return count
}

// Headings match on class only, and a delimiter-less id must equal a whole
// pattern: an id like `theroleofthings` contains `herol` but is not a hero.
const matchesPartialSelectors = (el: Element): boolean => {
  const isHeading = HEADING_TAGS.has(el.localName)
  const attrs = buildAttributeString(el, isHeading)
  if (attrs && PARTIAL_SELECTORS_REGEX.test(attrs)) return true
  if (isHeading) return false

  const id = (el.id ?? "").toLowerCase().trim()
  if (!id) return false
  return /[-_\s]/.test(id) ? PARTIAL_SELECTORS_REGEX.test(id) : PARTIAL_SELECTORS_ANCHORED_REGEX.test(id)
}

const buildAttributeString = (el: Element, classOnly: boolean): string => {
  const cls = el.getAttribute("class") ?? ""
  if (classOnly) return cls.toLowerCase().trim()
  return (
    cls +
    " " +
    (el.getAttribute("data-component") ?? "") +
    " " +
    (el.getAttribute("data-test") ?? "") +
    " " +
    (el.getAttribute("data-testid") ?? "") +
    " " +
    (el.getAttribute("data-test-id") ?? "") +
    " " +
    (el.getAttribute("data-qa") ?? "") +
    " " +
    (el.getAttribute("data-cy") ?? "")
  )
    .toLowerCase()
    .trim()
}

interface FootnoteSets {
  matches: Set<Element>
  ancestors: Set<Element>
}

const buildFootnoteSets = (root: Document | Element): FootnoteSets => {
  const matches = new Set(safeQueryAll(root, FOOTNOTE_LIST_SELECTORS))
  return { matches, ancestors: collectAncestors(matches) }
}

const isProtectedElement = (el: Element, footnotes: FootnoteSets): boolean => {
  if (el.tagName === "A" && closestByTag(el, HEADING_TAGS)) return true
  if (footnotes.matches.has(el) || footnotes.ancestors.has(el)) return true
  const parent = el.parentElement
  return parent !== null && footnotes.matches.has(parent)
}

const DATE_RE =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}[\s,]+\d{4}\b/i

const filterMetadataBlocks = (mainContent?: Element | null): number => {
  if (!mainContent) return 0
  const h1 = mainContent.querySelector("h1")
  if (!h1) return 0

  let sibling = h1.nextElementSibling
  for (let i = 0; i < 3 && sibling; i++) {
    const next = sibling.nextElementSibling
    const text = sibling.textContent?.trim() ?? ""
    if (text.length > 0 && text.length < 300 && containsDate(sibling, text)) {
      sibling.remove()
      return 1
    }
    sibling = next
  }
  return 0
}

const containsDate = (el: Element, text: string): boolean => {
  if (DATE_RE.test(text)) return true
  for (const child of el.querySelectorAll("p, time")) {
    if (DATE_RE.test(child.textContent?.trim() ?? "")) return true
  }
  return false
}
