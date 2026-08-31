import { collectAncestors } from "../utils/dom"

const HIDDEN_STYLE = /(?:^|;\s*)(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)(?:\s*;|\s*$)/i

const HIDDEN_CSS_TOKENS = new Set(["hidden", "invisible"])

const MATH_MARKUP_SELECTOR = "math, [data-mathml], .katex-mathml"

export const filterHiddenElements = (root: Document | Element): number => {
  let mathAncestors: Set<Element> | undefined
  const targets: Element[] = []

  for (const el of root.querySelectorAll("*")) {
    const reason = detectHiddenReason(el)
    if (!reason) continue
    mathAncestors ??= collectAncestors(root.querySelectorAll(MATH_MARKUP_SELECTOR))
    if (el.tagName.toLowerCase() === "math" || mathAncestors.has(el)) continue
    targets.push(el)
  }

  for (const el of targets) el.remove()
  return targets.length
}

const detectHiddenReason = (el: Element): string | null => {
  const style = el.getAttribute("style")
  if (style && HIDDEN_STYLE.test(style)) {
    if (style.includes("display")) return "display:none"
    if (style.includes("visibility")) return "visibility:hidden"
    return "opacity:0"
  }

  const className = el.getAttribute("class")
  if (className) {
    for (const token of className.split(/\s+/)) {
      const bare = token.includes(":") ? token.split(":").pop()! : token
      if (HIDDEN_CSS_TOKENS.has(bare)) return `class:${token}`
    }
  }

  return null
}
