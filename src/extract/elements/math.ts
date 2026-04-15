import { parseHTML, getClassName } from "../utils/dom"

interface MathData {
  mathml: string
  latex: string | null
  isBlock: boolean
}

const MATH_SELECTORS = [
  'img.latex[src*="latex.php"]',
  "span.MathJax",
  "mjx-container",
  'script[type="math/tex"]',
  'script[type="math/tex; mode=display"]',
  '.MathJax_Preview + script[type="math/tex"]',
  ".MathJax_Display",
  ".MathJax_SVG",
  ".MathJax_MathML",
  ".mwe-math-element",
  ".mwe-math-fallback-image-inline",
  ".mwe-math-fallback-image-display",
  ".mwe-math-mathml-inline",
  ".mwe-math-mathml-display",
  ".katex",
  ".katex-display",
  ".katex-mathml",
  ".katex-html",
  "[data-katex]",
  'script[type="math/katex"]',
  "math",
  "[data-math]",
  "[data-latex]",
  "[data-tex]",
  'script[type^="math/"]',
  'annotation[encoding="application/x-tex"]',
].join(",")

const MATH_FAST_CHECK =
  'math, mjx-container, .MathJax, .katex, img.latex, [data-math], [data-latex], script[type^="math/"]'

export const mathRules = [
  {
    selector: MATH_SELECTORS,
    element: "math" as const,
    fastCheck: MATH_FAST_CHECK,
    transform: (el: Element, doc: Document): Element => {
      if (!("classList" in el && "getAttribute" in el)) return el

      const mathData = extractMathML(el)
      const latex = extractLatex(el)
      const isBlock = detectBlockDisplay(el)

      return createCleanMathEl(doc, mathData, latex, isBlock)
    },
  },
]

const createCleanMathEl = (
  doc: Document,
  mathData: MathData | null,
  latex: string | null,
  isBlock: boolean,
): Element => {
  const math = doc.createElement("math")
  math.setAttribute("xmlns", "http://www.w3.org/1998/Math/MathML")
  math.setAttribute("display", isBlock ? "block" : "inline")
  math.setAttribute("data-latex", latex ?? "")

  if (mathData?.mathml) {
    const fragment = parseHTML(doc, mathData.mathml)
    const content = fragment.querySelector("math")
    if (content) {
      while (content.firstChild) math.appendChild(content.firstChild)
    }
  } else if (latex) {
    math.textContent = latex
  }

  return math
}

const extractMathML = (el: Element): MathData | null => {
  if (el.tagName.toLowerCase() === "math") {
    return {
      mathml: el.outerHTML,
      latex: el.getAttribute("alttext"),
      isBlock: el.getAttribute("display") === "block",
    }
  }

  const mathmlStr = el.getAttribute("data-mathml")
  if (mathmlStr) {
    const doc = el.ownerDocument ?? document
    const fragment = parseHTML(doc, mathmlStr)
    const mathEl = fragment.querySelector("math")
    if (mathEl) {
      return {
        mathml: mathEl.outerHTML,
        latex: mathEl.getAttribute("alttext"),
        isBlock: mathEl.getAttribute("display") === "block",
      }
    }
  }

  const assistive = el.querySelector(".MJX_Assistive_MathML, mjx-assistive-mml")
  if (assistive) {
    const mathEl = assistive.querySelector("math")
    if (mathEl) {
      const displayAttr = mathEl.getAttribute("display")
      const containerAttr = assistive.getAttribute("display")
      return {
        mathml: mathEl.outerHTML,
        latex: mathEl.getAttribute("alttext"),
        isBlock: displayAttr === "block" || containerAttr === "block",
      }
    }
  }

  const katexMath = el.querySelector(".katex-mathml math")
  if (katexMath) {
    return { mathml: katexMath.outerHTML, latex: null, isBlock: false }
  }

  return null
}

const extractLatex = (el: Element): string | null => {
  const dataLatex = el.getAttribute("data-latex")
  if (dataLatex) return dataLatex

  if (el.tagName.toLowerCase() === "img" && el.classList.contains("latex")) {
    const alt = el.getAttribute("alt")
    if (alt) return alt
    const src = el.getAttribute("src")
    if (src) {
      const match = src.match(/latex\.php\?latex=([^&]+)/)
      if (match?.[1]) return decodeURIComponent(match[1]).replace(/\+/g, " ").replace(/%5C/g, "\\")
    }
  }

  const annotation = el.querySelector('annotation[encoding="application/x-tex"]')
  if (annotation?.textContent) return annotation.textContent.trim()

  if (el.matches(".katex")) {
    const katexAnn = el.querySelector('.katex-mathml annotation[encoding="application/x-tex"]')
    if (katexAnn?.textContent) return katexAnn.textContent.trim()
  }

  if (el.matches('script[type="math/tex"]') || el.matches('script[type="math/tex; mode=display"]')) {
    return el.textContent?.trim() ?? null
  }

  if (el.parentElement) {
    const sibling = el.parentElement.querySelector('script[type="math/tex"], script[type="math/tex; mode=display"]')
    if (sibling) return sibling.textContent?.trim() ?? null
  }

  if (el.tagName.toLowerCase() === "math" && el.textContent?.trim()) {
    return el.textContent.trim()
  }

  return el.getAttribute("alt") ?? null
}

const detectBlockDisplay = (el: Element): boolean => {
  if (el.getAttribute("display") === "block") return true

  const cls = getClassName(el).toLowerCase()
  if (cls.includes("display") || cls.includes("block")) return true

  if (el.closest('.katex-display, .MathJax_Display, [data-display="block"]')) return true
  if (el.matches(".mwe-math-fallback-image-display")) return true
  if (el.matches(".katex")) return el.closest(".katex-display") !== null
  if (el.matches('script[type="math/tex; mode=display"]')) return true

  const parent = el.closest("[display]")
  if (parent) return parent.getAttribute("display") === "true"

  return false
}
