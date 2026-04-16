import type { CommentData } from "../utils/comments"
import type { SiteExtractor, SiteExtractorResult } from "./types"
import { buildCommentTree, buildContentHtml } from "../utils/comments"
import { parseHTML, serializeHTML } from "../utils/dom"
import { registerSite } from "./registry"

registerSite({
  patterns: ["reddit.com", "old.reddit.com", "new.reddit.com", /^https:\/\/[^/]+\.reddit\.com/],
  create: (doc, url) => {
    const shredditPost = doc.querySelector("shreddit-post")
    const isOldReddit = !!doc.querySelector(".thing.link")
    const isComments = /\/r\/.+\/comments\//.test(url)

    const canExtract = (): boolean => !!shredditPost || isOldReddit

    const canExtractAsync = (): boolean => isComments && !isOldReddit

    const extractAsync = async (): Promise<SiteExtractorResult> => {
      const oldUrl = new URL(url)
      oldUrl.hostname = "old.reddit.com"

      const response = await fetch(oldUrl.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; rdrr/1.0)" },
      })
      if (!response.ok) throw new Error(`Failed to fetch old.reddit.com: ${response.status}`)

      const html = await response.text()
      const Parser = doc.defaultView?.DOMParser ?? (typeof DOMParser !== "undefined" ? DOMParser : null)
      if (!Parser) throw new Error("DOMParser is not available")
      const parsed = new Parser().parseFromString(html, "text/html")
      return extractOldReddit(parsed)
    }

    const extract = (): SiteExtractorResult => {
      if (isOldReddit) return extractOldReddit(doc)

      const postTitle = doc.querySelector("h1")?.textContent?.trim() ?? ""
      const subreddit = url.match(/\/r\/([^/]+)/)?.[1] ?? ""
      const postAuthor = shredditPost?.getAttribute("author") ?? ""

      const textBodyEl = shredditPost?.querySelector('[slot="text-body"]')
      const textBody = textBodyEl ? serializeHTML(textBodyEl) : ""
      const mediaBody = shredditPost?.querySelector("#post-image")?.outerHTML ?? ""
      const postContent = textBody + mediaBody

      const comments = extractShredditComments(doc)
      const contentHtml = buildContentHtml("reddit", postContent, comments)
      const description = createDescription(doc, postContent)

      return {
        content: contentHtml,
        contentHtml,
        variables: {
          title: postTitle || "Reddit Post",
          author: postAuthor,
          site: subreddit ? `r/${subreddit}` : "Reddit",
          description,
        },
      }
    }

    return { canExtract, extract, canExtractAsync, extractAsync } satisfies SiteExtractor
  },
})

const extractOldReddit = (root: Document | Element): SiteExtractorResult => {
  const thingLink = root.querySelector(".thing.link")
  const postTitle = thingLink?.querySelector("a.title")?.textContent?.trim() ?? ""
  const postAuthor = thingLink?.getAttribute("data-author") ?? ""
  const subreddit = thingLink?.getAttribute("data-subreddit") ?? ""
  const postBodyEl = thingLink?.querySelector(".usertext-body .md")
  const postBody = postBodyEl ? serializeHTML(postBodyEl) : ""

  const commentArea = root.querySelector(".commentarea .sitetable")
  const commentData = commentArea ? collectOldRedditComments(commentArea, 0) : []
  const comments = commentData.length > 0 ? buildCommentTree(commentData) : ""

  const contentHtml = buildContentHtml("reddit", postBody, comments)

  return {
    content: contentHtml,
    contentHtml,
    variables: {
      title: postTitle || "Reddit Post",
      author: postAuthor,
      site: subreddit ? `r/${subreddit}` : "Reddit",
      description: "",
    },
  }
}

const collectOldRedditComments = (container: Element, depth: number): CommentData[] => {
  const result: CommentData[] = []

  for (const comment of container.querySelectorAll(":scope > .thing.comment")) {
    const author = comment.getAttribute("data-author") ?? ""
    const permalink = comment.getAttribute("data-permalink") ?? ""
    const score = comment.querySelector(".entry .tagline .score.unvoted")?.textContent?.trim() ?? ""
    const timeEl = comment.querySelector(".entry .tagline time[datetime]")
    const datetime = timeEl?.getAttribute("datetime") ?? ""
    const date = datetime ? new Date(datetime).toISOString().split("T")[0]! : ""
    const bodyEl = comment.querySelector(".entry .usertext-body .md")
    const body = bodyEl ? serializeHTML(bodyEl) : ""

    result.push({
      author,
      date,
      content: body,
      depth,
      score: score || undefined,
      url: permalink ? `https://reddit.com${permalink}` : undefined,
    })

    const childContainer = comment.querySelector(".child > .sitetable")
    if (childContainer) {
      result.push(...collectOldRedditComments(childContainer, depth + 1))
    }
  }

  return result
}

const extractShredditComments = (doc: Document): string => {
  const comments = Array.from(doc.querySelectorAll("shreddit-comment"))
  if (comments.length === 0) return ""

  const commentData: CommentData[] = []

  for (const comment of comments) {
    const depth = parseInt(comment.getAttribute("depth") ?? "0", 10)
    const author = comment.getAttribute("author") ?? ""
    const score = comment.getAttribute("score") ?? "0"
    const permalink = comment.getAttribute("permalink") ?? ""
    const commentEl = comment.querySelector('[slot="comment"]')
    const content = commentEl ? serializeHTML(commentEl) : ""

    const timestamp = comment.getAttribute("created") ?? comment.querySelector("time")?.getAttribute("datetime") ?? ""
    const date = timestamp ? new Date(timestamp).toISOString().split("T")[0]! : ""

    commentData.push({
      author,
      date,
      content,
      depth,
      score: `${score} points`,
      url: permalink ? `https://reddit.com${permalink}` : undefined,
    })
  }

  return buildCommentTree(commentData)
}

const createDescription = (doc: Document, postContent: string): string => {
  if (!postContent) return ""
  const tempDiv = doc.createElement("div")
  tempDiv.appendChild(parseHTML(doc, postContent))
  return tempDiv.textContent?.trim().slice(0, 140).replace(/\s+/g, " ") ?? ""
}
