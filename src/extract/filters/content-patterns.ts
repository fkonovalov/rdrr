import { countWords } from "@shared"
import { CONTENT_ELEMENT_SELECTOR } from "../constants"

const CONTENT_DATE_PATTERN = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/i
const CONTENT_READ_TIME_PATTERN = /\d+\s*min(?:ute)?s?\s+read\b/i
const BYLINE_UPPERCASE_PATTERN = /^\p{Lu}/u
const STARTS_WITH_BY_PATTERN = /^by\s+\S/i

const BOILERPLATE_PATTERNS = [
  /^This (?:article|story|piece) (?:appeared|was published|originally appeared) in\b/i,
  /^A version of this (?:article|story) (?:appeared|was published) in\b/i,
  /^Originally (?:published|appeared) (?:in|on|at)\b/i,
  /^Any re-?use permitted\b/i,
  /^©\s*(?:Copyright\s+)?\d{4}/i,
  /^Comments?$/i,
  /^Leave a (?:comment|reply)$/i,
]

const NEWSLETTER_PATTERN =
  /\bsubscribe\b[\s\S]{0,40}\bnewsletter\b|\bnewsletter\b[\s\S]{0,40}\bsubscribe\b|\bsign[- ]up\b[\s\S]{0,80}\b(?:newsletter|email alert)/i

const RELATED_HEADING_PATTERN =
  /^(?:related (?:posts?|articles?|content|stories|reads?|reading)|you (?:might|may|could) (?:also )?(?:like|enjoy|be interested in)|read (?:next|more|also)|further reading|see also|more (?:from|articles?|posts?|like this)|more to (?:read|explore)|about (?:the )?author)$/i

const METADATA_STRIP_BASE = [
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gi,
  /\b\d+(?:st|nd|rd|th)?\b/g,
]

const READ_TIME_STRIP_PATTERNS = [...METADATA_STRIP_BASE, /\bmin(?:ute)?s?\b/gi, /\bread\b/gi, /[/|·•—–\-,.\s]+/g]

const BYLINE_STRIP_PATTERNS = [...METADATA_STRIP_BASE, /\bby\b/gi, /[/|·•—–\-,]+/g]

const isNewsletterElement = (el: Element, maxWords: number): boolean => {
  const text = el.textContent?.trim() ?? ""
  const words = countWords(text)
  if (words < 2 || words > maxWords) return false
  if (el.querySelector(CONTENT_ELEMENT_SELECTOR)) return false
  const normalized = text.replace(/([a-z])([A-Z])/g, "$1 $2")
  return NEWSLETTER_PATTERN.test(normalized)
}

const walkUpToWrapper = (el: Element, text: string, mainContent: Element): Element => {
  let target = el
  while (target.parentElement && target.parentElement !== mainContent) {
    if ((target.parentElement.textContent?.trim() ?? "") !== text) break
    target = target.parentElement
  }
  return target
}

const removeTrailingSiblings = (element: Element, removeSelf: boolean): void => {
  let sibling = element.nextElementSibling
  while (sibling) {
    const next = sibling.nextElementSibling
    sibling.remove()
    sibling = next
  }
  if (removeSelf) {
    element.remove()
  }
}

// Walk up from `el` toward `mainContent` as long as each level has no preceding
// siblings with meaningful content (≤ 10 words total). Returns the highest such ancestor.
const walkUpIsolated = (el: Element, mainContent: Element): Element => {
  let target = el
  while (target.parentElement && target.parentElement !== mainContent) {
    let precedingWords = 0
    let sib = target.previousElementSibling
    while (sib) {
      precedingWords += countWords(sib.textContent ?? "")
      if (precedingWords > 10) break
      sib = sib.previousElementSibling
    }
    if (precedingWords > 10) break
    target = target.parentElement
  }
  return target
}

// If the element immediately preceding `target` is a thin section (< 50 words, no content
// elements), remove it. These are typically CTA or promo blocks before related-posts sections.
const removeThinPrecedingSection = (target: Element): void => {
  const prevSib = target.previousElementSibling
  if (!prevSib) return
  if (countWords(prevSib.textContent ?? "") >= 50) return
  if (prevSib.querySelector(CONTENT_ELEMENT_SELECTOR)) return
  prevSib.remove()
}

// Detect and remove "hero header" blocks near the top of content.
// Containers wrapping heading + <time> + author info + hero image.
const removeHeroHeader = (mainContent: Element): void => {
  const timeElements = mainContent.querySelectorAll("time")
  if (timeElements.length === 0) return

  const contentText = mainContent.textContent ?? ""

  for (const time of timeElements) {
    const timeText = time.textContent?.trim() ?? ""
    const pos = contentText.indexOf(timeText)
    if (pos > 300) continue

    let bestBlock: Element | null = null
    let current: Element | null = time.parentElement

    while (current && current !== mainContent) {
      const hasHeadingAndTime = current.querySelector("h1, h2") && current.querySelector("time")
      if (hasHeadingAndTime) {
        const blockText = current.textContent?.trim() ?? ""
        const totalWords = countWords(blockText)

        const metadataEls = new Set<Element>()
        for (const el of current.querySelectorAll("h1, h2, h3, time, [aria-label]")) {
          let dominated = false
          for (const existing of metadataEls) {
            if (existing.contains(el)) {
              dominated = true
              break
            }
          }
          if (!dominated) metadataEls.add(el)
        }
        let metadataWords = 0
        for (const el of metadataEls) {
          metadataWords += countWords(el.textContent ?? "")
        }
        const proseWords = totalWords - metadataWords

        if (proseWords < 30) {
          bestBlock = current
        } else {
          break
        }
      }
      current = current.parentElement
    }

    if (bestBlock) {
      bestBlock.remove()
      return
    }
  }
}

// Detect breadcrumb lists (Home › Posts › Title) at start of content.
const isBreadcrumbList = (list: Element): boolean => {
  const listItems = list.querySelectorAll("li")
  if (listItems.length < 2 || listItems.length > 8) return false

  const listLinks = Array.from(list.querySelectorAll("a"))
  if (listLinks.length < 1 || listLinks.length >= listItems.length) return false
  if (list.querySelector("img, p, figure, blockquote")) return false

  let allInternal = true
  let hasBreadcrumbLink = false
  let shortLinkTexts = true
  for (const a of listLinks) {
    const href = a.getAttribute("href") ?? ""
    if (href.startsWith("http") || href.startsWith("//")) {
      allInternal = false
      break
    }
    if (href === "/" || /^\/[a-zA-Z0-9_-]+\/?$/.test(href)) hasBreadcrumbLink = true
    if ((a.textContent ?? "").trim().split(/\s+/).filter(Boolean).length > 5) shortLinkTexts = false
  }
  return allInternal && hasBreadcrumbLink && shortLinkTexts
}

export const filterContentPatterns = (mainContent: Element, url: string): number => {
  let count = 0

  // Remove breadcrumb navigation lists
  const firstList = mainContent.querySelector("ul, ol")
  if (firstList && isBreadcrumbList(firstList)) {
    let target: Element = firstList
    while (target.parentElement && target.parentElement !== mainContent && target.parentElement.children.length === 1) {
      target = target.parentElement
    }
    target.remove()
    count++
  }

  // Remove promotional block <a> elements before the first heading
  const firstH1 = mainContent.querySelector("h1")
  if (firstH1) {
    for (const link of mainContent.querySelectorAll("a[href]")) {
      if (!link.parentNode) continue
      if (!(link.compareDocumentPosition(firstH1) & 4)) continue
      if (!link.querySelector("div")) continue
      const text = link.textContent?.trim() ?? ""
      if (countWords(text) > 25) continue
      if (/[.!?]\s/.test(text)) continue
      link.remove()
      count++
    }
  }

  // Remove hero header blocks
  removeHeroHeader(mainContent)

  const contentText = mainContent.textContent ?? ""
  const candidates = Array.from(mainContent.querySelectorAll("p, span, div, time"))

  // Single pass over candidates for all metadata-removal checks
  let bylineFound = false
  let authorDateFound = false

  for (const el of candidates) {
    if (!el.parentNode) continue

    const text = el.textContent?.trim() ?? ""
    const words = countWords(text)

    if (words > 15 || words === 0) continue
    if (el.closest("pre, code")) continue

    const tag = el.tagName
    const hasDate = CONTENT_DATE_PATTERN.test(text)
    let pos = -2
    const getPos = () => {
      if (pos === -2) pos = contentText.indexOf(text)
      return pos
    }

    // Remove article metadata header blocks (DIV only) near the top
    if (tag === "DIV" && words >= 1 && words <= 10 && hasDate && !/[.!?]/.test(text) && getPos() <= 400) {
      if (
        !Array.from(el.querySelectorAll("p, h1, h2, h3, h4, h5, h6")).some((b) => countWords(b.textContent ?? "") > 8)
      ) {
        el.remove()
        count++
        continue
      }
    }

    // Remove standalone "By [Name]" author bylines near the start
    if (!bylineFound && STARTS_WITH_BY_PATTERN.test(text) && words >= 2 && !/[.!?]$/.test(text) && getPos() <= 600) {
      const target = walkUpToWrapper(el, text, mainContent)
      target.remove()
      bylineFound = true
      count++
      continue
    }

    // Remove read time metadata (e.g. "Mar 4th 2026 | 3 min read")
    if (
      hasDate &&
      CONTENT_READ_TIME_PATTERN.test(text) &&
      el.querySelectorAll("p, div, section, article").length === 0
    ) {
      let cleaned = text
      for (const pattern of READ_TIME_STRIP_PATTERNS) {
        cleaned = cleaned.replace(pattern, "")
      }
      if (cleaned.trim().length === 0) {
        el.remove()
        count++
        continue
      }
    }

    // Remove author + date bylines (name + date, any order) near the start
    if (!authorDateFound && words >= 2 && words <= 10 && hasDate && getPos() <= 500) {
      let residual = text
      for (const pattern of BYLINE_STRIP_PATTERNS) {
        residual = residual.replace(pattern, "")
      }
      residual = residual.trim()
      if (residual) {
        const nameWords = residual.split(/\s+/).filter((w) => w.length > 0)
        if (
          nameWords.length >= 1 &&
          nameWords.length <= 4 &&
          nameWords.every((w) => BYLINE_UPPERCASE_PATTERN.test(w))
        ) {
          const target = walkUpToWrapper(el, text, mainContent)
          target.remove()
          authorDateFound = true
          count++
          continue
        }
      }
    }
  }

  // Remove standalone time/date elements near the start or end of content
  const timeElements = Array.from(mainContent.querySelectorAll("time"))
  for (const time of timeElements) {
    if (!time.parentNode) continue
    let target: Element = time
    let targetText = target.textContent?.trim() ?? ""
    while (target.parentElement && target.parentElement !== mainContent) {
      const parentTag = target.parentElement.tagName.toLowerCase()
      const parentText = target.parentElement.textContent?.trim() ?? ""
      if (parentTag === "p" && parentText === targetText) {
        target = target.parentElement
        break
      }
      if (["i", "em", "span", "b", "strong", "small"].includes(parentTag) && parentText === targetText) {
        target = target.parentElement
        targetText = parentText
        continue
      }
      break
    }
    const text = target.textContent?.trim() ?? ""
    const words = countWords(text)
    if (words > 10) continue
    const tPos = contentText.indexOf(text)
    const distFromEnd = contentText.length - (tPos + text.length)
    if (tPos > 200 && distFromEnd > 200) continue
    target.remove()
    count++
  }

  // Remove blog post metadata lists near content boundaries
  const metadataLists = mainContent.querySelectorAll("ul, ol, dl")
  for (const list of metadataLists) {
    if (!list.parentNode) continue
    const isDl = list.tagName === "DL"
    const items = Array.from(list.children).filter((el) => (isDl ? el.tagName === "DD" : el.tagName === "LI"))
    const minItems = isDl ? 1 : 2
    if (items.length < minItems || items.length > 8) continue

    const listText = list.textContent?.trim() ?? ""
    const listPos = contentText.indexOf(listText)
    const distFromEnd = contentText.length - (listPos + listText.length)
    if (listPos > 500 && distFromEnd > 500) continue

    const prevSibling = list.previousElementSibling
    if (prevSibling) {
      const prevText = prevSibling.textContent?.trim() ?? ""
      if (prevText.endsWith(":")) continue
    }

    let isMetadata = true
    for (const item of items) {
      const text = item.textContent?.trim() ?? ""
      const words = countWords(text)
      if (words > 8) {
        isMetadata = false
        break
      }
      if (/[.!?]$/.test(text)) {
        isMetadata = false
        break
      }
    }
    if (!isMetadata) continue

    if (countWords(listText) > 30) continue

    const target = walkUpToWrapper(list, listText, mainContent)
    target.remove()
    count++
  }

  // Remove section breadcrumbs and back-navigation links
  let urlPath = ""
  let pageHost = ""
  try {
    const parsedUrl = new URL(url)
    urlPath = parsedUrl.pathname
    pageHost = parsedUrl.hostname.replace(/^www\./, "")
  } catch {}

  if (urlPath) {
    const shortElements = mainContent.querySelectorAll("div, span, p, a[href]")
    const firstHeading = mainContent.querySelector("h1, h2, h3")
    for (const el of shortElements) {
      if (!el.parentNode) continue
      const text = el.textContent?.trim() ?? ""
      const words = countWords(text)
      if (words > 10) continue
      if (el.querySelectorAll("p, div, section, article").length > 0) continue
      if (el.matches("a[href]") && el.parentElement && el.parentElement !== mainContent) {
        if ((el.parentElement.textContent?.trim() ?? "") !== text) {
          if (!firstHeading) continue
          if (!(el.compareDocumentPosition(firstHeading) & 4)) continue
        }
      }
      const link: Element | null = el.matches("a[href]") ? el : el.querySelector("a[href]")
      if (!link) continue
      try {
        const linkPath = new URL(link.getAttribute("href") ?? "", url).pathname
        const linkDir = linkPath.replace(/\/[^/]*$/, "/")
        const isParentIndex =
          /^index\.(html?|php)$/i.test(linkPath.split("/").pop() ?? "") && urlPath.startsWith(linkDir)
        if (linkPath !== "/" && linkPath !== urlPath && (urlPath.startsWith(linkPath) || isParentIndex)) {
          el.remove()
          count++
        }
      } catch {}
    }
  }

  // Remove trailing external link lists
  if (pageHost) {
    const headings = mainContent.querySelectorAll("h2, h3, h4, h5, h6")
    for (const heading of headings) {
      if (!heading.parentNode) continue
      const list = heading.nextElementSibling
      if (!list || (list.tagName !== "UL" && list.tagName !== "OL")) continue
      const items = Array.from(list.children).filter((el) => el.tagName === "LI")
      if (items.length < 2) continue

      let trailingContent = false
      let checkEl: Element | null = list
      while (checkEl && checkEl !== mainContent) {
        let sibling = checkEl.nextElementSibling
        while (sibling) {
          if ((sibling.textContent?.trim() ?? "").length > 0) {
            trailingContent = true
            break
          }
          sibling = sibling.nextElementSibling
        }
        if (trailingContent) break
        checkEl = checkEl.parentElement
      }
      if (trailingContent) continue

      let allExternalLinks = true
      for (const item of items) {
        const links = item.querySelectorAll("a[href]")
        if (links.length === 0) {
          allExternalLinks = false
          break
        }
        const itemText = item.textContent?.trim() ?? ""
        let linkTextLen = 0
        for (const link of links) {
          linkTextLen += (link.textContent?.trim() ?? "").length
          try {
            const linkHost = new URL(link.getAttribute("href") ?? "", url).hostname.replace(/^www\./, "")
            if (linkHost === pageHost) {
              allExternalLinks = false
              break
            }
          } catch {}
        }
        if (!allExternalLinks) break
        if (linkTextLen < itemText.length * 0.6) {
          allExternalLinks = false
          break
        }
      }
      if (!allExternalLinks) continue

      list.remove()
      heading.remove()
      count += 2
    }
  }

  // Remove trailing related posts blocks
  let lastChild = mainContent.lastElementChild
  while (lastChild && ["HR", "BR"].includes(lastChild.tagName)) {
    lastChild = lastChild.previousElementSibling
  }
  if (lastChild && ["SECTION", "DIV", "ASIDE"].includes(lastChild.tagName)) {
    const paras: Element[] = []
    let hasNonPara = false
    for (const child of lastChild.children) {
      const text = child.textContent?.trim() ?? ""
      if (!text) continue
      if (child.tagName === "P") paras.push(child)
      else if (child.tagName !== "BR") {
        hasNonPara = true
        break
      }
    }
    if (paras.length >= 2 && !hasNonPara) {
      const allLinkDense = paras.every((p) => {
        const text = (p.textContent?.trim() ?? "").replace(/\s+/g, " ")
        const links = p.querySelectorAll("a[href]")
        if (links.length === 0) return false
        let linkTextLen = 0
        for (const link of links) linkTextLen += (link.textContent?.trim() ?? "").length
        if (linkTextLen / (text.length || 1) <= 0.6) return false
        let nonLinkText = text
        for (const link of links) nonLinkText = nonLinkText.split(link.textContent?.trim() ?? "").join("")
        return !/[.!?]/.test(nonLinkText)
      })
      if (allLinkDense) {
        lastChild.remove()
        count++
      }
    }
  }

  // Remove trailing thin sections
  const totalWords = countWords(mainContent.textContent ?? "")
  if (totalWords > 300) {
    const trailingEls: Element[] = []
    let trailingWords = 0
    let child = mainContent.lastElementChild
    while (child) {
      // An <hr> is a content boundary — include it and stop walking
      if (child.tagName === "HR") {
        trailingEls.push(child)
        break
      }
      let svgWords = 0
      for (const svg of child.querySelectorAll("svg")) {
        svgWords += countWords(svg.textContent ?? "")
      }
      const words = countWords(child.textContent?.trim() ?? "") - svgWords
      if (words > 25) break
      trailingWords += words
      trailingEls.push(child)
      child = child.previousElementSibling
    }
    if (trailingEls.length >= 1 && trailingWords < totalWords * 0.15) {
      const hasHeading = trailingEls.some(
        (el) => /^H[1-6]$/.test(el.tagName) || el.querySelector("h1, h2, h3, h4, h5, h6"),
      )
      const hasContent = trailingEls.some((el) => el.querySelector(CONTENT_ELEMENT_SELECTOR))
      // Multiple prose paragraphs indicate a conclusion, not a CTA/promo block
      let proseParagraphs = 0
      for (const el of trailingEls) {
        if (el.tagName === "P" && countWords(el.textContent ?? "") > 5) proseParagraphs++
      }
      // Also skip if trailing elements contain external links (contributor/reference sections)
      const hasExternalLinks = trailingEls.some((el) =>
        Array.from(el.querySelectorAll("a[href]")).some((a) => {
          const href = a.getAttribute("href") ?? ""
          return href.startsWith("http") && !href.includes("#")
        }),
      )
      if (hasHeading && !hasContent && !hasExternalLinks && proseParagraphs < 2) {
        for (const el of trailingEls) {
          el.remove()
          count++
        }
      }
    }
  }

  // Remove boilerplate sentences and trailing non-content
  const fullText = mainContent.textContent ?? ""
  const boilerplateElements = mainContent.querySelectorAll("p, div, span, section")
  for (const el of boilerplateElements) {
    if (!el.parentNode) continue
    const text = el.textContent?.trim() ?? ""
    const words = countWords(text)
    if (words > 50 || words < 1) continue

    for (const pattern of BOILERPLATE_PATTERNS) {
      if (pattern.test(text)) {
        let target: Element = el
        while (target.parentElement && target.parentElement !== mainContent) {
          if (target.nextElementSibling) break
          target = target.parentElement
        }

        const targetText = target.textContent ?? ""
        const targetPos = fullText.indexOf(targetText)
        if (targetPos < 200) {
          if (target !== el && !el.nextElementSibling) {
            el.remove()
            count++
          }
          continue
        }

        const ancestors: Element[] = []
        let anc = target.parentElement
        while (anc && anc !== mainContent) {
          ancestors.push(anc)
          anc = anc.parentElement
        }

        removeTrailingSiblings(target, true)
        for (const ancestor of ancestors) {
          removeTrailingSiblings(ancestor, false)
        }
        count++
        return count
      }
    }
  }

  // Remove "Related posts" / "Read next" / "About the Author" sections
  for (const heading of mainContent.querySelectorAll("h2, h3, h4, h5, h6")) {
    if (!heading.parentNode) continue
    const headingText = heading.textContent?.trim() ?? ""
    if (!RELATED_HEADING_PATTERN.test(headingText)) continue

    if (contentText.indexOf(headingText) < 500) continue

    const target = walkUpIsolated(heading, mainContent)
    if (target === heading) continue

    removeThinPrecedingSection(target)
    removeTrailingSiblings(target, true)
    count++
    break
  }

  // Remove related post card grids without heading
  for (const el of mainContent.querySelectorAll("div")) {
    if (!el.parentNode) continue
    if (el.children.length < 2) continue
    const children = Array.from(el.children)

    const cardCount = children.filter((c) => c.querySelector("img, picture") && c.querySelector("h2, h3, h4")).length
    if (cardCount < 2 || cardCount < children.length * 0.7) continue

    const firstText = children[0]?.textContent?.trim().substring(0, 30) ?? ""
    if (firstText.length < 5 || contentText.indexOf(firstText) < 500) continue

    const target = walkUpIsolated(el, mainContent)
    if (target === el) continue

    removeThinPrecedingSection(target)
    removeTrailingSiblings(target, true)
    count++
    break
  }

  // Remove newsletter signup sections
  for (const el of mainContent.querySelectorAll("div, section, aside")) {
    if (!el.parentNode) continue
    if (el.closest("pre, code")) continue
    if (!isNewsletterElement(el, 60)) continue

    const elWords = countWords(el.textContent?.trim() ?? "")
    let target: Element = el
    while (target.parentElement && target.parentElement !== mainContent) {
      const parentWords = countWords(target.parentElement.textContent?.trim() ?? "")
      if (parentWords > elWords * 2 + 15) break
      target = target.parentElement
    }

    target.remove()
    count++
    break
  }

  // Remove newsletter signup lists
  for (const el of mainContent.querySelectorAll("ul")) {
    if (!el.parentNode) continue
    if (!isNewsletterElement(el, 30)) continue

    el.remove()
    count++
    break
  }

  return count
}
