/**
 * Small rendering helpers shared by every markdown renderer that formats
 * fxtwitter data (x-profile timeline, x-status single post). Each used to be
 * forked across the two renderers; keeping them here removes ~25 LOC of drift
 * risk per provider and a tiny amount of bundle weight.
 */

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
export const safeUrl = (raw: string): string | null => {
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
 * Conservative: only the handful that can break out of a paragraph or a link
 * construct.
 */
export const escapeMarkdown = (s: string): string => s.replace(/([\\`*_[\]])/g, "\\$1")

/**
 * Prepare a free-form string (e.g. display name) for use as inline text in a
 * heading or other single-line position. Drops newlines and leading markdown
 * block markers so an attacker-controlled value cannot open a new block or
 * forge additional structure, then applies the standard inline escape.
 */
export const sanitizeInline = (s: string): string =>
  escapeMarkdown(s.replace(/[\r\n]+/g, " ").replace(/^[\s#>*-]+/, "").trim())

const pad = (n: number): string => n.toString().padStart(2, "0")

/**
 * Format a Date as `YYYY-MM-DD HH:MM UTC`. Kept in UTC deliberately — X shows
 * local time, but render targets (terminal, clipboard, LLM input) have no
 * client timezone, so a stable UTC string is the least-surprising choice.
 */
export const formatDate = (d: Date): string => {
  const y = d.getUTCFullYear()
  const mo = pad(d.getUTCMonth() + 1)
  const da = pad(d.getUTCDate())
  const h = pad(d.getUTCHours())
  const mi = pad(d.getUTCMinutes())
  return `${y}-${mo}-${da} ${h}:${mi} UTC`
}
