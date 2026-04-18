import type { ParseResult } from "../types"

export type OutputFormat = "md" | "json" | "jsonl" | "xml"

/**
 * CLI-level augmentation of a `ParseResult` with optional reports attached
 * downstream (`--quality`, `--budget`). Keeping a single shape avoids ad-hoc
 * casts at every render site and gives consumers typed access.
 */
export interface EnrichedResult extends ParseResult {
  quality?: { score: number; verdict: "good" | "partial" | "poor" }
  truncated?: { omittedTokens: number; totalTokens: number; kept: number; total: number }
}

export const parseFormat = (value: string): OutputFormat => {
  if (value === "md" || value === "json" || value === "jsonl" || value === "xml") return value
  throw new Error(`Unsupported format: ${value}`)
}

/**
 * Render a result as JSONL — one JSON object per line. For a single URL this is
 * a single line; aggregate callers stream multiple lines by concatenating calls.
 */
export const renderJsonl = (result: EnrichedResult | Array<EnrichedResult>): string => {
  const items = Array.isArray(result) ? result : [result]
  return items.map((r) => JSON.stringify(r)).join("\n") + (items.length > 0 ? "\n" : "")
}

interface XmlOptions {
  source: string
  fetchedAt: string
}

/**
 * Render as LLM-friendly XML: metadata as attributes/elements, body as CDATA
 * so markdown special chars and <...>-like fragments inside the article text
 * don't need escaping or produce malformed XML. Emits an XML declaration so
 * strict parsers accept the output as a standalone document, not a fragment.
 */
export const renderXml = (result: EnrichedResult, { source, fetchedAt }: XmlOptions): string => {
  const type = escapeAttr(result.type)
  const url = escapeAttr(source)
  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<article type="${type}" url="${url}" fetchedAt="${escapeAttr(fetchedAt)}">`)
  lines.push("  <meta>")
  lines.push(`    <title>${escapeXml(result.title)}</title>`)
  if (result.author) lines.push(`    <author>${escapeXml(result.author)}</author>`)
  if (result.siteName) lines.push(`    <site>${escapeXml(result.siteName)}</site>`)
  if (result.language) lines.push(`    <lang>${escapeXml(result.language)}</lang>`)
  if (result.published) lines.push(`    <publishedAt>${escapeXml(result.published)}</publishedAt>`)
  if (result.description) lines.push(`    <description>${escapeXml(result.description)}</description>`)
  if (result.readTime) lines.push(`    <readTime>${escapeXml(result.readTime)}</readTime>`)
  lines.push(`    <wordCount>${result.wordCount}</wordCount>`)
  lines.push("  </meta>")

  if (result.quality) {
    lines.push(`  <quality score="${result.quality.score}" verdict="${escapeAttr(result.quality.verdict)}"/>`)
  }

  if (result.truncated) {
    lines.push(
      `  <truncated omittedTokens="${result.truncated.omittedTokens}" totalTokens="${result.truncated.totalTokens}"/>`,
    )
  }

  lines.push(`  <content><![CDATA[${escapeCdata(result.content)}]]></content>`)
  lines.push("</article>")
  return lines.join("\n") + "\n"
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const escapeAttr = (s: string): string =>
  escapeXml(s).replace(/"/g, "&quot;").replace(/\n/g, " ")

// `]]>` would prematurely close the CDATA section; split it so the sequence
// never appears literally inside the wrapper.
const escapeCdata = (s: string): string => s.split("]]>").join("]]]]><![CDATA[>")
