import { escapeMarkdown, formatDate, safeUrl, sanitizeInline } from "../_twitter/render-utils"
import type { NormalizedFacet, NormalizedQuote, NormalizedStatus } from "./types"

export const renderStatus = (status: NormalizedStatus): string => {
  const lines: string[] = []
  const permalink = safeUrl(status.permalink)
  const dateLabel = formatDate(status.createdAt)

  lines.push(`# ${sanitizeInline(status.author.name)} (@${status.author.handle})`)
  lines.push("")
  lines.push(permalink ? `_[${dateLabel}](${permalink})_` : `_${dateLabel}_`)

  if (status.replyTo) {
    lines.push("")
    lines.push(`↪ Reply to @${status.replyTo.handle}`)
  }

  const body = applyFacets(status.text, status.facets)
  if (body.trim()) {
    lines.push("")
    lines.push(body)
  }

  if (status.quote) {
    lines.push("")
    lines.push(renderQuote(status.quote))
  }

  if (status.media.length > 0) {
    lines.push("")
    for (const m of status.media) {
      const url = safeUrl(m.url)
      if (!url) continue
      if (m.type === "video" || m.type === "gif") lines.push(`[${m.type}](${url})`)
      else lines.push(`![](${url})`)
    }
  }

  return lines.join("\n").trimEnd() + "\n"
}

const renderQuote = (quote: NormalizedQuote): string => {
  const permalink = safeUrl(quote.permalink)
  const label = `@${quote.author.handle}`
  const head = permalink ? `> **Quoting [${label}](${permalink})**` : `> **Quoting ${label}**`
  const out = [head]
  const body = quote.text.trim()
  if (body) {
    out.push(">")
    for (const line of body.split("\n")) out.push(`> ${escapeMarkdown(line)}`)
  }
  return out.join("\n")
}

const applyFacets = (text: string, facets: NormalizedFacet[]): string => {
  if (facets.length === 0) return escapeMarkdown(text)

  let out = ""
  let pos = 0
  for (const f of facets) {
    if (f.start < pos) continue
    if (f.start > pos) out += escapeMarkdown(text.slice(pos, f.start))
    const slice = text.slice(f.start, f.end)
    if (f.type === "mention") {
      out += `[${escapeMarkdown(slice)}](https://x.com/${f.handle})`
    } else {
      const href = safeUrl(f.href)
      const label = f.display || slice
      out += href ? `[${escapeMarkdown(label)}](${href})` : escapeMarkdown(label)
    }
    pos = f.end
  }
  if (pos < text.length) out += escapeMarkdown(text.slice(pos))
  return out
}

