const MIN_DIMENSION = 33

export const filterSmallImages = (doc: Document): number => {
  const small = collectSmallIdentifiers(doc)
  return removeMatchingElements(doc, small)
}

const collectSmallIdentifiers = (doc: Document): Set<string> => {
  const ids = new Set<string>()

  for (const el of doc.querySelectorAll("img, svg")) {
    const w = parseDimension(el, "width")
    const h = parseDimension(el, "height")

    if (w > 0 && h > 0 && (w < MIN_DIMENSION || h < MIN_DIMENSION)) {
      const id = elementIdentifier(el)
      if (id) ids.add(id)
    }
  }

  return ids
}

const removeMatchingElements = (doc: Document, small: Set<string>): number => {
  let count = 0

  for (const tag of ["img", "svg"] as const) {
    for (const el of Array.from(doc.getElementsByTagName(tag))) {
      if (tag === "img" && !hasImageSource(el)) {
        el.remove()
        count++
        continue
      }
      const id = elementIdentifier(el)
      if (id && small.has(id)) {
        el.remove()
        count++
      }
    }
  }

  return count
}

const parseDimension = (el: Element, attr: "width" | "height"): number => {
  const fromAttr = parseInt(el.getAttribute(attr) ?? "0", 10)
  if (fromAttr > 0) return fromAttr

  const style = el.getAttribute("style") ?? ""
  const pattern = attr === "width" ? /width\s*:\s*(\d+)/ : /height\s*:\s*(\d+)/
  const match = style.match(pattern)
  return match ? parseInt(match[1]!, 10) : 0
}

const hasImageSource = (el: Element): boolean =>
  !!(
    el.getAttribute("src") ??
    el.getAttribute("srcset") ??
    el.getAttribute("data-src") ??
    el.getAttribute("data-srcset") ??
    el.getAttribute("data-lazy-src")
  )

const elementIdentifier = (el: Element): string | null => {
  const tag = el.tagName.toLowerCase()

  if (tag === "img") {
    const src = el.getAttribute("data-src") ?? el.getAttribute("src")
    if (src) return `src:${src}`
    const srcset = el.getAttribute("srcset") ?? el.getAttribute("data-srcset")
    if (srcset) return `srcset:${srcset}`
  }

  if (tag === "svg") {
    const viewBox = el.getAttribute("viewBox")
    if (viewBox) return `viewBox:${viewBox}`
  }

  if (el.id) return `id:${el.id}`

  const cls = el.getAttribute("class")
  if (cls) return `class:${cls}`

  return null
}
