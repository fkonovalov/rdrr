import {
  EXACT_SELECTORS_JOINED,
  HIDDEN_EXACT_SELECTOR,
  HIDDEN_EXACT_SKIP_SELECTOR,
  PARTIAL_SELECTORS_REGEX,
  TEST_ATTRIBUTES_SELECTOR,
  FOOTNOTE_LIST_SELECTORS,
} from "../constants"

export { filterContentPatterns } from "./content-patterns"

export const filterBySelectors = (
  doc: Document,
  mainContent?: Element | null,
  skipHiddenExact: boolean = false,
): number => {
  let count = 0
  count += filterExactSelectors(doc, mainContent, skipHiddenExact)
  count += filterPartialSelectors(doc, mainContent)
  count += filterMetadataBlocks(mainContent)
  return count
}

const filterExactSelectors = (
  doc: Document,
  mainContent?: Element | null,
  skipHiddenExact: boolean = false,
): number => {
  let count = 0
  for (const el of doc.querySelectorAll(EXACT_SELECTORS_JOINED)) {
    if (!el.parentNode) continue
    if (el.closest("pre, code")) continue
    if (mainContent && el.contains(mainContent)) continue

    // When retrying with hidden content visible, skip hidden-attribute selectors
    if (skipHiddenExact) {
      const role = (el.getAttribute("role") ?? "").toLowerCase()
      if (el.matches(HIDDEN_EXACT_SELECTOR) || (el.closest(HIDDEN_EXACT_SKIP_SELECTOR) && role === "dialog")) {
        continue
      }
    }

    el.remove()
    count++
  }
  return count
}

const filterPartialSelectors = (doc: Document, mainContent?: Element | null): number => {
  let count = 0
  for (const el of doc.querySelectorAll(TEST_ATTRIBUTES_SELECTOR)) {
    if (el.tagName === "CODE" || el.tagName === "PRE" || el.closest("code, pre")) continue
    if (mainContent && el.contains(mainContent)) continue

    const attrs = buildAttributeString(el)
    if (!attrs) continue

    if (PARTIAL_SELECTORS_REGEX.test(attrs)) {
      if (isProtectedElement(el)) continue
      el.remove()
      count++
    }
  }
  return count
}

const buildAttributeString = (el: Element): string =>
  (
    (el.getAttribute("class") ?? "") +
    " " +
    (el.id ?? "") +
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

const isProtectedElement = (el: Element): boolean => {
  if (el.tagName === "A" && el.closest("h1, h2, h3, h4, h5, h6")) return true
  try {
    if (el.matches(FOOTNOTE_LIST_SELECTORS) || el.querySelector(FOOTNOTE_LIST_SELECTORS)) return true
    const parent = el.parentElement
    if (parent?.matches(FOOTNOTE_LIST_SELECTORS)) return true
  } catch {}
  return false
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
