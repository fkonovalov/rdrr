import type { ParseOptions, WebpageResult } from "../../types"
import { countHtmlWords } from "../../extract/cleanup"
import { toMarkdown } from "../../extract/markdown"
import { estimateReadTime, safeDomain } from "../../shared"
import { fetchRedditPost } from "./fetch"
import { redditTarget } from "./url"

export const parseReddit = async (url: string, options?: ParseOptions): Promise<WebpageResult> => {
  const post = await fetchRedditPost(redditTarget(url), options)
  const content = toMarkdown(post.contentHtml, url)
  const wordCount = countHtmlWords(post.contentHtml)
  return {
    type: "webpage",
    title: post.title,
    author: post.author,
    published: post.published,
    siteName: post.siteName,
    description: "",
    domain: safeDomain(url),
    content,
    wordCount,
    readTime: estimateReadTime(wordCount, options?.wordsPerMinute),
  }
}
