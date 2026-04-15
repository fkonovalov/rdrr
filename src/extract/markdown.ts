import TurndownService from "turndown"
import { addRules } from "./markdown-rules"

export const toMarkdown = (html: string, _url?: string): string => {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    preformattedCode: true,
  })

  addRules(td)

  const cleaned = html.replace(/<wbr\s*\/?>/gi, "")
  let md = td.turndown(cleaned)

  // Remove leading title
  const titleMatch = md.match(/^# .+\n+/)
  if (titleMatch) md = md.slice(titleMatch[0].length)

  // Remove empty links (but not image links)
  md = md.replace(/\n*(?<!!)\[]\([^)]+\)\n*/g, "")

  // Add space between ! and ![ to prevent image syntax collision
  md = md.replace(/!(?=!\[|\[!\[)/g, "! ")

  // Collapse consecutive newlines
  md = md.replace(/\n{3,}/g, "\n\n")

  return md.trim()
}
