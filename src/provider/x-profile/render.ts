import { escapeMarkdown, formatDate, safeUrl, sanitizeInline } from "../_twitter/render-utils"
import type { NormalizedFacet, NormalizedQuote, NormalizedTweet, ProfileInfo } from "./types"

interface RenderInput {
  profile: ProfileInfo | null
  handle: string
  tweets: NormalizedTweet[]
  requested: number
}

export const renderTimeline = ({ profile, handle, tweets, requested }: RenderInput): string => {
  const parts: string[] = []

  parts.push(renderHeader(profile, handle, tweets.length, requested))

  for (const tweet of tweets) {
    parts.push(renderTweet(tweet))
  }

  return parts.join("\n\n---\n\n").trimEnd() + "\n"
}

const renderHeader = (profile: ProfileInfo | null, handle: string, got: number, requested: number): string => {
  const lines: string[] = []
  const rawName = profile?.name ?? `@${handle}`
  const name = sanitizeInline(rawName)
  lines.push(`# ${name}`)
  lines.push("")

  if (profile) {
    const stats: string[] = [`**@${profile.handle}**`]
    if (profile.followers > 0) stats.push(`${formatCount(profile.followers)} followers`)
    if (profile.statuses > 0) stats.push(`${formatCount(profile.statuses)} posts`)
    lines.push(stats.join(" · "))
    if (profile.description) {
      lines.push("")
      for (const line of profile.description.split("\n")) {
        lines.push(`> ${escapeMarkdown(line)}`)
      }
    }
  } else {
    lines.push(`**@${handle}**`)
  }

  const summary = requested === got ? `Last ${got} posts` : `${got} of last ${requested} posts available`
  lines.push("")
  lines.push(`_${summary}_`)

  return lines.join("\n")
}

const renderTweet = (tweet: NormalizedTweet): string => {
  const lines: string[] = []
  const dateLabel = formatDate(tweet.createdAt)
  const permalink = safeUrl(tweet.permalink)
  lines.push(permalink ? `## [${dateLabel}](${permalink})` : `## ${dateLabel}`)
  lines.push("")

  const context = renderContext(tweet)
  if (context) {
    lines.push(context)
    lines.push("")
  }

  const body = applyFacetsMarkdown(tweet.text, tweet.facets)
  if (body.trim()) lines.push(body)

  if (tweet.quote) {
    lines.push("")
    lines.push(renderQuote(tweet.quote))
  }

  if (tweet.media.length > 0) {
    lines.push("")
    for (const m of tweet.media) {
      const url = safeUrl(m.url)
      if (!url) continue
      if (m.type === "video" || m.type === "gif") {
        lines.push(`[${m.type}](${url})`)
      } else {
        lines.push(`![](${url})`)
      }
    }
  }

  return lines.join("\n").trimEnd()
}

const renderContext = (tweet: NormalizedTweet): string => {
  if (tweet.isRetweet) {
    // FxEmbed `reposted_by` is the account that performed the repost (usually the profile we're listing).
    // The post's own `author` is the ORIGINAL author. So we mark it as a repost of the original.
    return `🔁 Reposted @${tweet.author.handle}:`
  }
  if (tweet.replyTo) {
    return `↪ Reply to @${tweet.replyTo.handle}:`
  }
  return ""
}

const renderQuote = (quote: NormalizedQuote): string => {
  const permalink = safeUrl(quote.permalink)
  const label = `@${quote.author.handle}` // handle is [A-Za-z0-9_]{1,15} per X policy
  const head = permalink ? `> **Quoting [${label}](${permalink})**` : `> **Quoting ${label}**`
  const lines = [head]
  const body = quote.text.trim()
  if (body) {
    lines.push(">")
    for (const line of body.split("\n")) {
      lines.push(`> ${escapeMarkdown(line)}`)
    }
  }
  return lines.join("\n")
}

/**
 * Apply mention/url facets to plain text, producing markdown links.
 * Walks the facets in order, slicing the text and escaping each plain-text segment
 * so that markdown-significant characters inside the tweet don't break rendering.
 */
const applyFacetsMarkdown = (text: string, facets: NormalizedFacet[]): string => {
  if (facets.length === 0) return escapeMarkdown(text)

  let out = ""
  let pos = 0
  for (const f of facets) {
    if (f.start < pos) continue // overlapping facet — skip to keep output well-formed
    if (f.start > pos) out += escapeMarkdown(text.slice(pos, f.start))
    const slice = text.slice(f.start, f.end)
    if (f.type === "mention") {
      out += `[${escapeMarkdown(slice)}](https://x.com/${f.handle})`
    } else {
      const href = safeUrl(f.href)
      const label = f.display || slice
      if (href) {
        out += `[${escapeMarkdown(label)}](${href})`
      } else {
        out += escapeMarkdown(label)
      }
    }
    pos = f.end
  }
  if (pos < text.length) out += escapeMarkdown(text.slice(pos))
  return out
}

const formatCount = (n: number): string => {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}
