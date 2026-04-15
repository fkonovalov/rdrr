import { ALLOWED_ATTRIBUTES } from "./constants"
import { codeBlockRules } from "./elements/code"
import { headingRules } from "./elements/headings"
import { imageRules } from "./elements/images"
import { mathRules } from "./elements/math"
import { transferContent } from "./utils/dom"

interface StandardizationRule {
  selector: string
  element: string
  fastCheck?: string
  transform?: (el: Element, doc: Document) => Element
}

const RULES: StandardizationRule[] = [
  ...mathRules,
  ...codeBlockRules,
  ...headingRules,
  ...imageRules,

  {
    selector: 'div[data-testid^="paragraph"], div[role="paragraph"]',
    element: "p",
    transform: (el: Element, doc: Document): Element => {
      const p = doc.createElement("p")
      transferContent(el, p)
      for (const attr of el.attributes) {
        if (ALLOWED_ATTRIBUTES.has(attr.name)) p.setAttribute(attr.name, attr.value)
      }
      return p
    },
  },
  {
    selector: 'div[role="list"]',
    element: "ul",
    transform: (el: Element, doc: Document): Element => {
      const firstLabel = el.querySelector('div[role="listitem"] .label')?.textContent?.trim() ?? ""
      const isOrdered = /^\d+\)/.test(firstLabel)
      const list = doc.createElement(isOrdered ? "ol" : "ul")

      for (const item of el.querySelectorAll('div[role="listitem"]')) {
        const li = doc.createElement("li")
        const content = item.querySelector(".content")
        if (content) {
          for (const div of content.querySelectorAll('div[role="paragraph"]')) {
            const p = doc.createElement("p")
            transferContent(div, p)
            div.replaceWith(p)
          }
          transferContent(content, li)
        }
        list.appendChild(li)
      }

      return list
    },
  },
]

export const normaliseRules = (element: Element, doc: Document): void => {
  for (const rule of RULES) {
    if (rule.fastCheck && !element.querySelector(rule.fastCheck)) continue

    let elements: NodeListOf<Element>
    try {
      elements = element.querySelectorAll(rule.selector)
    } catch {
      continue
    }

    for (const el of elements) {
      if (rule.transform) {
        el.replaceWith(rule.transform(el, doc))
      }
    }
  }

  // Fix invalid <code><pre> nesting
  for (const pre of Array.from(element.querySelectorAll("code > pre"))) {
    const outer = pre.parentElement
    if (outer?.tagName === "CODE") outer.replaceWith(pre)
  }

  // arXiv equation tables → math elements
  for (const table of Array.from(
    element.querySelectorAll("table.ltx_equation, table.ltx_eqn_table, table.ltx_equationgroup"),
  )) {
    const maths = table.querySelectorAll("math")
    if (maths.length === 0) continue

    const fragment = doc.createDocumentFragment()
    for (const mathEl of maths) {
      const latex =
        mathEl.getAttribute("alttext") ??
        mathEl.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ??
        ""
      if (!latex) continue

      const clean = doc.createElement("math")
      clean.setAttribute("xmlns", "http://www.w3.org/1998/Math/MathML")
      clean.setAttribute(
        "display",
        mathEl.getAttribute("display") === "block" || table.classList.contains("ltx_equation") ? "block" : "inline",
      )
      clean.setAttribute("data-latex", latex)
      clean.textContent = latex
      fragment.appendChild(clean)
    }

    if (fragment.childNodes.length > 0) table.replaceWith(fragment)
  }

  // arXiv: remove hidden ltx_note_outer spans
  for (const el of Array.from(element.querySelectorAll("span.ltx_note_outer"))) el.remove()

  // arXiv: unwrap ltx_ref links
  for (const link of Array.from(element.querySelectorAll("a.ltx_ref"))) {
    if (link.querySelector("span.ltx_ref_tag, span.ltx_text.ltx_ref_tag")) {
      link.replaceWith(doc.createTextNode(link.textContent ?? ""))
    }
  }

  // Unwrap single-column layout tables
  for (const table of Array.from(element.querySelectorAll("table"))) {
    if (!table.parentNode) continue
    const cells = Array.from(table.querySelectorAll("td, th")).filter((c) => isDirectChild(c, table))
    if (cells.some((c) => c.tagName === "TH")) continue
    const rows = Array.from(table.querySelectorAll("tr")).filter((r) => isDirectChild(r, table))
    if (rows.length === 0) continue
    const isSingleCol = rows.every((tr) => cells.filter((c) => c.parentNode === tr).length <= 1)
    if (!isSingleCol) continue

    const fragment = doc.createDocumentFragment()
    for (const cell of cells) {
      while (cell.firstChild) fragment.appendChild(cell.firstChild)
    }
    table.replaceWith(fragment)
  }

  // Add controls to video elements
  for (const el of element.querySelectorAll("video:not([controls])")) el.setAttribute("controls", "")

  // Convert lite-youtube elements
  for (const el of Array.from(element.querySelectorAll("lite-youtube"))) {
    const videoId = el.getAttribute("videoid")
    if (!videoId) continue
    const iframe = doc.createElement("iframe")
    iframe.setAttribute("width", "560")
    iframe.setAttribute("height", "315")
    iframe.setAttribute("src", `https://www.youtube.com/embed/${videoId}`)
    iframe.setAttribute("title", el.getAttribute("videotitle") ?? "YouTube video player")
    iframe.setAttribute("allowfullscreen", "")
    el.replaceWith(iframe)
  }

  mergeVersoCodeBlocks(element)
}

const mergeVersoCodeBlocks = (root: Element): void => {
  const candidates = root.querySelectorAll('pre[data-verso-code="true"]')
  const parents = new Set<Element>()
  for (const c of candidates) {
    if (c.parentElement) parents.add(c.parentElement)
  }

  for (const container of parents) {
    const children = Array.from(container.childNodes)
    for (let i = 0; i < children.length; i++) {
      const start = children[i]
      if (!start || start.nodeType !== 1) continue
      const startEl = start as Element
      if (startEl.tagName.toLowerCase() !== "pre" || startEl.getAttribute("data-verso-code") !== "true") continue

      const startCode = startEl.querySelector("code")
      if (!startCode) continue
      const lang = (startCode.getAttribute("data-lang") ?? "").toLowerCase()
      if (lang !== "lean" && lang !== "lean4") continue

      const run: Element[] = [startCode]
      const between: Node[] = []
      let j = i + 1

      while (j < children.length) {
        const node = children[j]!
        if (node.nodeType === 3 && !(node.textContent ?? "").trim()) {
          between.push(node)
          j++
          continue
        }
        if (node.nodeType !== 1) break
        const el = node as Element
        if (el.tagName.toLowerCase() !== "pre" || el.getAttribute("data-verso-code") !== "true") break
        const code = el.querySelector("code")
        if (!code || (code.getAttribute("data-lang") ?? "").toLowerCase() !== lang) break
        run.push(code)
        j++
      }

      if (run.length <= 1) continue
      startCode.textContent = run
        .map((c) => (c.textContent ?? "").replace(/\r?\n$/, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\n+|\n+$/g, "")
      for (let k = 1; k < run.length; k++) run[k]!.closest("pre")?.remove()
      for (const n of between) n.parentNode?.removeChild(n)
      i = j - 1
    }
  }
}

const isDirectChild = (el: Node, ancestor: Node): boolean => {
  let parent = el.parentNode
  while (parent && parent !== ancestor) {
    if (parent.nodeName === "TABLE") return false
    parent = parent.parentNode
  }
  return parent === ancestor
}
