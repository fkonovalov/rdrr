import { sanitizeHtmlFragment } from "../../extract/cleanup"
import { buildCommentTree, buildContentHtml } from "../../extract/utils/comments"
import { escapeHtml } from "../../extract/utils/dom"
import { parseLinkedomHTML } from "../../extract/utils/parse-html"
import { invalidFeed, parseFeedXml } from "./xml"

export const parseRedditFeed = (xml: string, id: string, commentId?: string) => {
  const feed = parseFeedXml(xml)
  const entries = Array.from(feed.querySelectorAll("feed > entry"))
  const post = entries.find((entry) => entry.querySelector("id")?.textContent === `t3_${id}`)
  if (!post) throw new Error(`Reddit feed did not contain post ${id}. It may be private, removed, or unavailable.`)

  const doc = parseLinkedomHTML("")
  const title = post.querySelector("title")?.textContent?.trim() ?? ""
  if (!title) throw new Error(`Reddit post ${id} has no title`)
  const body = entryBody(doc, post) || `<p>${escapeHtml(title)}</p>`
  const comments = entries.filter((entry) => entry.querySelector("id")?.textContent?.startsWith("t1_"))
  if (commentId && !comments.some((entry) => entry.querySelector("id")?.textContent === `t1_${commentId}`)) {
    throw new Error(`Reddit feed did not contain comment ${commentId}. It may be removed or unavailable.`)
  }
  const commentHtml = buildCommentTree(
    comments.map((entry) => ({
      author: entry.querySelector("author > name")?.textContent ?? "[deleted]",
      date: (entry.querySelector("published")?.textContent ?? entry.querySelector("updated")?.textContent ?? "").slice(
        0,
        10,
      ),
      content: entryBody(doc, entry),
      url: entry.querySelector("link")?.getAttribute("href") ?? undefined,
    })),
  )
  const note = comments.length ? "<p>Comments from Reddit's public feed; the full thread may contain more.</p>" : ""
  return {
    title,
    author: post.querySelector("author > name")?.textContent ?? "[deleted]",
    published: post.querySelector("published")?.textContent ?? post.querySelector("updated")?.textContent ?? null,
    siteName: post.querySelector("category")?.getAttribute("label") ?? "Reddit",
    contentHtml: buildContentHtml("reddit", body, note + commentHtml),
  }
}

const entryBody = (doc: Document, entry: Element): string => {
  const content = entry.querySelector("content")
  if (!content) throw invalidFeed("entry is missing content")
  const container = doc.createElement("div")
  container.innerHTML = sanitizeHtmlFragment(doc, content.textContent ?? "")
  const body = container.querySelector(".md")
  if (!body) return container.innerHTML
  const link = Array.from(container.querySelectorAll("a")).find(
    (anchor) => anchor.textContent === "[link]" && !anchor.closest(".md"),
  )
  if (link && link.getAttribute("href") !== entry.querySelector("link")?.getAttribute("href")) {
    link.textContent = entry.querySelector("title")?.textContent ?? "View post"
    const image = container.querySelector("img")?.outerHTML ?? ""
    return body.outerHTML + image + link.outerHTML
  }
  return body.outerHTML
}
