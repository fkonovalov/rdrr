import { parseHTML } from "./utils/dom"

const MOBILE_WIDTH = 600

export const flattenShadowRoots = (original: Document, clone: Document): void => {
  if (!original.body || !clone.body) return

  const origElements = Array.from(original.body.querySelectorAll("*"))
  const firstShadow = origElements.find((el) => el.shadowRoot)
  if (!firstShadow) return

  const cloneElements = Array.from(clone.body.querySelectorAll("*"))
  const canRead = (firstShadow.shadowRoot?.childNodes?.length ?? 0) > 0

  if (canRead) {
    for (let i = origElements.length - 1; i >= 0; i--) {
      const origEl = origElements[i]!
      if (!origEl.shadowRoot) continue
      const cloneEl = cloneElements[i]
      if (!cloneEl) continue
      const html = origEl.shadowRoot.innerHTML
      if (html.length > 0) replaceShadowHost(cloneEl, html, clone)
    }
  } else {
    const shadowData: Array<{ cloneEl: Element; html: string }> = []
    for (let i = 0; i < origElements.length; i++) {
      const origEl = origElements[i]!
      const html = origEl.getAttribute("data-rdrr-shadow")
      if (!html) continue
      const cloneEl = cloneElements[i]
      if (!cloneEl) continue
      shadowData.push({ cloneEl, html })
      origEl.removeAttribute("data-rdrr-shadow")
      cloneEl.removeAttribute("data-rdrr-shadow")
    }
    for (const { cloneEl, html } of shadowData) {
      replaceShadowHost(cloneEl, html, clone)
    }
  }
}

export const resolveStreamedContent = (doc: Document): void => {
  const scripts = doc.querySelectorAll("script")
  const swaps: Array<{ templateId: string; contentId: string }> = []
  const rcPattern = /\$RC\("(B:\d+)","(S:\d+)"\)/g

  for (const script of scripts) {
    const text = script.textContent ?? ""
    if (!text.includes("$RC(")) continue
    rcPattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = rcPattern.exec(text)) !== null) {
      swaps.push({ templateId: match[1]!, contentId: match[2]! })
    }
  }

  if (swaps.length === 0) return

  for (const { templateId, contentId } of swaps) {
    const template = doc.getElementById(templateId)
    const content = doc.getElementById(contentId)
    if (!template || !content) continue

    const parent = template.parentNode
    if (!parent) continue

    let next = template.nextSibling
    let foundMarker = false
    while (next) {
      const following = next.nextSibling
      if (next.nodeType === 8 && (next as Comment).data === "/$") {
        next.remove()
        foundMarker = true
        break
      }
      next.remove()
      next = following
    }

    if (!foundMarker) continue

    while (content.firstChild) parent.insertBefore(content.firstChild, template)
    template.remove()
    content.remove()
  }
}

export const evaluateMediaQueries = (doc: Document): Array<{ selector: string; styles: string }> => {
  const result: Array<{ selector: string; styles: string }> = []
  try {
    if (!doc.styleSheets) return result
    if (typeof CSSMediaRule === "undefined") return result

    for (const sheet of doc.styleSheets) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }

      for (const rule of rules) {
        if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes("max-width")) continue
        const match = rule.conditionText.match(/max-width[^:]*:\s*(\d+)/)
        if (!match?.[1]) continue
        const maxWidth = parseInt(match[1], 10)
        if (MOBILE_WIDTH > maxWidth) continue

        for (const cssRule of rule.cssRules) {
          if (cssRule instanceof CSSStyleRule) {
            result.push({ selector: cssRule.selectorText, styles: cssRule.style.cssText })
          }
        }
      }
    }
  } catch {}

  return result
}

export const applyMobileStyles = (doc: Document, styles: Array<{ selector: string; styles: string }>): void => {
  for (const { selector, styles: css } of styles) {
    try {
      for (const el of doc.querySelectorAll(selector)) {
        el.setAttribute("style", (el.getAttribute("style") ?? "") + css)
      }
    } catch {}
  }
}

const replaceShadowHost = (el: Element, shadowHtml: string, doc: Document): void => {
  const fragment = parseHTML(doc, shadowHtml)
  if (el.tagName.includes("-")) {
    const div = doc.createElement("div")
    div.appendChild(fragment)
    el.parentNode?.replaceChild(div, el)
  } else {
    el.textContent = ""
    el.appendChild(fragment)
  }
}
