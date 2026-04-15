import type { SiteExtractor, ConversationMessage } from "./types"
import { parseHTML, serializeHTML } from "../utils/dom"
import { buildConversationHtml, conversationResult } from "./conversation"
import { registerSite } from "./registry"

interface Footnote {
  url: string
  text: string
}

registerSite({
  patterns: [/^https?:\/\/gemini\.google\.com\/app\/.*/],
  create: (doc) => {
    const containers = doc.querySelectorAll("div.conversation-container")

    return {
      canExtract: () => containers.length > 0,
      extract: () => {
        const footnotes = extractSources(doc)
        const messages = extractMessages(doc, containers)
        const title = getTitle(doc, containers)
        let html = buildConversationHtml(messages)
        if (footnotes.length > 0) {
          const items = footnotes
            .map(
              (fn, i) =>
                `<li id="fn:${i + 1}"><a href="${fn.url}">${fn.text}</a> <a href="#fnref:${i + 1}">\u21a9</a></li>`,
            )
            .join("\n")
          html += `\n<hr>\n<div class="footnotes">\n<ol>\n${items}\n</ol>\n</div>`
        }
        return conversationResult(title, "Gemini", messages, html)
      },
    } satisfies SiteExtractor
  },
})

const extractSources = (doc: Document): Footnote[] => {
  const footnotes: Footnote[] = []
  for (const item of doc.querySelectorAll("browse-item")) {
    const link = item.querySelector("a") as HTMLAnchorElement | null
    if (!link) continue
    const url = link.href ?? link.getAttribute("href") ?? ""
    const domain = link.querySelector(".domain")?.textContent?.trim() ?? ""
    const title = link.querySelector(".title")?.textContent?.trim() ?? ""
    if (url && (domain || title)) {
      footnotes.push({ url, text: title ? `${domain}: ${title}` : domain })
    }
  }
  return footnotes
}

const extractMessages = (doc: Document, containers: NodeListOf<Element>): ConversationMessage[] => {
  const messages: ConversationMessage[] = []

  for (const container of containers) {
    const userQuery = container.querySelector("user-query")
    if (userQuery) {
      const queryText = userQuery.querySelector(".query-text")
      if (queryText) {
        messages.push({ author: "You", content: serializeHTML(queryText).trim(), role: "user" })
      }
    }

    const modelResponse = container.querySelector("model-response")
    if (modelResponse) {
      const extendedContent = modelResponse.querySelector("#extended-response-markdown-content")
      const regularContent = modelResponse.querySelector(".model-response-text .markdown")
      const contentElement = extendedContent ?? regularContent
      if (contentElement) {
        let content = serializeHTML(contentElement)

        // Preserve table-content class (Gemini uses it for actual tables,
        // but it matches the partial selector for "table of contents")
        const tempDiv = doc.createElement("div")
        tempDiv.appendChild(parseHTML(doc, content))
        for (const el of tempDiv.querySelectorAll(".table-content")) {
          el.classList.remove("table-content")
        }
        content = serializeHTML(tempDiv)

        messages.push({ author: "Gemini", content: content.trim(), role: "assistant" })
      }
    }
  }

  return messages
}

const getTitle = (doc: Document, containers: NodeListOf<Element>): string => {
  const pageTitle = doc.title?.trim()
  if (pageTitle && pageTitle !== "Gemini" && !pageTitle.includes("Gemini")) return pageTitle

  const researchTitle = doc.querySelector(".title-text")?.textContent?.trim()
  if (researchTitle) return researchTitle

  const firstQuery = containers.item(0)?.querySelector(".query-text")
  if (firstQuery) {
    const text = firstQuery.textContent ?? ""
    return text.length > 50 ? text.slice(0, 50) + "..." : text
  }

  return "Gemini Conversation"
}
