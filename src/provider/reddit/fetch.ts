import { setTimeout } from "node:timers/promises"
import type { ParseOptions } from "../../types"
import type { redditTarget } from "./url"
import { readResponseText } from "../../security/body"
import { fetchResource } from "../../security/fetch"
import { mergeSignals } from "../../shared"
import { parseRedditFeed } from "./feed"

export const fetchRedditPost = async (target: ReturnType<typeof redditTarget>, options: ParseOptions = {}) => {
  const signal = mergeSignals(options.timeoutMs ?? 120000, options.signal)
  const request = { signal, headers: { "User-Agent": options.userAgent ?? "rdrr/1.0 (reader; https://rdrr.app)" } }
  for (let attempt = 0; ; attempt++) {
    try {
      const xml = await readFeed(await fetchResource(target.feedUrl, request))
      signal.throwIfAborted()
      const post = parseRedditFeed(xml, target.id, target.commentId)
      signal.throwIfAborted()
      return post
    } catch (error) {
      signal.throwIfAborted()
      if (attempt >= 2 || !canRetry(error)) throw error
      const delay = error instanceof Error && "retryMs" in error ? Number(error.retryMs) : 1000 * (attempt + 1)
      await waitBeforeRetry(delay, signal)
    }
  }
}

const waitBeforeRetry = async (delay: number, signal: AbortSignal): Promise<void> => {
  try {
    await setTimeout(delay, undefined, { signal })
  } catch (error) {
    signal.throwIfAborted()
    throw error
  }
}

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
])

const canRetry = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  if (error.name === "RedditFeedError") return true
  if ("status" in error) return TRANSIENT_STATUSES.has(Number(error.status))
  if (error instanceof TypeError && error.message === "terminated") return true
  const cause = error.cause instanceof Error ? error.cause : error
  return "code" in cause && TRANSIENT_CODES.has(String(cause.code))
}

const retryDelay = (headers: Headers, fallback: number): number => {
  const retryAfter = headers.get("retry-after")
  const retrySeconds = retryAfter ? Number(retryAfter) : NaN
  const retryDate = retryAfter && !Number.isFinite(retrySeconds) ? Date.parse(retryAfter) : NaN
  const resetSeconds = Number(headers.get("x-ratelimit-reset") ?? NaN)
  const candidates = [
    Number.isFinite(retrySeconds) ? retrySeconds * 1000 : Math.max(0, retryDate - Date.now()),
    resetSeconds * 1000,
  ].filter((value) => Number.isFinite(value) && value >= 0)
  return candidates.length ? Math.min(Math.max(...candidates) + 1000, 2147483647) : fallback
}

const readFeed = async (response: Response): Promise<string> => {
  if (!response.ok) {
    await response.body?.cancel()
    const message =
      response.status === 429
        ? "Reddit RSS rate limit reached (429). Retry later or use an authenticated Reddit API client."
        : `Reddit RSS returned ${response.status}. The post may be unavailable or Reddit may block this network.`
    throw Object.assign(new Error(message), {
      status: response.status,
      retryMs: retryDelay(response.headers, response.status === 429 ? 61000 : 1000),
    })
  }
  if (!response.headers.get("content-type")?.includes("xml")) {
    await response.body?.cancel()
    throw new Error("Reddit returned a login or block page instead of its public feed.")
  }
  return readResponseText(response)
}
