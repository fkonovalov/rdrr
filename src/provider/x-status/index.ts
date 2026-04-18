import { countWords, estimateReadTime } from "@shared"
import type { ParseOptions, XStatusResult } from "../../types"
import { extractXStatus } from "../../detect"
import { fetchStatus } from "./fetch"
import { renderStatus } from "./render"

export const parseXStatus = async (url: string, options?: ParseOptions): Promise<XStatusResult> => {
  const ref = extractXStatus(url)
  if (!ref) throw new Error(`Invalid X status URL: ${url}`)

  const { status, source } = await fetchStatus(ref.handle, ref.id, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
    userAgent: options?.userAgent,
  })

  const content = renderStatus(status)
  const wordCount = countWords(content)
  const title = `${status.author.name} (@${status.author.handle})`.trim()
  const description = status.text.replace(/\s+/g, " ").trim().slice(0, 200)

  return {
    type: "x-status",
    title,
    author: `@${status.author.handle}`,
    content,
    description,
    domain: "x.com",
    siteName: "X (Twitter)",
    language: status.lang,
    published: status.createdAt.toISOString().slice(0, 10),
    wordCount,
    readTime: estimateReadTime(wordCount, options?.wordsPerMinute),
    handle: status.author.handle,
    statusId: status.id,
    source,
  }
}
