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
  const name = sanitizeInlineText(rawName)
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

/**
 * Validate and sanitize a URL before interpolating it into a markdown link target.
 *
 * Returns `null` for any input that:
 *   - isn't a syntactically valid absolute URL
 *   - uses a protocol other than `http:` or `https:` (blocks `javascript:`, `data:`, etc.)
 *
 * Otherwise returns the URL with `)` and whitespace percent-encoded so the link
 * cannot be terminated early and subsequent bytes cannot leak into the surrounding
 * markdown. This is the single gate every URL from the upstream API must pass
 * through before reaching the output.
 */
const safeUrl = (raw: string): string | null => {
  if (!raw) return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  return parsed.toString().replace(/\)/g, "%29").replace(/\s/g, "%20")
}

/**
 * Escape characters that would otherwise hijack Markdown rendering.
 * Conservative: only the handful that can break out of a paragraph or a link construct.
 */
const escapeMarkdown = (s: string): string => s.replace(/([\\`*_[\]])/g, "\\$1")

/**
 * Prepare a free-form string (e.g. display name) for use as inline text in a
 * heading or other single-line position. Drops newlines and leading markdown
 * block markers so an attacker-controlled value cannot open a new block or
 * forge additional structure, then applies the standard inline escape.
 */
const sanitizeInlineText = (s: string): string => {
  const flattened = s
    .replace(/[\r\n]+/g, " ")
    .replace(/^[\s#>*-]+/, "")
    .trim()
  return escapeMarkdown(flattened)
}

const formatDate = (d: Date): string => {
  const yyyy = d.getUTCFullYear()
  const mm = pad(d.getUTCMonth() + 1)
  const dd = pad(d.getUTCDate())
  const hh = pad(d.getUTCHours())
  const mi = pad(d.getUTCMinutes())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`
}

const pad = (n: number): string => n.toString().padStart(2, "0")

const formatCount = (n: number): string => {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}
