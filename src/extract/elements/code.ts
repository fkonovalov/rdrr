import { countWords } from "@shared"
import { isTextNode, isElement } from "../utils/dom"

const HIGHLIGHTER_PATTERNS = [
  /^language-(\w+)$/,
  /^lang-(\w+)$/,
  /^(\w+)-code$/,
  /^code-(\w+)$/,
  /^syntax-(\w+)$/,
  /^code-snippet__(\w+)$/,
  /^highlight-(\w+)$/,
  /^(\w+)-snippet$/,
  /(?:^|\s)(?:language|lang|brush|syntax)-(\w+)(?:\s|$)/i,
]

const CODE_LANGUAGES = new Set([
  "abap",
  "actionscript",
  "ada",
  "applescript",
  "arduino",
  "bash",
  "batch",
  "c",
  "clojure",
  "cmake",
  "coffeescript",
  "cpp",
  "c++",
  "crystal",
  "csharp",
  "cs",
  "dart",
  "dockerfile",
  "elixir",
  "elm",
  "erlang",
  "fortran",
  "fsharp",
  "gdscript",
  "glsl",
  "golang",
  "graphql",
  "groovy",
  "haskell",
  "hs",
  "html",
  "java",
  "javascript",
  "js",
  "jsx",
  "json",
  "jsonp",
  "julia",
  "kotlin",
  "latex",
  "lean",
  "lean4",
  "lisp",
  "elisp",
  "lua",
  "makefile",
  "markdown",
  "md",
  "matlab",
  "mysql",
  "nasm",
  "nginx",
  "nim",
  "nix",
  "objc",
  "ocaml",
  "pascal",
  "perl",
  "php",
  "postgresql",
  "powershell",
  "prolog",
  "python",
  "regex",
  "ruby",
  "rb",
  "rust",
  "scala",
  "scheme",
  "shell",
  "sh",
  "solidity",
  "sql",
  "svg",
  "swift",
  "tcl",
  "terraform",
  "tex",
  "toml",
  "typescript",
  "ts",
  "tsx",
  "verilog",
  "vhdl",
  "webassembly",
  "wasm",
  "xml",
  "yaml",
  "yml",
  "zig",
])

export const codeBlockRules = [
  {
    selector: [
      "pre",
      'div[class*="prismjs"]',
      ".syntaxhighlighter",
      ".highlight",
      ".highlight-source",
      ".wp-block-syntaxhighlighter-code",
      ".wp-block-code",
      'div[class*="language-"]',
      "code.hl.block",
    ].join(", "),
    element: "pre" as const,
    transform: (el: Element, doc: Document): Element => {
      if (!("classList" in el && "getAttribute" in el)) return el

      const language = detectLanguage(el)
      const cmContent = el.querySelector(".cm-content")

      let code = ""
      if (el.matches(".syntaxhighlighter, .wp-block-syntaxhighlighter-code")) {
        code = extractWordPressCode(el)
      }
      if (!code && cmContent) {
        code = extractStructuredText(cmContent)
      }
      if (!code) {
        code = extractStructuredText(el)
      }

      code = cleanCodeContent(code, el.matches("code.hl.block"))
      removeCodeChrome(el)

      const pre = doc.createElement("pre")
      const codeEl = doc.createElement("code")
      if (language) {
        codeEl.setAttribute("data-lang", language)
        codeEl.setAttribute("class", `language-${language}`)
      }
      codeEl.textContent = code
      pre.appendChild(codeEl)
      return pre
    },
  },
]

const detectLanguage = (root: Element): string => {
  let current: Element | null = root

  while (current) {
    const lang = getCodeLanguage(current)
    if (lang) return lang

    if (current === root) {
      const codeEl = current.querySelector('code[data-lang], code[class*="language-"]') ?? current.querySelector("code")
      if (codeEl) {
        const codeLang = getCodeLanguage(codeEl)
        if (codeLang) return codeLang
      }
    }

    current = current.parentElement
  }

  const cmContent = root.querySelector(".cm-content")
  if (cmContent) {
    for (const div of root.querySelectorAll("div")) {
      if (div.contains(cmContent)) continue
      const text = (div.textContent ?? "").trim().toLowerCase()
      if (text && CODE_LANGUAGES.has(text)) return text
    }
  }

  return ""
}

const getCodeLanguage = (el: Element): string => {
  const dataLang = el.getAttribute("data-lang") ?? el.getAttribute("data-language") ?? el.getAttribute("language")
  if (dataLang) return dataLang.toLowerCase()

  const classes = Array.from(el.classList ?? [])

  if (el.classList?.contains("syntaxhighlighter")) {
    const langClass = classes.find((c) => !["syntaxhighlighter", "nogutter"].includes(c))
    if (langClass && CODE_LANGUAGES.has(langClass.toLowerCase())) return langClass.toLowerCase()
  }

  for (const cls of classes) {
    for (const pattern of HIGHLIGHTER_PATTERNS) {
      const match = cls.toLowerCase().match(pattern)
      if (match?.[1] && CODE_LANGUAGES.has(match[1].toLowerCase())) return match[1].toLowerCase()
    }
  }

  for (const cls of classes) {
    if (CODE_LANGUAGES.has(cls.toLowerCase())) return cls.toLowerCase()
  }

  return ""
}

const extractWordPressCode = (el: Element): string => {
  const container = el.querySelector(".syntaxhighlighter table .code .container")
  if (container) {
    return Array.from(container.children)
      .map((line) => {
        const parts = Array.from(line.querySelectorAll("code"))
          .map((c) =>
            c.classList?.contains("spaces") ? " ".repeat((c.textContent ?? "").length) : (c.textContent ?? ""),
          )
          .join("")
        return parts || (line.textContent ?? "")
      })
      .join("\n")
  }

  const lines = el.querySelectorAll(".code .line")
  if (lines.length > 0) {
    return Array.from(lines)
      .map((line) => {
        const parts = Array.from(line.querySelectorAll("code"))
          .map((c) => c.textContent ?? "")
          .join("")
        return parts || (line.textContent ?? "")
      })
      .join("\n")
  }

  return ""
}

const extractStructuredText = (node: Node): string => {
  if (isTextNode(node)) {
    if (node.parentElement?.querySelector("[data-line], .line") && !(node.textContent ?? "").trim()) return ""
    return node.textContent ?? ""
  }

  if (!isElement(node)) return ""

  if (node.matches(".hover-info, .hover-container")) return ""
  if (node.tagName === "BUTTON" || node.tagName === "STYLE") return ""

  if (node.tagName === "BR") {
    const prev = node.previousElementSibling
    if (prev?.matches('div[class*="line"], span[class*="line"], .ec-line, [data-line-number], [data-line]')) return ""
    return "\n"
  }

  if (node.matches("span.lnt")) return ""
  if (node.matches(".react-syntax-highlighter-line-number")) return ""
  if (node.matches(".rouge-gutter")) return ""

  if ((node.tagName === "DIV" || node.tagName === "SPAN") && node.children.length === 2) {
    const gutter = (node.children[0]!.textContent ?? "").trim()
    if (/^\d+$/.test(gutter)) return extractStructuredText(node.children[1]!).replace(/\n$/, "") + "\n"
  }

  if (node.matches('div[class*="line"], span[class*="line"], .ec-line, [data-line-number], [data-line]')) {
    const codeContainer = node.querySelector('.code, .content, [class*="code-"], [class*="content-"]')
    if (codeContainer) return (codeContainer.textContent ?? "").replace(/\n$/, "") + "\n"

    const lineNum = node.querySelector('.line-number, .gutter, [class*="line-number"], [class*="gutter"]')
    if (lineNum) {
      return (
        Array.from(node.childNodes)
          .filter((child) => !lineNum.contains(child))
          .map(extractStructuredText)
          .join("")
          .replace(/\n$/, "") + "\n"
      )
    }

    return (node.textContent ?? "").replace(/\n$/, "") + "\n"
  }

  let text = ""
  for (const child of node.childNodes) text += extractStructuredText(child)
  return text
}

const cleanCodeContent = (code: string, isVerso: boolean): string => {
  if (isVerso) {
    return code
      .replace(/^[ \t]+|[ \t]+$/g, "")
      .replace(/\t/g, "    ")
      .replace(/\u00a0/g, " ")
      .replace(/^\n+/, "")
  }
  return code
    .trim()
    .replace(/\t/g, "    ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u00a0/g, " ")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
}

const removeCodeChrome = (el: Element): void => {
  let ancestor: Element | null = el
  for (let i = 0; i < 3 && ancestor; i++) {
    const parent: Element | null = ancestor.parentElement
    if (!parent || parent.tagName === "BODY") break
    for (const sib of Array.from(parent.children) as Element[]) {
      if (sib.contains(el)) continue
      if (sib.tagName !== "DIV" && sib.tagName !== "SPAN") continue
      const words = countWords((sib.textContent ?? "").trim())
      if (words <= 5 && !sib.querySelector("pre, code, img, table, h1, h2, h3, h4, h5, h6, p, blockquote, ul, ol")) {
        sib.remove()
      }
    }
    ancestor = parent
  }
}
