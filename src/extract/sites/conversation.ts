import type { ConversationMessage, SiteExtractorResult } from "./types"

export const buildConversationHtml = (messages: ConversationMessage[]): string =>
  messages
    .map((msg, i) => {
      const hasParagraphs = /<p[^>]*>[\s\S]*?<\/p>/i.test(msg.content)
      const contentHtml = hasParagraphs ? msg.content : `<p>${msg.content}</p>`

      return `<div class="message message-${msg.author.toLowerCase()}"${msg.role ? ` data-role="${msg.role}"` : ""}>
<div class="message-header"><p class="message-author"><strong>${msg.author}</strong></p></div>
<div class="message-content">${contentHtml}</div>
</div>${i < messages.length - 1 ? "\n<hr>" : ""}`
    })
    .join("\n")
    .trim()

export const conversationResult = (
  title: string,
  site: string,
  messages: ConversationMessage[],
  contentHtml: string,
): SiteExtractorResult => ({
  content: contentHtml,
  contentHtml,
  variables: {
    title,
    site,
    description: `${site} conversation with ${messages.length} messages`,
  },
})
