import type { SiteExtractor, ConversationMessage } from "./types"
import { serializeHTML } from "../utils/dom"
import { buildConversationHtml, conversationResult } from "./conversation"
import { registerSite } from "./registry"

registerSite({
  patterns: ["claude.ai", /^https?:\/\/claude\.ai\/(chat|share)\/.*/],
  create: (doc) => {
    const articles = doc.querySelectorAll(
      'div[data-testid="user-message"], div[data-testid="assistant-message"], div.font-claude-response',
    )

    const canExtract = (): boolean => articles.length > 0

    const extract = () => {
      const messages = extractMessages(articles)
      const html = buildConversationHtml(messages)
      return conversationResult(getTitle(doc, articles), "Claude", messages, html)
    }

    return { canExtract, extract } satisfies SiteExtractor
  },
})

const extractMessages = (articles: NodeListOf<Element>): ConversationMessage[] => {
  const messages: ConversationMessage[] = []

  for (const article of articles) {
    if (article.getAttribute("data-testid") === "user-message") {
      messages.push({ author: "You", content: serializeHTML(article).replace(/\u200B/g, ""), role: "you" })
    } else if (article.classList.contains("font-claude-response")) {
      const body = article.querySelector(".standard-markdown") ?? article
      messages.push({ author: "Claude", content: serializeHTML(body).replace(/\u200B/g, ""), role: "assistant" })
    }
  }

  return messages
}

const getTitle = (doc: Document, articles: NodeListOf<Element>): string => {
  const pageTitle = doc.title?.trim()
  if (pageTitle && pageTitle !== "Claude") return pageTitle.replace(/ - Claude$/, "")

  const headerTitle = doc.querySelector("header .font-tiempos")?.textContent?.trim()
  if (headerTitle) return headerTitle

  const firstUser = articles.item(0)?.querySelector('[data-testid="user-message"]')
  if (firstUser) {
    const text = firstUser.textContent ?? ""
    return text.length > 50 ? text.slice(0, 50) + "..." : text
  }

  return "Claude Conversation"
}
