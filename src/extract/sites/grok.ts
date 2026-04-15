import type { SiteExtractor, ConversationMessage } from "./types"
import { serializeHTML } from "../utils/dom"
import { buildConversationHtml, conversationResult } from "./conversation"
import { registerSite } from "./registry"

const MSG_SELECTOR = ".relative.group.flex.flex-col.justify-center.w-full"
const LINK_PATTERN = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi

interface Footnote {
  url: string
  text: string
}

registerSite({
  patterns: [/^https?:\/\/grok\.com\/(chat|share)(\/.*)?$/],
  create: (doc) => {
    const bubbles = doc.querySelectorAll(MSG_SELECTOR)

    return {
      canExtract: () => bubbles.length > 0,
      extract: () => {
        const { messages, footnotes } = extractMessages(bubbles)
        const title = getTitle(doc)
        let html = buildConversationHtml(messages)
        if (footnotes.length > 0) {
          const items = footnotes
            .map((fn, i) => `<li id="fn:${i + 1}">${fn.text} <a href="#fnref:${i + 1}">\u21a9</a></li>`)
            .join("\n")
          html += `\n<hr>\n<div class="footnotes">\n<ol>\n${items}\n</ol>\n</div>`
        }
        return conversationResult(title, "Grok", messages, html)
      },
    } satisfies SiteExtractor
  },
})

const extractMessages = (bubbles: NodeListOf<Element>): { messages: ConversationMessage[]; footnotes: Footnote[] } => {
  const messages: ConversationMessage[] = []
  const footnotes: Footnote[] = []
  let footnoteCounter = 0

  for (const container of bubbles) {
    const isUser = container.classList.contains("items-end")
    const isGrok = container.classList.contains("items-start")
    if (!isUser && !isGrok) continue

    const bubble = container.querySelector(".message-bubble")
    if (!bubble) continue

    let content: string
    if (isUser) {
      content = (bubble.textContent ?? "").trim()
    } else {
      const cloned = bubble.cloneNode(true) as Element
      cloned.querySelector(".relative.border.border-border-l1.bg-surface-base")?.remove()
      content = serializeHTML(cloned)

      // Process footnotes for links in Grok responses
      content = content.replace(LINK_PATTERN, (match, url: string, linkText: string) => {
        if (!url || url.startsWith("#") || !/^https?:\/\//i.test(url)) return match

        let footnoteIndex = footnotes.findIndex((fn) => fn.url === url)
        if (footnoteIndex === -1) {
          footnoteCounter++
          footnoteIndex = footnoteCounter
          let domainText: string
          try {
            const domain = new URL(url).hostname.replace(/^www\./, "")
            domainText = `<a href="${url}">${domain}</a>`
          } catch {
            domainText = `<a href="${url}">${url}</a>`
          }
          footnotes.push({ url, text: domainText })
        } else {
          footnoteIndex = footnoteIndex + 1
        }

        return `${linkText}<sup id="fnref:${footnoteIndex}"><a href="#fn:${footnoteIndex}">${footnoteIndex}</a></sup>`
      })
    }

    content = content.replace(/\u200B/g, "").trim()
    if (content) {
      messages.push({
        author: isUser ? "You" : "Grok",
        content,
        role: isUser ? "user" : "assistant",
      })
    }
  }

  return { messages, footnotes }
}

const getTitle = (doc: Document): string => {
  const pageTitle = doc.title?.trim()
  if (pageTitle && pageTitle !== "Grok" && !pageTitle.startsWith("Grok by ")) {
    return pageTitle.replace(/\s-\s*Grok$/, "").trim()
  }

  const firstUser = doc.querySelector(`${MSG_SELECTOR}.items-end`)
  if (firstUser) {
    const bubble = firstUser.querySelector(".message-bubble")
    if (bubble) {
      const text = bubble.textContent?.trim() ?? ""
      return text.length > 50 ? text.slice(0, 50) + "..." : text
    }
  }

  return "Grok Conversation"
}
