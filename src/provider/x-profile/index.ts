import { countWords, estimateReadTime } from "@shared"
import type { ParseOptions, XProfileResult } from "../../types"
import type { NormalizedTweet, ProfileInfo } from "./types"
import { extractXHandle } from "../../detect"
import { fetchProfile, fetchStatuses } from "./fetch"
import { normalizeProfile, normalizeStatus } from "./normalize"
import { renderTimeline } from "./render"

const DEFAULT_LIMIT = 10
// Hard ceiling on cursor-pagination iterations — protects against runaway loops
// or unexpectedly deep tails. Each page yields ~18-22 tweets, so 50 pages caps
// a single request at ~1000 tweets in practice.
const MAX_PAGES = 50

export const parseXProfile = async (url: string, options?: ParseOptions): Promise<XProfileResult> => {
  const handle = extractXHandle(url)
  if (!handle) throw new Error(`Invalid X profile URL: ${url}`)

  const requested = clampLimit(options?.limit)
  const order = options?.order ?? "newest"

  const [profileRes, statusesRes] = await Promise.all([
    fetchProfile(handle),
    fetchStatuses(handle, requested, MAX_PAGES),
  ])

  const profile: ProfileInfo | null = profileRes?.user ? normalizeProfile(profileRes.user) : null

  const tweets: NormalizedTweet[] = statusesRes.statuses.map(normalizeStatus)
  const sorted = sortTweets(tweets, order)
  const selected = sorted.slice(0, requested)

  const content = renderTimeline({ profile, handle, tweets: selected, requested })

  const title = buildTitle(profile, handle, selected.length, requested)
  const wordCount = countWords(content)
  const published = selected.length > 0 ? isoDate(selected[0]!.createdAt) : null
  const description = profile?.description ?? ""

  return {
    type: "x-profile",
    title,
    author: `@${handle}`,
    content,
    description,
    domain: "x.com",
    siteName: "X (Twitter)",
    published,
    wordCount,
    readTime: estimateReadTime(wordCount, options?.wordsPerMinute),
    handle,
    postCount: selected.length,
  }
}

const clampLimit = (requested: number | undefined): number => {
  if (requested === undefined) return DEFAULT_LIMIT
  if (!Number.isFinite(requested) || requested < 1) return DEFAULT_LIMIT
  return Math.floor(requested)
}

const sortTweets = (tweets: NormalizedTweet[], order: "newest" | "oldest"): NormalizedTweet[] => {
  const copy = [...tweets]
  copy.sort((a, b) =>
    order === "newest" ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime(),
  )
  return copy
}

const buildTitle = (profile: ProfileInfo | null, handle: string, got: number, requested: number): string => {
  // Flatten and strip markdown-breakout characters: the title ends up inside a
  // YAML frontmatter double-quoted string (where CLI's `esc` only handles `"` and `\n`)
  // AND inside the rendered markdown body, so it must be safe for both.
  const rawName = profile?.name ?? `@${handle}`
  const name =
    rawName
      .replace(/[\r\n]+/g, " ")
      .replace(/[[\]\\`*_]/g, "")
      .trim() || `@${handle}`
  const suffix = got === requested ? `— last ${got}` : `— ${got} of last ${requested}`
  return `${name} (@${handle}) ${suffix}`
}

const isoDate = (d: Date): string => {
  const s = d.toISOString()
  return s.slice(0, 10)
}
