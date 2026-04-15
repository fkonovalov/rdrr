import type { CommentData } from "../utils/comments"
import type { SiteExtractor } from "./types"
import { buildCommentTree, buildContentHtml } from "../utils/comments"
import { parseHTML, serializeHTML } from "../utils/dom"
import { registerSite } from "./registry"

registerSite({
  patterns: ["github.com", /^https?:\/\/github\.com\/.*/],
  create: (doc, url) => {
    const isGitHub = [
      'meta[name="expected-hostname"][content="github.com"]',
      'meta[name="octolytics-url"]',
      ".js-header-wrapper",
      "#js-repo-pjax-container",
    ].some((s) => doc.querySelector(s) !== null)

    const isIssue = /\/issues\/\d+/.test(url)
    const isPR = /\/pull\/\d+/.test(url)
    const canMatch = isGitHub && (isIssue || isPR)

    return {
      canExtract: () => {
        if (!canMatch) return false
        if (isIssue) {
          return ['[data-testid="issue-metadata-sticky"]', '[data-testid="issue-title"]'].some(
            (s) => doc.querySelector(s) !== null,
          )
        }
        return [".pull-discussion-timeline", ".discussion-timeline", ".gh-header-title", ".js-issue-title"].some(
          (s) => doc.querySelector(s) !== null,
        )
      },
      extract: () => {
        const repoInfo = extractRepoInfo(url, doc)
        const prBody = isPR ? getPRBody(doc) : null

        const { content: postContent, author, published } = isPR ? getPRContent(doc, prBody) : getIssueContent(doc)

        const comments = isPR ? extractPRComments(doc, prBody) : extractIssueComments(doc)
        const contentHtml = buildContentHtml("github", postContent, comments)

        return {
          content: contentHtml,
          contentHtml,
          variables: {
            title: doc.title ?? "GitHub Issue",
            author,
            published,
            site: `GitHub - ${repoInfo.owner}/${repoInfo.repo}`,
            description: createDescription(doc, contentHtml),
          },
        }
      },
    } satisfies SiteExtractor
  },
})

const AUTHOR_SELECTORS_ISSUE = [
  'a[data-testid="issue-body-header-author"]',
  'a[href*="/users/"][data-hovercard-url*="/users/"]',
  'a[aria-label*="profile"]',
]

const AUTHOR_SELECTORS_COMMENT = ['a[data-testid="avatar-link"]', 'a[href^="/"][data-hovercard-url*="/users/"]']

const extractAuthor = (container: Element, selectors: string[]): string => {
  for (const selector of selectors) {
    const el = container.querySelector(selector)
    if (el) {
      const href = el.getAttribute("href")
      if (href?.startsWith("/")) return href.substring(1)
      if (href?.includes("github.com/")) {
        const match = href.match(/github\.com\/([^/?#]+)/)
        if (match?.[1]) return match[1]
      }
    }
  }
  return "Unknown"
}

const cleanBodyContent = (doc: Document, bodyElement: Element): string => {
  const clean = bodyElement.cloneNode(true) as Element
  for (const el of clean.querySelectorAll('button, [data-testid*="button"], [data-testid*="menu"]')) {
    el.remove()
  }
  for (const el of clean.querySelectorAll(".js-clipboard-copy, .zeroclipboard-container")) {
    el.remove()
  }

  // Convert GitHub's highlighted code blocks to standard <pre><code>
  for (const pre of clean.querySelectorAll('div.highlight[class*="highlight-source-"] pre, div.highlight pre')) {
    const wrapper = pre.parentElement
    if (!wrapper) continue
    const langMatch = wrapper.className.match(/highlight-source-(\w+)/)
    const lang = langMatch?.[1] ?? ""
    const content = wrapper.getAttribute("data-snippet-clipboard-copy-content") ?? pre.textContent ?? ""

    const code = doc.createElement("code")
    if (lang) {
      code.setAttribute("class", `language-${lang}`)
      code.setAttribute("data-lang", lang)
    }
    code.textContent = content

    const newPre = doc.createElement("pre")
    newPre.appendChild(code)
    wrapper.replaceWith(newPre)
  }

  return serializeHTML(clean).trim()
}

const getIssueContent = (doc: Document): { content: string; author: string; published: string } => {
  const container = doc.querySelector('[data-testid="issue-viewer-issue-container"]')
  if (!container) return { content: "", author: "", published: "" }

  const author = extractAuthor(container, AUTHOR_SELECTORS_ISSUE)
  const published = container.querySelector("relative-time")?.getAttribute("datetime") ?? ""
  const bodyEl = container.querySelector('[data-testid="issue-body-viewer"] .markdown-body')
  const content = bodyEl ? cleanBodyContent(doc, bodyEl) : ""

  return { content, author, published }
}

const extractIssueComments = (doc: Document): string => {
  const commentElements = Array.from(doc.querySelectorAll("[data-wrapper-timeline-id]"))
  const processedIds = new Set<string>()
  const commentData: CommentData[] = []

  for (const el of commentElements) {
    const container = el.querySelector(".react-issue-comment")
    if (!container) continue

    const commentId = el.getAttribute("data-wrapper-timeline-id")
    if (!commentId || processedIds.has(commentId)) continue
    processedIds.add(commentId)

    const author = extractAuthor(container, AUTHOR_SELECTORS_COMMENT)
    const timestamp = container.querySelector("relative-time")?.getAttribute("datetime") ?? ""
    const date = timestamp ? new Date(timestamp).toISOString().split("T")[0]! : ""

    const bodyEl = container.querySelector(".markdown-body")
    if (!bodyEl) continue
    const content = cleanBodyContent(doc, bodyEl)
    if (!content) continue

    commentData.push({ author, date, content })
  }

  return buildCommentTree(commentData)
}

const getPRBody = (doc: Document): Element | null =>
  doc.querySelector('[id^="pullrequest-"]') ?? doc.querySelector(".timeline-comment")

const getPRContent = (
  doc: Document,
  prBody: Element | null,
): { content: string; author: string; published: string } => {
  const bodyEl =
    prBody?.querySelector(".comment-body.markdown-body") ?? doc.querySelector(".comment-body.markdown-body")
  const content = bodyEl ? cleanBodyContent(doc, bodyEl) : ""
  const authorEl = prBody?.querySelector(".author") ?? doc.querySelector(".gh-header-meta .author")
  const author = authorEl?.textContent?.trim() ?? ""
  const published = prBody?.querySelector("relative-time")?.getAttribute("datetime") ?? ""
  return { content, author, published }
}

const extractPRComments = (doc: Document, prBody: Element | null): string => {
  const allComments = Array.from(doc.querySelectorAll(".timeline-comment, .review-comment"))
  const commentData: CommentData[] = []

  for (const comment of allComments) {
    if (prBody && (comment === prBody || prBody.contains(comment))) continue

    const author = comment.querySelector(".author")?.textContent?.trim() ?? ""
    const timestamp = comment.querySelector("relative-time")?.getAttribute("datetime") ?? ""
    const date = timestamp ? new Date(timestamp).toISOString().split("T")[0]! : ""
    const bodyEl = comment.querySelector(".comment-body.markdown-body")
    if (!bodyEl) continue
    const content = cleanBodyContent(doc, bodyEl)
    if (!content) continue

    commentData.push({ author, date, content })
  }

  return buildCommentTree(commentData)
}

const extractRepoInfo = (url: string, doc: Document): { owner: string; repo: string } => {
  const urlMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (urlMatch) return { owner: urlMatch[1]!, repo: urlMatch[2]! }
  const titleMatch = doc.title?.match(/([^/\s]+)\/([^/\s]+)/)
  return titleMatch ? { owner: titleMatch[1]!, repo: titleMatch[2]! } : { owner: "", repo: "" }
}

const createDescription = (doc: Document, content: string): string => {
  if (!content) return ""
  const tempDiv = doc.createElement("div")
  tempDiv.appendChild(parseHTML(doc, content))
  return tempDiv.textContent?.trim().slice(0, 140).replace(/\s+/g, " ") ?? ""
}
