import { FOOTNOTE_LIST_SELECTORS } from "../constants"
import { transferContent, serializeHTML, parseHTML } from "../utils/dom"

export interface FootnoteData {
  content: Element
  originalId: string
  refs: string[]
}

export type FootnoteMap = Record<number, FootnoteData>

export const collectFootnotes = (root: Element): { footnotes: FootnoteMap; generics: Element[]; extras: Element[] } => {
  const footnotes: FootnoteMap = {}
  const generics: Element[] = []
  const extras: Element[] = []
  const processed = new Set<string>()
  let count = 1

  for (const list of root.querySelectorAll(FOOTNOTE_LIST_SELECTORS)) {
    count = collectFromList(list, root, footnotes, processed, extras, count)
  }

  if (count === 1) {
    const generic = collectGeneric(root, footnotes, processed, count)
    if (generic) {
      count = generic.nextCount
      if (generic.container) generics.push(generic.container)
    }
  }

  if (count === 1) {
    count = collectWordFootnotes(root, footnotes, processed, generics, count)
  }

  if (count === 1) {
    collectLooseFootnotes(root, footnotes, processed, generics, count)
  }

  return { footnotes, generics, extras }
}

export const collectSidenotes = (root: Element, doc: Document): FootnoteMap => {
  const footnotes: FootnoteMap = {}
  const containers = root.querySelectorAll("span.footnote-container, span.sidenote-container, span.inline-footnote")

  if (containers.length === 0) {
    for (const sn of root.querySelectorAll("span.sidenote")) sn.remove()
    return footnotes
  }

  let count = 1
  for (const container of containers) {
    const content = container.querySelector("span.footnote, span.sidenote, span.footnoteContent")
    if (!content) continue

    const refId = `fnref:${count}`
    footnotes[count] = {
      content: content.cloneNode(true) as Element,
      originalId: String(count),
      refs: [refId],
    }

    const ref = createRef(doc, String(count), refId)
    container.replaceWith(ref)
    count++
  }

  return footnotes
}

export const collectAsideFootnotes = (root: Element, doc: Document): FootnoteMap => {
  const footnotes: FootnoteMap = {}

  for (const ol of root.querySelectorAll("aside > ol[start]")) {
    const aside = ol.parentElement
    const num = parseInt(ol.getAttribute("start") ?? "", 10)
    if (isNaN(num) || num < 1) continue

    const items = ol.querySelectorAll("li")
    if (items.length === 0) continue

    const contentDiv = doc.createElement("div")
    if (items.length === 1) {
      transferContent(items[0]!.cloneNode(true) as Element, contentDiv)
    } else {
      for (const li of items) {
        const p = doc.createElement("p")
        transferContent(li.cloneNode(true) as Element, p)
        contentDiv.appendChild(p)
      }
    }

    footnotes[num] = { content: contentDiv, originalId: String(num), refs: [] }
    aside?.remove()
  }

  return footnotes
}

export const createRef = (doc: Document, num: string, refId: string): Element => {
  const sup = doc.createElement("sup")
  sup.id = refId
  const link = doc.createElement("a")
  link.setAttribute("href", `#fn:${num}`)
  link.textContent = num
  sup.appendChild(link)
  return sup
}

const collectFromList = (
  list: Element,
  root: Element,
  footnotes: FootnoteMap,
  processed: Set<string>,
  extras: Element[],
  count: number,
): number => {
  if (list.matches("div.footnotes-footer")) {
    for (const div of list.querySelectorAll("div.footnote-footer")) {
      const match = (div.id ?? "").match(/^footnote-(\d+)$/)
      if (!match?.[1] || processed.has(match[1])) continue
      const clone = div.cloneNode(true) as Element
      clone.querySelector("a")?.remove()
      let html = serializeHTML(clone).replace(/^\s*\.\s*/, "")
      const contentDiv = root.ownerDocument.createElement("div")
      contentDiv.appendChild(parseHTML(root.ownerDocument, html.trim()))
      footnotes[count] = { content: contentDiv, originalId: match[1], refs: [] }
      processed.add(match[1])
      count++
    }
    return count
  }

  if (list.matches("div.footnote-definitions")) {
    for (const def of list.querySelectorAll("div.footnote-definition")) {
      const supEl = def.querySelector("sup[id]")
      const body = def.querySelector(".footnote-body")
      if (!supEl || !body) continue
      const id = (supEl.id ?? "").toLowerCase()
      if (!id || processed.has(id)) continue
      footnotes[count] = { content: body.cloneNode(true) as Element, originalId: id, refs: [] }
      processed.add(id)
      count++
    }
    const parent = list.parentElement
    if (parent && parent !== root && parent.classList?.contains("footnotes")) {
      extras.push(parent)
    }
    return count
  }

  if (list.matches('div.footnote[data-component-name="FootnoteToDOM"]')) {
    const anchor = list.querySelector("a.footnote-number")
    const content = list.querySelector(".footnote-content")
    if (anchor && content) {
      const id = (anchor.id ?? "").replace("footnote-", "").toLowerCase()
      if (id && !processed.has(id)) {
        footnotes[count] = { content: content as Element, originalId: id, refs: [] }
        processed.add(id)
        count++
      }
    }
    return count
  }

  for (const li of list.querySelectorAll('li, div[role="listitem"]')) {
    let id = ""
    let content: Element = li

    const citationsDiv = li.querySelector(".citations")
    if (citationsDiv?.id?.toLowerCase().startsWith("r")) {
      id = citationsDiv.id.toLowerCase()
      const citContent = citationsDiv.querySelector(".citation-content")
      if (citContent) content = citContent
    } else {
      const liId = li.id.toLowerCase()
      if (liId.startsWith("bib.bib")) id = liId.replace("bib.bib", "")
      else if (liId.startsWith("fn:")) id = liId.replace("fn:", "")
      else if (liId.startsWith("fn")) id = liId.replace("fn", "")
      else if (li.hasAttribute("data-counter"))
        id = (li.getAttribute("data-counter") ?? "").replace(/\.$/, "").toLowerCase()
      else {
        const match = liId
          .split("/")
          .pop()
          ?.match(/cite_note-(.+)/)
        id = match ? match[1]!.toLowerCase() : liId
      }
    }

    if (id && !processed.has(id)) {
      footnotes[count] = { content, originalId: id, refs: [] }
      processed.add(id)
      count++
    }
  }

  return count
}

const collectGeneric = (
  root: Element,
  footnotes: FootnoteMap,
  processed: Set<string>,
  count: number,
): { nextCount: number; container: Element | null } | null => {
  const candidateRefs = new Map<string, Element[]>()

  for (const a of root.querySelectorAll('a[href*="#"]')) {
    const fragment = (a.getAttribute("href") ?? "").split("#").pop()?.toLowerCase()
    if (!fragment) continue
    const text = a.textContent?.trim() ?? ""
    if (!/^\[?\(?\d{1,4}\)?\]?$/.test(text)) continue
    if (!candidateRefs.has(fragment)) candidateRefs.set(fragment, [])
    candidateRefs.get(fragment)!.push(a)
  }

  if (candidateRefs.size < 2) return null

  const fragmentSet = new Set(candidateRefs.keys())
  let bestContainer: Element | null = null
  let bestMatchCount = 0

  for (const container of root.querySelectorAll("div, section, aside, footer, ol, ul")) {
    if (container === root) continue
    const matches = findMatchingElements(container, fragmentSet)
    if (matches.length >= 2 && matches.length >= bestMatchCount) {
      bestMatchCount = matches.length
      bestContainer = container
    }
  }

  if (!bestContainer) return null

  const ordered = findMatchingElements(bestContainer, fragmentSet)
  const fnFragments = new Set(ordered.map((e) => e.id))
  let extTotal = 0
  let extMatch = 0
  for (const [frag, anchors] of candidateRefs) {
    if (anchors.some((a) => bestContainer!.contains(a))) continue
    extTotal++
    if (fnFragments.has(frag)) extMatch++
  }
  if (extMatch < Math.max(2, Math.ceil(extTotal * 0.75))) return null

  for (const { el, id } of ordered) {
    if (processed.has(id)) continue
    const contentDiv = root.ownerDocument.createElement("div")
    const clone = el.cloneNode(true) as Element

    const idAnchor = clone.querySelector(`a[id="${id}"]`)
    if (idAnchor && (!idAnchor.textContent?.trim() || /^\d+[.)]*\s*$/.test(idAnchor.textContent.trim()))) {
      idAnchor.remove()
    }
    const namedAnchor = clone.querySelector("a[name]")
    if (namedAnchor?.getAttribute("name")?.toLowerCase() === id) namedAnchor.remove()

    const firstText = clone.firstChild
    if (firstText?.nodeType === 3) {
      firstText.textContent = (firstText.textContent ?? "").replace(/^\d+\.\s*/, "").replace(/^\s+/, "")
    }

    if (clone.matches("li")) transferContent(clone, contentDiv)
    else contentDiv.appendChild(clone)

    let sibling = el.nextElementSibling
    while (sibling && !sibling.id) {
      const sibAnchorId = getChildAnchorId(sibling)
      if (sibAnchorId && fragmentSet.has(sibAnchorId)) break
      contentDiv.appendChild(sibling.cloneNode(true))
      sibling = sibling.nextElementSibling
    }

    footnotes[count] = { content: contentDiv, originalId: id, refs: [] }
    processed.add(id)
    count++
  }

  return { nextCount: count, container: bestContainer }
}

const collectWordFootnotes = (
  root: Element,
  footnotes: FootnoteMap,
  processed: Set<string>,
  generics: Element[],
  count: number,
): number => {
  const backrefs = Array.from(root.querySelectorAll('a[href*="#_ftnref"]'))
  if (backrefs.length < 2) return count

  const pairs: Array<{ num: number; anchor: Element }> = []
  for (const anchor of backrefs) {
    const fragment = (anchor.getAttribute("href") ?? "").split("#").pop() ?? ""
    const match = fragment.match(/^_ftnref(\d+)$/)
    if (match?.[1]) pairs.push({ num: parseInt(match[1]), anchor })
  }
  pairs.sort((a, b) => a.num - b.num)

  for (const { num, anchor } of pairs) {
    const originalId = `_ftn${num}`
    if (processed.has(originalId)) continue

    let container: Element | null = anchor.parentElement
    while (container && container !== root) {
      const tag = container.tagName.toLowerCase()
      if (tag === "p" || tag === "div" || tag === "li") break
      container = container.parentElement
    }
    if (!container || container === root) continue

    const clone = container.cloneNode(true) as Element
    const ref = clone.querySelector('a[href*="_ftnref"]')
    if (ref) {
      const sup = ref.closest("sup")
      if (sup) sup.remove()
      else ref.remove()
    }

    const contentDiv = root.ownerDocument.createElement("div")
    contentDiv.appendChild(clone)
    footnotes[num] = { content: contentDiv, originalId, refs: [] }
    processed.add(originalId)
    if (num >= count) count = num + 1
    generics.push(container)
  }

  return count
}

const FOOTNOTE_SECTION_RE = /^(foot\s*notes?|end\s*notes?|notes?|references?)$/i

const collectLooseFootnotes = (
  root: Element,
  footnotes: FootnoteMap,
  processed: Set<string>,
  generics: Element[],
  count: number,
): void => {
  const allPs = Array.from(root.querySelectorAll("p"))
  const container = allPs.length > 0 ? (allPs.at(-1)?.parentElement ?? root) : root
  const children = Array.from(container.children)

  const parseNum = (el: Element): number | null => {
    const first = el.firstElementChild
    if (!first) return null
    const tag = first.tagName.toLowerCase()
    if (tag !== "sup" && tag !== "strong") return null
    const text = first.textContent?.trim() ?? ""
    const n = parseInt(text, 10)
    return !isNaN(n) && n >= 1 && String(n) === text ? n : null
  }

  const crossValidate = (paragraphs: Array<{ num: number; el: Element }>): boolean => {
    const nums = new Set(paragraphs.map((p) => p.num))
    const matched = new Set<number>()
    for (const sup of root.querySelectorAll("sup")) {
      if (paragraphs.some((fn) => fn.el.contains(sup))) continue
      if (sup.querySelector("a")) continue
      const text = sup.textContent?.trim() ?? ""
      const n = parseInt(text, 10)
      if (!isNaN(n) && n >= 1 && String(n) === text && nums.has(n)) matched.add(n)
    }
    return matched.size >= 2
  }

  // Method 1: <hr> boundary
  for (let i = children.length - 1; i >= 0; i--) {
    if (children[i]!.tagName.toLowerCase() !== "hr") continue
    const paragraphs: Array<{ num: number; el: Element }> = []
    for (let j = i + 1; j < children.length; j++) {
      const num = parseNum(children[j]!)
      if (num !== null) paragraphs.push({ num, el: children[j]! })
    }
    if (paragraphs.length >= 2 && crossValidate(paragraphs)) {
      addLoose(root, footnotes, processed, generics, paragraphs, children.slice(i), count)
      return
    }
    break
  }

  // Method 2: backwards scan
  const trailing: Array<{ num: number; el: Element }> = []
  let firstIdx = -1
  for (let i = children.length - 1; i >= 0; i--) {
    const tag = children[i]!.tagName.toLowerCase()
    if (tag === "p") {
      const num = parseNum(children[i]!)
      if (num !== null) {
        trailing.unshift({ num, el: children[i]! })
        firstIdx = i
        continue
      }
      break
    }
    if (tag === "ul" || tag === "ol" || tag === "blockquote") continue
    break
  }

  if (trailing.length >= 2 && crossValidate(trailing)) {
    const toRemove = children.slice(firstIdx)
    const prev = trailing[0]!.el.previousElementSibling
    if (
      prev &&
      /^h[1-6]$/.test(prev.tagName.toLowerCase()) &&
      FOOTNOTE_SECTION_RE.test(prev.textContent?.trim() ?? "")
    ) {
      toRemove.unshift(prev)
    }
    addLoose(root, footnotes, processed, generics, trailing, toRemove, count)
  }
}

const addLoose = (
  root: Element,
  footnotes: FootnoteMap,
  processed: Set<string>,
  generics: Element[],
  paragraphs: Array<{ num: number; el: Element }>,
  toRemove: Element[],
  count: number,
): void => {
  for (let i = 0; i < paragraphs.length; i++) {
    const { num, el } = paragraphs[i]!
    const nextEl = paragraphs[i + 1]?.el ?? null
    const id = String(num)
    if (processed.has(id)) continue

    const contentDiv = root.ownerDocument.createElement("div")
    const clone = el.cloneNode(true) as Element
    clone.firstElementChild?.remove()
    const firstNode = clone.firstChild
    if (firstNode?.nodeType === 3) {
      firstNode.textContent = (firstNode.textContent ?? "").replace(/^\s+/, "")
    }
    contentDiv.appendChild(clone)

    let sibling: Element | null = el.nextElementSibling
    while (sibling && sibling !== nextEl) {
      contentDiv.appendChild(sibling.cloneNode(true))
      sibling = sibling.nextElementSibling
    }

    footnotes[count] = { content: contentDiv, originalId: id, refs: [] }
    processed.add(id)
    count++
  }
  generics.push(...toRemove)
}

const findMatchingElements = (container: Element, fragmentSet: Set<string>): Array<{ el: Element; id: string }> => {
  const results: Array<{ el: Element; id: string }> = []
  const seen = new Set<string>()
  for (const el of container.querySelectorAll("li, p, div")) {
    let id = ""
    if (el.id && fragmentSet.has(el.id.toLowerCase())) {
      id = el.id.toLowerCase()
    } else if (!el.id) {
      const anchorId = getChildAnchorId(el)
      if (anchorId && fragmentSet.has(anchorId)) id = anchorId
    }
    if (id && !seen.has(id)) {
      results.push({ el, id })
      seen.add(id)
    }
  }
  return results
}

const getChildAnchorId = (el: Element): string => {
  const anchor = el.querySelector("a[id], a[name]")
  if (!anchor) return ""
  return (anchor.id || (anchor.getAttribute("name") ?? "")).toLowerCase()
}
