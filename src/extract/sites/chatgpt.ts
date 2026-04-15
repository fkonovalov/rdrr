import type { SiteExtractor, ConversationMessage } from "./types"
import { parseHTML, serializeHTML } from "../utils/dom"
import { buildConversationHtml, conversationResult } from "./conversation"
import { registerSite } from "./registry"

const CITATION_PATTERN =
  /(&ZeroWidthSpace;)?(<span[^>]*?>\s*<a(?=[^>]*?href="([^"]+)")(?=[^>]*?target="_blank")(?=[^>]*?rel="noopener")[^>]*?>[\s\S]*?<\/a>\s*<\/span>)/gi

registerSite({
  patterns: [/^https?:\/\/chatgpt\.com\/(c|share)\/.*/],
  create: (doc) => {
    const articles = doc.querySelectorAll('article[data-testid^="conversation-turn-"]')

    return {
      canExtract: () => articles.length > 0,
      extract: () => {
        const { messages, footnotes } = extractMessages(doc, articles)
        const title = doc.title?.trim().replace(/ \| ChatGPT$/, "") || "ChatGPT Conversation"
        let html = buildConversationHtml(messages)
        if (footnotes.length > 0) {
          html += buildFootnoteSection(footnotes)
        }
        return conversationResult(title, "ChatGPT", messages, html)
      },
    } satisfies SiteExtractor
  },
})

interface Footnote {
  url: string
  text: string
}

const extractMessages = (
  doc: Document,
  articles: NodeListOf<Element>,
): { messages: ConversationMessage[]; footnotes: Footnote[] } => {
  const messages: ConversationMessage[] = []
  const footnotes: Footnote[] = []
  let footnoteCounter = 0

  for (const article of articles) {
    const authorEl = article.querySelector("h5.sr-only, h6.sr-only")
    const authorText = authorEl?.textContent?.trim()?.replace(/:\s*$/, "") ?? ""
    const authorRole = article.getAttribute("data-message-author-role") ?? ""
    const isUser = authorText.toLowerCase().includes("you") || authorRole === "user"
    const author = isUser ? authorText || "You" : authorText || "ChatGPT"

    let content = serializeHTML(article).replace(/\u200B/g, "")

    // Remove sr-only headings and closed state spans
    const tempDiv = doc.createElement("div")
    tempDiv.appendChild(parseHTML(doc, content))
    for (const el of tempDiv.querySelectorAll('h5.sr-only, h6.sr-only, span[data-state="closed"]')) {
      el.remove()
    }
    content = serializeHTML(tempDiv)

    // Process inline citation references into footnotes
    content = content.replace(CITATION_PATTERN, (_match, _zws, _span, url: string) => {
      let domain = ""
      let fragmentText = ""
      try {
        domain = new URL(url).hostname.replace(/^www\./, "")
        const hashParts = url.split("#:~:text=")
        if (hashParts.length > 1) {
          const decoded = decodeURIComponent(hashParts[1]!)
          const parts = decoded.replace(/%2C/g, ",").split(",")
          if (parts.length > 1 && parts[0]?.trim()) {
            fragmentText = ` \u2014 ${parts[0].trim()}...`
          } else if (parts[0]?.trim()) {
            fragmentText = ` \u2014 ${decoded.trim()}`
          }
        }
      } catch {
        domain = url
      }

      let footnoteIndex = footnotes.findIndex((fn) => fn.url === url)
      let footnoteNumber: number
      if (footnoteIndex === -1) {
        footnoteCounter++
        footnoteNumber = footnoteCounter
        footnotes.push({
          url,
          text: `<a href="${url}">${domain}</a>${fragmentText}`,
        })
      } else {
        footnoteNumber = footnoteIndex + 1
      }

      return `<sup id="fnref:${footnoteNumber}"><a href="#fn:${footnoteNumber}">${footnoteNumber}</a></sup>`
    })

    content = content.replace(/<p[^>]*>\s*<\/p>/g, "")

    if (content.trim()) {
      messages.push({
        author,
        content: content.trim(),
        role: isUser ? "user" : "assistant",
      })
    }
  }

  return { messages, footnotes }
}

const buildFootnoteSection = (footnotes: Footnote[]): string => {
  const items = footnotes
    .map((fn, i) => `<li id="fn:${i + 1}">${fn.text} <a href="#fnref:${i + 1}">\u21a9</a></li>`)
    .join("\n")
  return `\n<hr>\n<div class="footnotes">\n<ol>\n${items}\n</ol>\n</div>`
}
