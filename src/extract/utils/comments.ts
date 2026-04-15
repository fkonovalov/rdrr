import { escapeHtml, isDangerousUrl } from "./dom"

export interface CommentData {
  author: string
  date: string
  content: string
  depth?: number
  score?: string
  url?: string
}

export const buildContentHtml = (site: string, postContent: string, comments: string): string =>
  `<div class="${site} post"><div class="post-content">${postContent}</div></div>${
    comments ? `\n<hr>\n<div class="${site} comments"><h2>Comments</h2>${comments}</div>` : ""
  }`

export const buildCommentTree = (comments: CommentData[]): string => {
  const parts: string[] = []
  const stack: number[] = []

  for (const comment of comments) {
    const depth = comment.depth ?? 0

    if (depth === 0) {
      while (stack.length > 0) {
        parts.push("</blockquote>")
        stack.pop()
      }
      parts.push("<blockquote>")
      stack.push(0)
    } else {
      const current = stack.at(-1) ?? -1
      if (depth < current) {
        while (stack.length > 0 && (stack.at(-1) ?? -1) >= depth) {
          parts.push("</blockquote>")
          stack.pop()
        }
      }
      if (depth > (stack.at(-1) ?? -1)) {
        parts.push("<blockquote>")
        stack.push(depth)
      }
    }

    parts.push(buildComment(comment))
  }

  while (stack.length > 0) {
    parts.push("</blockquote>")
    stack.pop()
  }
  return parts.join("")
}

export const buildComment = (comment: CommentData): string => {
  const author = `<span class="comment-author"><strong>${escapeHtml(comment.author)}</strong></span>`
  const safeUrl = comment.url && !isDangerousUrl(comment.url) ? comment.url : ""
  const dateHtml = safeUrl
    ? `<a href="${escapeHtml(safeUrl)}" class="comment-link">${escapeHtml(comment.date)}</a>`
    : `<span class="comment-date">${escapeHtml(comment.date)}</span>`
  const scoreHtml = comment.score ? ` · <span class="comment-points">${escapeHtml(comment.score)}</span>` : ""

  return `<div class="comment">
<div class="comment-metadata">${author} · ${dateHtml}${scoreHtml}</div>
<div class="comment-content">${comment.content}</div>
</div>`
}
