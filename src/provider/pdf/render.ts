import { classifyLine } from "./headings"
import type { FontStats, LineItem, LineRole, PageLines } from "./types"

export const buildMarkdown = (pages: PageLines[], stats: FontStats, numPages: number): string => {
  const parts: string[] = []

  const allEntries: Array<{ line: LineItem; pageNum: number }> = []
  for (const page of pages) {
    for (const line of page.lines) allEntries.push({ line, pageNum: page.pageNum })
  }

  let prevPageNum = 0
  let prevRole: LineRole = "p"
  let inBlockquote = false

  for (const { line, pageNum } of allEntries) {
    const role = classifyLine(line, stats)

    if (pageNum !== prevPageNum && prevPageNum > 0 && parts.length > 0) {
      if (inBlockquote) inBlockquote = false
      parts.push("\n---\n")
    }
    prevPageNum = pageNum

    if (role === "h1") {
      if (inBlockquote) inBlockquote = false
      parts.push(`\n# ${line.text}\n`)
    } else if (role === "h2") {
      if (inBlockquote) inBlockquote = false
      parts.push(`\n## ${line.text}\n`)
    } else if (role === "blockquote") {
      if (inBlockquote) {
        parts.push(`> ${line.text}`)
      } else {
        inBlockquote = true
        parts.push(`\n> ${line.text}`)
      }
    } else if (role === "small") {
      if (inBlockquote || prevRole === "blockquote") {
        parts.push(`> ${line.text}`)
        inBlockquote = true
      } else {
        if (inBlockquote) inBlockquote = false
        parts.push(`\n> ${line.text}\n`)
      }
    } else {
      if (inBlockquote) inBlockquote = false

      if (prevRole === "p" && parts.length > 0) {
        const last = parts.at(-1) ?? ""
        if (!last.startsWith("\n#") && !last.startsWith("\n---") && !last.startsWith("\n>") && !last.startsWith(">")) {
          parts[parts.length - 1] = last.trimEnd() + " " + line.text
          prevRole = role
          continue
        }
      }
      parts.push(line.text)
    }

    prevRole = role
  }

  let md = parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (numPages > 1) {
    md = `*${numPages} pages*\n\n${md}`
  }

  return md
}

export const titleFromUrl = (url: string): string => {
  try {
    const filename = new URL(url).pathname.split("/").pop() ?? ""
    return decodeURIComponent(filename.replace(/\.pdf$/i, "").replace(/[-_]/g, " ")) || "PDF Document"
  } catch {
    return "PDF Document"
  }
}
