import { BLOCK_LEVEL_ELEMENTS } from "../constants"
import { isElement, isTextNode, transferContent, parseHTML, serializeHTML } from "../utils/dom"

const B64_DATA_URL = /^data:image\/([^;]+);base64,/
const SRCSET_ENTRY = /(.+?)\s+(\d+(?:\.\d+)?[wx])/g
const IMAGE_URL = /\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i
const WIDTH_IN_SRCSET = /\s(\d+)w/
const DPR_IN_URL = /dpr=(\d+(?:\.\d+)?)/
const FILENAME = /^[\w\-./\\]+\.(jpg|jpeg|png|gif|webp|svg)$/i
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const SRCSET_PATTERN = /\.(jpg|jpeg|png|webp)\s+\d/
const SRC_PATTERN = /^\s*\S+\.(jpg|jpeg|png|webp)\S*\s*$/

export const imageRules = [
  {
    selector: "picture",
    element: "picture" as const,
    transform: (el: Element, doc: Document): Element => {
      const sources = el.querySelectorAll("source")
      const img = el.querySelector("img")

      if (!img) {
        const best = selectBestSource(sources)
        const srcset = best?.getAttribute("srcset")
        if (srcset) {
          const newImg = doc.createElement("img")
          applySrcset(srcset, newImg)
          el.replaceChildren(newImg)
        }
        return el
      }

      let bestSrcset: string | null = null
      let bestSrc: string | null = null

      if (sources.length > 0) {
        const best = selectBestSource(sources)
        if (best) {
          bestSrcset = best.getAttribute("srcset")
          if (bestSrcset) bestSrc = extractFirstSrcsetUrl(bestSrcset)
        }
      }

      if (bestSrcset) img.setAttribute("srcset", bestSrcset)

      if (bestSrc && isValidImageUrl(bestSrc)) {
        img.setAttribute("src", bestSrc)
      } else if (!img.hasAttribute("src") || !isValidImageUrl(img.getAttribute("src") ?? "")) {
        const firstUrl = extractFirstSrcsetUrl(img.getAttribute("srcset") ?? bestSrcset ?? "")
        if (firstUrl && isValidImageUrl(firstUrl)) img.setAttribute("src", firstUrl)
      }

      for (const s of sources) s.remove()
      return el
    },
  },
  {
    selector: "uni-image-full-width",
    element: "figure" as const,
    transform: (el: Element, doc: Document): Element => {
      const figure = doc.createElement("figure")
      const img = doc.createElement("img")

      const originalImg = el.querySelector("img")
      if (!originalImg) return figure

      let bestSrc = originalImg.getAttribute("src")
      const dataLoadingAttr = originalImg.getAttribute("data-loading")
      if (dataLoadingAttr) {
        try {
          const dataLoading = JSON.parse(dataLoadingAttr) as Record<string, unknown>
          if (typeof dataLoading.desktop === "string" && isValidImageUrl(dataLoading.desktop)) {
            bestSrc = dataLoading.desktop
          }
        } catch {}
      }
      if (bestSrc && isValidImageUrl(bestSrc)) {
        img.setAttribute("src", bestSrc)
      } else {
        return figure
      }

      const altText = originalImg.getAttribute("alt") ?? el.getAttribute("alt-text")
      if (altText) img.setAttribute("alt", altText)

      figure.appendChild(img)

      const figcaptionEl = el.querySelector("figcaption")
      if (figcaptionEl) {
        const captionText = figcaptionEl.textContent?.trim()
        if (captionText && captionText.length > 5) {
          const figcaption = doc.createElement("figcaption")
          const richTextP = figcaptionEl.querySelector(".rich-text p")
          if (richTextP) {
            transferContent(richTextP, figcaption)
          } else {
            figcaption.textContent = captionText
          }
          figure.appendChild(figcaption)
        }
      }

      return figure
    },
  },
  {
    selector: 'img[data-src], img[data-srcset], img[loading="lazy"], img.lazy, img.lazyload',
    element: "img" as const,
    transform: (el: Element): Element => {
      const src = el.getAttribute("src") ?? ""
      if (isBase64Placeholder(src) && hasBetterSource(el)) el.removeAttribute("src")

      const dataSrc = el.getAttribute("data-src")
      if (dataSrc && !el.getAttribute("src")) el.setAttribute("src", dataSrc)

      const dataSrcset = el.getAttribute("data-srcset")
      if (dataSrcset && !el.getAttribute("srcset")) el.setAttribute("srcset", dataSrcset)

      for (const attr of Array.from(el.attributes)) {
        if (["src", "srcset", "alt"].includes(attr.name)) continue
        if (attr.value.startsWith("{") || attr.value.startsWith("[")) continue
        if (SRCSET_PATTERN.test(attr.value)) el.setAttribute("srcset", attr.value)
        else if (SRC_PATTERN.test(attr.value)) el.setAttribute("src", attr.value)
      }

      el.classList.remove("lazy", "lazyload")
      for (const a of ["data-ll-status", "data-src", "data-srcset", "loading"]) el.removeAttribute(a)
      return el
    },
  },
  {
    selector: "span:has(img)",
    element: "span" as const,
    transform: (el: Element, doc: Document): Element => {
      if (!containsImage(el)) return el
      for (const child of el.children) {
        if (BLOCK_LEVEL_ELEMENTS.has(child.tagName.toLowerCase())) return el
      }
      const img = findMainImage(el)
      if (!img) return el

      const caption = findCaption(el)
      const processedImg = processImageElement(img, doc)

      if (caption && isMeaningfulCaption(caption)) {
        if (caption.parentNode) caption.parentNode.removeChild(caption)
        return createFigure(processedImg, caption, doc)
      }
      return processedImg
    },
  },
  {
    selector: 'figure, p:has([class*="caption"])',
    element: "figure" as const,
    transform: (el: Element, doc: Document): Element => {
      if (!containsImage(el)) return el
      const imgElement = findMainImage(el)
      if (!imgElement) return el

      const caption = findCaption(el)

      if (caption && isMeaningfulCaption(caption)) {
        const currentImg = findMainImage(el)
        const imageToAdd = currentImg ? currentImg : processImageElement(imgElement, doc)
        return createFigure(imageToAdd, caption, doc)
      }
      return el
    },
  },
]

// --- Helper functions ---

const createFigure = (img: Element, caption: Element, doc: Document): Element => {
  const figure = doc.createElement("figure")
  figure.appendChild(img.cloneNode(true))
  const figcaption = doc.createElement("figcaption")
  figcaption.appendChild(parseHTML(doc, extractCaptionContent(caption)))
  figure.appendChild(figcaption)
  return figure
}

const applySrcset = (srcset: string, img: Element): void => {
  img.setAttribute("srcset", srcset)
  const url = extractFirstSrcsetUrl(srcset)
  if (url && isValidImageUrl(url)) img.setAttribute("src", url)
}

const copyAttributesExcept = (source: Element, target: Element, exclude: string[]): void => {
  for (const attr of source.attributes) {
    if (!exclude.includes(attr.name)) target.setAttribute(attr.name, attr.value)
  }
}

const isBase64Placeholder = (src: string): boolean => {
  const match = src.match(B64_DATA_URL)
  if (!match) return false
  if (match[1] === "svg+xml") return false
  return src.length - match[0].length < 133
}

const isSvgDataUrl = (src: string): boolean => src.startsWith("data:image/svg+xml")

const isValidImageUrl = (src: string): boolean => {
  if (!src || src.startsWith("data:")) return false
  return IMAGE_URL.test(src) || src.includes("image") || src.includes("img") || src.includes("photo")
}

const hasBetterSource = (el: Element): boolean => {
  if (el.hasAttribute("data-src") || el.hasAttribute("data-srcset")) return true
  for (const attr of el.attributes) {
    if (attr.name === "src") continue
    if (attr.name.startsWith("data-") && IMAGE_URL.test(attr.value)) return true
    if (IMAGE_URL.test(attr.value)) return true
  }
  return false
}

const isImageElement = (el: Element): boolean => {
  const tag = el.tagName.toLowerCase()
  return tag === "img" || tag === "video" || tag === "picture" || tag === "source"
}

const containsImage = (el: Element): boolean =>
  isImageElement(el) || el.querySelectorAll("img, video, picture, source").length > 0

const findMainImage = (el: Element): Element | null => {
  if (isImageElement(el)) return el

  const picture = el.querySelector("picture")
  if (picture) return picture

  const imgs = el.querySelectorAll("img")
  const filtered: Element[] = []
  for (const img of imgs) {
    const src = img.getAttribute("src") ?? ""
    if (src.includes("data:image/svg+xml") || isBase64Placeholder(src)) continue
    const alt = img.getAttribute("alt") ?? ""
    if (!alt.trim() && imgs.length > 1) continue
    filtered.push(img)
  }
  if (filtered.length > 0) return filtered[0]!

  const video = el.querySelector("video")
  if (video) return video

  return el.querySelector("img, picture, source, video")
}

const CAPTION_SELECTORS = [
  "figcaption",
  '[class*="caption"]',
  '[class*="description"]',
  '[class*="alt"]',
  '[class*="title"]',
  '[class*="credit"]',
  '[class*="text"]',
  '[class*="post-thumbnail-text"]',
  '[class*="image-caption"]',
  '[class*="photo-caption"]',
  "[aria-label]",
  "[title]",
].join(", ")

const findCaption = (el: Element): Element | null => {
  const figcaption = el.querySelector("figcaption")
  if (figcaption) return figcaption

  const foundCaptions = new Set<string>()

  for (const candidate of el.querySelectorAll(CAPTION_SELECTORS)) {
    if (isImageElement(candidate)) continue
    const text = candidate.textContent?.trim()
    if (text && text.length > 0 && !foundCaptions.has(text)) {
      foundCaptions.add(text)
      return candidate
    }
  }

  // Check alt attribute on image
  const img = el.querySelector("img")
  if (img) {
    const alt = img.getAttribute("alt")?.trim()
    if (alt && alt.length > 0) {
      const div = el.ownerDocument.createElement("div")
      div.textContent = alt
      return div
    }
  }

  // Check sibling elements with caption-related classes
  if (el.parentElement) {
    const parent = el.parentElement
    for (const sibling of parent.children) {
      if (sibling === el) continue
      const hasCaptionClass = Array.from(sibling.classList).some(
        (cls) =>
          cls.includes("caption") || cls.includes("credit") || cls.includes("text") || cls.includes("description"),
      )
      if (hasCaptionClass) {
        const text = sibling.textContent?.trim()
        if (text && text.length > 0) return sibling
      }
    }
  }

  // Look for text elements that follow an image
  const imgs = el.querySelectorAll("img")
  for (const imgEl of imgs) {
    let nextEl = imgEl.nextElementSibling
    while (nextEl) {
      if (["EM", "STRONG", "SPAN", "I", "B", "SMALL", "CITE"].includes(nextEl.tagName)) {
        const text = nextEl.textContent?.trim()
        if (text && text.length > 0) return nextEl
      }
      nextEl = nextEl.nextElementSibling
    }
  }

  // Check text elements as children of the same parent
  for (const imgEl of imgs) {
    const parent = imgEl.parentElement
    if (!parent) continue
    for (const textEl of parent.querySelectorAll("em, strong, span, i, b, small, cite")) {
      if (textEl === imgEl) continue
      const text = textEl.textContent?.trim()
      if (text && text.length > 0) return textEl
    }
  }

  return null
}

const isMeaningfulCaption = (el: Element): boolean => {
  const text = el.textContent?.trim() ?? ""
  if (text.length < 10) return false
  if (text.startsWith("http://") || text.startsWith("https://")) return false
  if (FILENAME.test(text)) return false
  if (/^\d+$/.test(text) || DATE_ONLY.test(text)) return false
  return true
}

const extractCaptionContent = (el: Element): string => {
  const seen = new Set<string>()
  const parts: string[] = []

  const walk = (node: Node): void => {
    if (isTextNode(node)) {
      const text = node.textContent?.trim() ?? ""
      if (text && !seen.has(text)) {
        seen.add(text)
        parts.push(text)
      }
    } else if (isElement(node)) {
      for (const child of node.childNodes) walk(child)
    }
  }

  for (const child of el.childNodes) walk(child)
  return parts.length > 0 ? parts.join(" ") : serializeHTML(el)
}

const processImageElement = (element: Element, doc: Document): Element => {
  const tag = element.tagName.toLowerCase()
  if (tag === "img") return processImgElement(element, doc)
  if (tag === "picture") {
    const imgInside = element.querySelector("img")
    return imgInside ? processImgElement(imgInside, doc) : (element.cloneNode(true) as Element)
  }
  if (tag === "source") return processSourceElement(element, doc)
  return element.cloneNode(true) as Element
}

const processImgElement = (element: Element, doc: Document): Element => {
  const src = element.getAttribute("src") ?? ""
  if (isBase64Placeholder(src) || isSvgDataUrl(src)) {
    const parent = element.parentElement
    if (parent) {
      const sources = Array.from(parent.querySelectorAll("source")).filter(
        (s) => s.hasAttribute("data-srcset") && s.getAttribute("data-srcset") !== "",
      )
      if (sources.length > 0) {
        const newImg = doc.createElement("img")
        const dataSrc = element.getAttribute("data-src")
        if (dataSrc && !isSvgDataUrl(dataSrc)) newImg.setAttribute("src", dataSrc)
        copyAttributesExcept(element, newImg, ["src"])
        return newImg
      }
    }
  }
  return element.cloneNode(true) as Element
}

const processSourceElement = (element: Element, doc: Document): Element => {
  const newImg = doc.createElement("img")
  const srcset = element.getAttribute("srcset")
  if (srcset) applySrcset(srcset, newImg)

  const parent = element.parentElement
  if (parent) {
    const validImgs = Array.from(parent.querySelectorAll("img")).filter((img) => {
      const src = img.getAttribute("src") ?? ""
      return !isBase64Placeholder(src) && !isSvgDataUrl(src) && src !== ""
    })

    if (validImgs.length > 0) {
      copyAttributesExcept(validImgs[0]!, newImg, ["src", "srcset"])
      if (!newImg.hasAttribute("src") || !isValidImageUrl(newImg.getAttribute("src") ?? "")) {
        const imgSrc = validImgs[0]!.getAttribute("src")
        if (imgSrc && isValidImageUrl(imgSrc)) newImg.setAttribute("src", imgSrc)
      }
    } else {
      const dataSrcImg = parent.querySelector("img[data-src]")
      if (dataSrcImg) {
        copyAttributesExcept(dataSrcImg, newImg, ["src", "srcset"])
        if (!newImg.hasAttribute("src") || !isValidImageUrl(newImg.getAttribute("src") ?? "")) {
          const dataSrc = dataSrcImg.getAttribute("data-src")
          if (dataSrc && isValidImageUrl(dataSrc)) newImg.setAttribute("src", dataSrc)
        }
      }
    }
  }

  return newImg
}

const extractFirstSrcsetUrl = (srcset: string): string | null => {
  if (!srcset.trim()) return null
  const trimmed = srcset.trim()

  SRCSET_ENTRY.lastIndex = 0
  let match: RegExpExecArray | null
  let lastIndex = 0

  while ((match = SRCSET_ENTRY.exec(trimmed)) !== null) {
    let url = match[1]!.trim()
    if (lastIndex > 0) url = url.replace(/^,\s*/, "")
    lastIndex = SRCSET_ENTRY.lastIndex
    if (!url || isSvgDataUrl(url)) continue
    return url
  }

  const first = trimmed.match(/^([^\s]+)/)
  if (first?.[1] && !isSvgDataUrl(first[1])) return first[1]
  return null
}

const selectBestSource = (sources: NodeListOf<Element>): Element | null => {
  if (sources.length === 0) return null
  if (sources.length === 1) return sources[0]!

  for (const s of sources) {
    if (!s.hasAttribute("media")) return s
  }

  let best: Element | null = null
  let maxRes = 0

  for (const source of sources) {
    const srcset = source.getAttribute("srcset")
    if (!srcset) continue
    const wMatch = srcset.match(WIDTH_IN_SRCSET)
    const dMatch = srcset.match(DPR_IN_URL)
    if (wMatch?.[1]) {
      const res = parseInt(wMatch[1], 10) * (dMatch?.[1] ? parseFloat(dMatch[1]) : 1)
      if (res > maxRes) {
        maxRes = res
        best = source
      }
    }
  }

  return best ?? sources[0]!
}
