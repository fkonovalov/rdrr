import type TurndownService from "turndown"
import { isElement, isTextNode, serializeHTML, parseHTML } from "./utils/dom"

type GenericEl = {
  getAttribute: (name: string) => string | null
  hasAttribute: (name: string) => boolean
  querySelector: (s: string) => Element | null
  querySelectorAll: (s: string) => NodeListOf<Element>
  classList?: DOMTokenList
  parentNode?: Node | null
  nextSibling?: Node | null
  nodeName: string
  innerHTML: string
  children?: HTMLCollection
  textContent?: string | null
  closest?: (s: string) => Element | null
  cloneNode: (deep?: boolean) => Node
  remove: () => void
}

const isEl = (n: unknown): n is GenericEl => n !== null && typeof n === "object" && "getAttribute" in n

const WIDTH_RE = /^(\d+)w,?$/
const DENSITY_RE = /^\d+(?:\.\d+)?x,?$/

const bestSrc = (node: GenericEl): string => {
  const srcset = node.getAttribute("srcset")
  if (srcset) {
    let best = ""
    let bestW = 0
    const tokens = srcset.trim().split(/\s+/)
    let parts: string[] = []
    for (const token of tokens) {
      const m = token.match(WIDTH_RE)
      if (m) {
        const w = parseInt(m[1]!, 10)
        if (parts.length > 0 && w > bestW) {
          const url = parts.join(" ").replace(/^,\s*/, "")
          if (url) {
            bestW = w
            best = url
          }
        }
        parts = []
      } else if (DENSITY_RE.test(token)) {
        parts = []
      } else {
        parts.push(token)
      }
    }
    if (best) return best
  }
  return node.getAttribute("src") ?? ""
}

const extractLatex = (el: GenericEl): string => {
  const dataLatex = el.getAttribute("data-latex")
  if (dataLatex) return dataLatex.trim()
  const alttext = el.getAttribute("alttext")
  if (alttext) return alttext.trim()
  return ""
}

const isDirectTableChild = (el: Node, ancestor: Node): boolean => {
  let parent = el.parentNode
  while (parent && parent !== ancestor) {
    if (parent.nodeName === "TABLE") return false
    parent = parent.parentNode
  }
  return parent === ancestor
}

export const addRules = (td: TurndownService): void => {
  td.addRule("table", {
    filter: "table",
    replacement: (content, node) => {
      if (!isEl(node)) return content
      if (node.classList?.contains("ltx_equation") || node.classList?.contains("ltx_eqn_table")) {
        return handleEquations(node)
      }

      const directCells = Array.from(node.querySelectorAll("td, th")).filter((c) =>
        isDirectTableChild(c, node as unknown as Node),
      )
      const directRows = Array.from(node.querySelectorAll("tr")).filter((r) =>
        isDirectTableChild(r, node as unknown as Node),
      )

      if (node.querySelector("table") || directCells.length <= 1) {
        const counts = directRows.map((tr) => directCells.filter((c) => c.parentNode === tr).length)
        if (directRows.length > 0 && new Set(counts).size === 1 && (counts[0] ?? 0) <= 1) {
          return "\n\n" + td.turndown(directCells.map((c) => serializeHTML(c)).join("")) + "\n\n"
        }
      }

      const cells = Array.from(node.querySelectorAll("td, th"))
      if (cells.some((c) => c.hasAttribute("colspan") || c.hasAttribute("rowspan"))) {
        return "\n\n" + cleanTable(node) + "\n\n"
      }

      const rowEls = (node as unknown as HTMLTableElement).rows?.length
        ? Array.from((node as unknown as HTMLTableElement).rows)
        : directRows
      const rows = rowEls.map((row) => {
        const cellEls = (row as HTMLTableRowElement).cells?.length
          ? Array.from((row as HTMLTableRowElement).cells)
          : Array.from(row.querySelectorAll("td, th")).filter((c) => c.parentNode === row)
        const mapped = cellEls.map((c) =>
          td.turndown(serializeHTML(c)).replace(/\n/g, " ").trim().replace(/\|/g, "\\|"),
        )
        return `| ${mapped.join(" | ")} |`
      })

      if (!rows.length) return content
      const sep = `| ${Array((rows[0]?.split("|").length ?? 2) - 2)
        .fill("---")
        .join(" | ")} |`
      return `\n\n${[rows[0], sep, ...rows.slice(1)].join("\n")}\n\n`
    },
  })

  td.remove(["style", "script", "button"])
  // @ts-expect-error -- turndown keep accepts string[]
  td.keep(["iframe", "video", "audio", "sup", "sub", "svg", "math"])

  td.addRule("list", {
    filter: ["ul", "ol"],
    replacement: (content, node) => {
      content = content.trim()
      const el = node as unknown as GenericEl
      const isTop = !(el.parentNode && (el.parentNode.nodeName === "UL" || el.parentNode.nodeName === "OL"))
      return (isTop ? "\n" : "") + content + "\n"
    },
  })

  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node, options) => {
      if (!isEl(node)) return content
      const checkbox = node.querySelector('input[type="checkbox"]')
      let task = ""
      if (node.classList?.contains("task-list-item") && checkbox && isEl(checkbox)) {
        content = content.replace(/<input[^>]*>/, "")
        task = checkbox.getAttribute("checked") ? "[x] " : "[ ] "
      }

      content = content.replace(/\n+$/, "").split("\n").filter(Boolean).join("\n\t")

      let level = 0
      let cur = node.parentNode
      while (cur && isEl(cur)) {
        if (cur.nodeName === "UL" || cur.nodeName === "OL") level++
        else if (cur.nodeName !== "LI") break
        cur = cur.parentNode
      }

      const indent = "\t".repeat(Math.max(0, level - 1))
      let prefix: string
      const parent = node.parentNode
      if (parent && isEl(parent) && parent.nodeName === "OL") {
        const start = parent.getAttribute("start")
        const children = Array.from(parent.children ?? [])
        const idx = children.indexOf(node as unknown as Element) + 1
        prefix = `${indent}${start ? Number(start) + idx - 1 : idx}. `
      } else {
        prefix = `${indent}${options.bulletListMarker} `
      }

      return prefix + task + content.trim() + (node.nextSibling && !content.endsWith("\n") ? "\n" : "")
    },
  })

  td.addRule("figure", {
    filter: "figure",
    replacement: (content, node) => {
      if (!isEl(node)) return content
      const img = node.querySelector("img")
      if (!img || !isEl(img)) return content

      const hasP = Array.from(node.querySelectorAll("p")).some((p) => {
        let a = (p as unknown as GenericEl).parentNode
        while (a && a !== (node as unknown as Node)) {
          if ((a as unknown as Element).nodeName === "FIGCAPTION") return false
          a = (a as unknown as GenericEl).parentNode
        }
        return true
      })
      if (hasP) return content

      const alt = img.getAttribute("alt") ?? ""
      const src = bestSrc(img)
      const figcaption = node.querySelector("figcaption")
      let caption = ""
      if (figcaption && isEl(figcaption)) {
        const captionHtml = serializeHTML(figcaption)
        const processed = captionHtml.replace(/<math.*?>(.*?)<\/math>/g, (match) => {
          const doc = (node as unknown as Element).ownerDocument
          if (!doc) return match
          const fragment = parseHTML(doc, match)
          const math = fragment.querySelector("math")
          return math && isEl(math) ? `$${extractLatex(math)}$` : match
        })
        caption = td.turndown(processed).trim()
      }

      return `![${alt}](${src})\n\n${caption}\n\n`
    },
  })

  td.addRule("image", {
    filter: "img",
    replacement: (_, node) => {
      if (!isEl(node)) return ""
      const alt = node.getAttribute("alt") ?? ""
      const src = bestSrc(node)
      const title = node.getAttribute("title")
      return src ? `![${alt}](${src}${title ? ` "${title}"` : ""})` : ""
    },
  })

  td.addRule("embed", {
    filter: (node) => {
      if (!isEl(node)) return false
      const src = node.getAttribute("src")
      return !!src && (/youtube\.com|youtube-nocookie\.com|youtu\.be/.test(src) || /twitter\.com|x\.com/.test(src))
    },
    replacement: (content, node) => {
      if (!isEl(node)) return content
      const src = node.getAttribute("src") ?? ""
      const yt = src.match(/(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/(?:embed\/|watch\?v=)?([a-zA-Z0-9_-]+)/)
      if (yt?.[1]) return `\n![](https://www.youtube.com/watch?v=${yt[1]})\n`
      const tweet = src.match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/)
      if (tweet) return `\n![](https://x.com/${tweet[1]}/status/${tweet[2]})\n`
      const embedTweet = src.match(/platform\.twitter\.com\/embed\/Tweet\.html\?.*?id=(\d+)/)
      if (embedTweet) return `\n![](https://x.com/i/status/${embedTweet[1]})\n`
      return content
    },
  })

  td.addRule("highlight", { filter: "mark", replacement: (c) => `==${c}==` })
  td.addRule("strikethrough", {
    filter: (n) => ["DEL", "S", "STRIKE"].includes(n.nodeName),
    replacement: (c) => `~~${c}~~`,
  })

  td.addRule("citations", {
    filter: (node) => isEl(node) && node.nodeName === "SUP" && (node.getAttribute("id") ?? "").startsWith("fnref:"),
    replacement: (content, node) => {
      if (!isEl(node)) return content
      const id = node.getAttribute("id")
      return id?.startsWith("fnref:") ? `[^${id.replace("fnref:", "").split("-")[0]}]` : content
    },
  })

  td.addRule("footnotesList", {
    filter: (node) =>
      isEl(node) &&
      node.nodeName === "OL" &&
      isEl(node.parentNode) &&
      node.parentNode?.getAttribute?.("id") === "footnotes",
    replacement: (_, node) => {
      if (!isEl(node)) return ""
      const refs = Array.from(node.children ?? []).map((li) => {
        if (!isEl(li)) return ""
        const liId = li.getAttribute("id") ?? ""
        const id = liId.startsWith("fn:") ? liId.replace("fn:", "") : liId
        const sup = li.querySelector("sup")
        if (sup && isEl(sup) && sup.textContent?.trim() === id) sup.remove()
        const md = td
          .turndown(serializeHTML(li))
          .replace(/\s*↩︎$/, "")
          .trim()
        return `[^${id.toLowerCase()}]: ${md}`
      })
      return "\n\n" + refs.join("\n\n") + "\n\n"
    },
  })

  td.addRule("removals", {
    filter: (node) =>
      isEl(node) &&
      ((node.getAttribute("href") ?? "").includes("#fnref") || (node.classList?.contains("footnote-backref") ?? false)),
    replacement: () => "",
  })

  td.addRule("preformattedCode", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_, node) => {
      if (!isEl(node)) return ""
      const code = node.querySelector("code")
      if (!code || !isEl(code)) return ""
      const lang =
        code.getAttribute("data-lang") ??
        code.getAttribute("data-language") ??
        code.getAttribute("class")?.match(/language-(\w+)/)?.[1] ??
        ""
      const text = (code.textContent ?? "").trim()
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`
    },
  })

  td.addRule("math", {
    filter: (node) =>
      node.nodeName.toLowerCase() === "math" || (isEl(node) && (node.classList?.contains("mwe-math-element") ?? false)),
    replacement: (_, node) => {
      if (!isEl(node)) return ""
      const latex = extractLatex(node).trim()
      const isBlock =
        node.getAttribute("display") === "block" ||
        (node.classList?.contains("mwe-math-fallback-image-display") ?? false)
      return isBlock ? `\n$$\n${latex}\n$$\n` : `$${latex}$`
    },
  })

  td.addRule("katex", {
    filter: (node) => isEl(node) && (node.classList?.contains("math") || node.classList?.contains("katex")),
    replacement: (_, node) => {
      if (!isEl(node)) return ""
      let latex = node.getAttribute("data-latex") ?? ""
      if (!latex) {
        const ann = node.querySelector('.katex-mathml annotation[encoding="application/x-tex"]')
        latex = ann?.textContent ?? node.textContent?.trim() ?? ""
      }
      const mathEl = node.querySelector(".katex-mathml math")
      const isInline =
        node.classList?.contains("math-inline") ||
        (mathEl && isEl(mathEl) && mathEl.getAttribute("display") !== "block")
      return isInline ? `$${latex}$` : `\n$$\n${latex}\n$$\n`
    },
  })

  td.addRule("callout", {
    filter: (node) =>
      isEl(node) && !!node.getAttribute("data-callout") && (node.classList?.contains("callout") ?? false),
    replacement: (_, node) => {
      if (!isEl(node)) return ""
      const type = node.getAttribute("data-callout") ?? "note"
      const titleInner = node.querySelector(".callout-title-inner")
      const title = titleInner?.textContent?.trim() ?? type.charAt(0).toUpperCase() + type.slice(1)
      node.querySelector(".callout-title")?.remove()
      const contentEl = node.querySelector(".callout-content")
      const md = td.turndown(contentEl ? contentEl.innerHTML : node.innerHTML).trim()
      const quoted = md
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")
      return `\n\n> [!${type}] ${title}\n${quoted}\n\n`
    },
  })

  td.addRule("complexLinkStructure", {
    filter: (node) =>
      node.nodeName === "A" &&
      node.childNodes.length > 1 &&
      Array.from(node.childNodes).some((child) => ["H1", "H2", "H3", "H4", "H5", "H6"].includes(child.nodeName)),
    replacement: (_, node) => {
      if (!isEl(node)) return ""
      const href = node.getAttribute("href")
      const headingNode = node.querySelector("h1, h2, h3, h4, h5, h6")
      const headingContent = headingNode ? td.turndown(headingNode.outerHTML) : ""
      headingNode?.remove()
      const remainingContent = td.turndown(serializeHTML(node))
      let md = `${headingContent}\n\n${remainingContent}\n\n`
      if (href) md += `[View original](${href})`
      return md
    },
  })

  td.addRule("arXivEnumerate", {
    filter: (node) => node.nodeName === "OL" && isEl(node) && (node.classList?.contains("ltx_enumerate") ?? false),
    replacement: (_, node) => {
      if (!isEl(node)) return ""
      const items = Array.from(node.children).map((item, index) => {
        if (!isEl(item)) return ""
        const html = (serializeHTML(item) ?? "").replace(/^<span class="ltx_tag ltx_tag_item">\d+\.<\/span>\s*/, "")
        return `${index + 1}. ${td.turndown(html)}`
      })
      return "\n\n" + items.join("\n\n") + "\n\n"
    },
  })

  td.addRule("handleTextNodesInTables", {
    filter: (node) => isTextNode(node) && node.parentNode !== null && node.parentNode.nodeName === "TD",
    replacement: (content) => content,
  })
}

const handleEquations = (el: GenericEl): string => {
  const maths = el.querySelectorAll("math[alttext]")
  if (maths.length === 0) return ""
  return Array.from(maths)
    .map((m) => {
      const alt = m.getAttribute("alttext")
      if (!alt) return ""
      const isInline = m.closest(".ltx_eqn_inline") !== null
      return isInline ? `$${alt.trim()}$` : `\n$$\n${alt.trim()}\n$$`
    })
    .join("\n\n")
}

const TABLE_ATTRS = new Set([
  "src",
  "href",
  "style",
  "align",
  "width",
  "height",
  "rowspan",
  "colspan",
  "bgcolor",
  "scope",
  "valign",
  "headers",
])

const cleanTable = (el: GenericEl): string => {
  const clone = el.cloneNode(true) as Element
  const clean = (node: Element): void => {
    for (const attr of Array.from(node.attributes)) {
      if (!TABLE_ATTRS.has(attr.name)) node.removeAttribute(attr.name)
    }
    if (node.children) {
      for (const child of Array.from(node.children)) {
        if (isElement(child)) clean(child)
      }
    }
  }
  clean(clone)
  return clone.outerHTML.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
}
