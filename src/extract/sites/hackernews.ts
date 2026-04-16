import type { CommentData } from "../utils/comments"
import type { SiteExtractor } from "./types"
import { buildComment, buildCommentTree, buildContentHtml } from "../utils/comments"
import { serializeHTML } from "../utils/dom"
import { registerSite } from "./registry"

registerSite({
  patterns: [/news\.ycombinator\.com\/item\?id=.*/],
  create: (doc) => {
    const fatitem = doc.querySelector(".fatitem")
    const isCommentPage = !!fatitem?.querySelector(".onstory") && !fatitem?.querySelector(".titleline")
    const mainComment = isCommentPage ? (fatitem?.querySelector("tr.athing") ?? null) : null

    return {
      canExtract: () => !!fatitem,
      extract: () => {
        const postContent = getPostContent(fatitem, isCommentPage, mainComment)
        const comments = extractComments(doc)
        const contentHtml = buildContentHtml("hackernews", postContent, comments)
        const postTitle = getPostTitle(fatitem, isCommentPage, mainComment)
        const postAuthor = fatitem?.querySelector(".hnuser")?.textContent?.trim() ?? ""
        const published = getPostDate(fatitem)

        return {
          content: contentHtml,
          contentHtml,
          variables: {
            title: postTitle || "Hacker News",
            author: postAuthor,
            site: "Hacker News",
            description: isCommentPage
              ? `Comment by ${postAuthor} on Hacker News`
              : `${postTitle} - by ${postAuthor} on Hacker News`,
            published,
          },
        }
      },
    } satisfies SiteExtractor
  },
})

const getPostContent = (fatitem: Element | null, isCommentPage: boolean, mainComment: Element | null): string => {
  if (!fatitem) return ""

  if (isCommentPage && mainComment) {
    const author = mainComment.querySelector(".hnuser")?.textContent ?? "[deleted]"
    const commtext = mainComment.querySelector(".commtext")
    const commentText = commtext ? serializeHTML(commtext) : ""
    const timestamp = mainComment.querySelector(".age")?.getAttribute("title") ?? ""
    const date = timestamp.split("T")[0] ?? ""
    const points = mainComment.querySelector(".score")?.textContent?.trim() ?? ""

    return buildComment({
      author,
      date,
      content: commentText,
      score: points || undefined,
    })
  }

  const titleRow = fatitem.querySelector("tr.athing")
  const linkUrl = titleRow?.querySelector(".titleline a")?.getAttribute("href") ?? ""

  let content = ""
  if (linkUrl && !linkUrl.startsWith("item?")) {
    content += `<p><a href="${linkUrl}" target="_blank">${linkUrl}</a></p>`
  }

  const text = fatitem.querySelector(".toptext")
  if (text) content += `<div class="post-text">${serializeHTML(text)}</div>`

  return content
}

const extractComments = (doc: Document): string => {
  const comments = Array.from(doc.querySelectorAll("tr.comtr"))
  if (comments.length === 0) return ""

  const commentData: CommentData[] = []
  const processedIds = new Set<string>()

  for (const comment of comments) {
    const id = comment.getAttribute("id")
    if (!id || processedIds.has(id)) continue
    processedIds.add(id)

    const indent = comment.querySelector(".ind img")?.getAttribute("width") ?? "0"
    const depth = parseInt(indent, 10) / 40
    const commentText = comment.querySelector(".commtext")
    const author = comment.querySelector(".hnuser")?.textContent ?? "[deleted]"
    const timeElement = comment.querySelector(".age")
    const points = comment.querySelector(".score")?.textContent?.trim() ?? ""

    if (!commentText) continue

    const timestamp = timeElement?.getAttribute("title") ?? ""
    const date = timestamp.split("T")[0] ?? ""

    commentData.push({
      author,
      date,
      content: serializeHTML(commentText),
      depth,
      score: points || undefined,
      url: `https://news.ycombinator.com/item?id=${id}`,
    })
  }

  return buildCommentTree(commentData)
}

const getPostTitle = (fatitem: Element | null, isCommentPage: boolean, mainComment: Element | null): string => {
  if (isCommentPage && mainComment) {
    const author = mainComment.querySelector(".hnuser")?.textContent ?? "[deleted]"
    const commentText = mainComment.querySelector(".commtext")?.textContent ?? ""
    const preview = commentText.trim().slice(0, 50) + (commentText.length > 50 ? "..." : "")
    return `Comment by ${author}: ${preview}`
  }
  return fatitem?.querySelector(".titleline")?.textContent?.trim() ?? ""
}

const getPostDate = (fatitem: Element | null): string => {
  if (!fatitem) return ""
  const timestamp = fatitem.querySelector(".age")?.getAttribute("title") ?? ""
  return timestamp.split("T")[0] ?? ""
}
