const HIDDEN_STYLE = /(?:^|;\s*)(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)(?:\s*;|\s*$)/i

const HIDDEN_CSS_TOKENS = new Set(["hidden", "invisible"])

export const filterHiddenElements = (doc: Document): number => {
  const targets = new Map<Element, string>()

  for (const el of doc.querySelectorAll("*")) {
    if (containsMath(el)) continue

    const reason = detectHiddenReason(el)
    if (reason) targets.set(el, reason)
  }

  for (const el of targets.keys()) el.remove()
  return targets.size
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

const containsMath = (el: Element): boolean =>
  el.tagName.toLowerCase() === "math" || el.querySelector("math, [data-mathml], .katex-mathml") !== null
