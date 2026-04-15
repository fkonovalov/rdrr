import { countWords, estimateReadTime } from "@shared"
import type { ParseOptions, PdfResult } from "../types"

const MAX_PDF_SIZE = 50 * 1024 * 1024
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
const Y_TOLERANCE = 2

interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}
interface LineItem {
  text: string
  height: number
  y: number
  isSmall: boolean
}
type LineRole = "h1" | "h2" | "p" | "small" | "blockquote"
interface FontStats {
  mean: number
  stddev: number
  bodyHeight: number
}
interface PageLines {
  lines: LineItem[]
  pageNum: number
}

export const parsePdf = async (url: string, _options?: ParseOptions): Promise<PdfResult> => {
  const buffer = await fetchBuffer(url)
  return parsePdfFromBuffer(buffer, url)
}

const parsePdfFromBuffer = async (buffer: ArrayBuffer, url: string): Promise<PdfResult> => {
  const { getDocumentProxy } = await import("unpdf")
  const doc = await getDocumentProxy(new Uint8Array(buffer))

  const metadata = await doc.getMetadata()
  const info = (metadata?.info ?? {}) as Record<string, string>
  const numPages = doc.numPages

  const allPagesLines: PageLines[] = []
  const allLines: LineItem[] = []

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    const items = (content.items as unknown[]).filter((it): it is TextItem => typeof (it as TextItem).str === "string")
    const lines = reconstructLines(items)
    allPagesLines.push({ lines, pageNum })
    allLines.push(...lines)
  }

  if (allLines.length === 0) {
    return emptyResult(
      url,
      info,
      "*This PDF does not contain extractable text. It may be a scanned document or contain only images.*",
    )
  }

  const stats = analyseHeadings(allLines)
  const markdown = buildMarkdown(allPagesLines, stats, numPages)

  let title = info.Title ?? ""
  if (!title) {
    const firstH1 = allLines.find((l) => classifyLine(l, stats) === "h1")
    title = firstH1?.text ?? titleFromUrl(url)
  }

  const wc = countWords(markdown)

  return {
    type: "pdf",
    title,
    author: info.Author ?? "",
    content: markdown,
    description: info.Subject ?? "",
    domain: safeDomain(url),
    siteName: "",
    published: null,
    wordCount: wc,
    readTime: estimateReadTime(wc),
  }
}

const fetchBuffer = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`)
  const cl = res.headers.get("content-length")
  if (cl && parseInt(cl) > MAX_PDF_SIZE) throw new Error(`PDF too large: ${Math.round(parseInt(cl) / 1024 / 1024)}MB`)
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_PDF_SIZE) throw new Error("PDF too large")
  return buffer
}

const reconstructLines = (items: TextItem[]): LineItem[] => {
  if (items.length === 0) return []
  const lines: LineItem[] = []
  let current: { texts: string[]; height: number; y: number } | null = null

  for (const item of items) {
    if (!item.str && !item.hasEOL) continue
    const y = item.transform[5] ?? 0
    const height = Math.abs(item.transform[3] ?? 0)

    if (!current || Math.abs(current.y - y) > Y_TOLERANCE) {
      if (current) {
        const text = current.texts.join("").trim()
        if (text) lines.push({ text, height: current.height, y: current.y, isSmall: false })
      }
      current = { texts: [item.str], height, y }
    } else {
      current.texts.push(item.str)
      if (height > current.height) current.height = height
    }

    if (item.hasEOL && current) {
      const text = current.texts.join("").trim()
      if (text) lines.push({ text, height: current.height, y: current.y, isSmall: false })
      current = null
    }
  }

  if (current) {
    const text = current.texts.join("").trim()
    if (text) lines.push({ text, height: current.height, y: current.y, isSmall: false })
  }

  return lines
}

const analyseHeadings = (allLines: LineItem[]): FontStats => {
  const heights = allLines.map((l) => l.height).filter((h) => h > 0)
  if (heights.length === 0) return { mean: 12, stddev: 0, bodyHeight: 12 }

  const mean = heights.reduce((a, b) => a + b, 0) / heights.length
  const variance = heights.reduce((sum, h) => sum + (h - mean) ** 2, 0) / heights.length
  const stddev = Math.sqrt(variance)

  const buckets = new Map<number, number>()
  for (const h of heights) {
    const rounded = Math.round(h * 2) / 2
    buckets.set(rounded, (buckets.get(rounded) ?? 0) + 1)
  }
  let bodyHeight = mean
  let maxCount = 0
  for (const [h, count] of buckets) {
    if (count > maxCount) {
      maxCount = count
      bodyHeight = h
    }
  }

  for (const line of allLines) line.isSmall = line.height < bodyHeight * 0.85

  return { mean, stddev, bodyHeight }
}

const classifyLine = (line: LineItem, stats: FontStats): LineRole => {
  const { height, text, isSmall } = line
  const { stddev, bodyHeight } = stats

  if (stddev < 0.5) return "p"
  if (isSmall) return "small"
  if (/^[\u201C"'\u2018]/.test(text) && /[\u201D"'\u2019\u2026.!?]$/.test(text)) return "blockquote"
  if (height > bodyHeight * 1.4) return "h1"
  if (height > bodyHeight * 1.15) return "h2"
  return "p"
}

const buildMarkdown = (pages: PageLines[], stats: FontStats, numPages: number): string => {
  const parts: string[] = []

  const allEntries: Array<{ line: LineItem; pageNum: number }> = []
  for (const page of pages) {
    for (const line of page.lines) allEntries.push({ line, pageNum: page.pageNum })
  }

  let prevPageNum = 0
  let prevRole: LineRole = "p"
  let inBlockquote = false

  for (const { line, pageNum } of allEntries) {
    const role = classifyLine(line, stats)

    if (pageNum !== prevPageNum && prevPageNum > 0 && parts.length > 0) {
      if (inBlockquote) inBlockquote = false
      parts.push("\n---\n")
    }
    prevPageNum = pageNum

    if (role === "h1") {
      if (inBlockquote) inBlockquote = false
      parts.push(`\n# ${line.text}\n`)
    } else if (role === "h2") {
      if (inBlockquote) inBlockquote = false
      parts.push(`\n## ${line.text}\n`)
    } else if (role === "blockquote") {
      if (inBlockquote) {
        parts.push(`> ${line.text}`)
      } else {
        inBlockquote = true
        parts.push(`\n> ${line.text}`)
      }
    } else if (role === "small") {
      if (inBlockquote || prevRole === "blockquote") {
        parts.push(`> ${line.text}`)
        inBlockquote = true
      } else {
        if (inBlockquote) inBlockquote = false
        parts.push(`\n> ${line.text}\n`)
      }
    } else {
      if (inBlockquote) inBlockquote = false

      if (prevRole === "p" && parts.length > 0) {
        const last = parts.at(-1) ?? ""
        if (!last.startsWith("\n#") && !last.startsWith("\n---") && !last.startsWith("\n>") && !last.startsWith(">")) {
          parts[parts.length - 1] = last.trimEnd() + " " + line.text
          prevRole = role
          continue
        }
      }
      parts.push(line.text)
    }

    prevRole = role
  }

  let md = parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (numPages > 1) {
    md = `*${numPages} pages*\n\n${md}`
  }

  return md
}

const titleFromUrl = (url: string): string => {
  try {
    const filename = new URL(url).pathname.split("/").pop() ?? ""
    return decodeURIComponent(filename.replace(/\.pdf$/i, "").replace(/[-_]/g, " ")) || "PDF Document"
  } catch {
    return "PDF Document"
  }
}

const emptyResult = (url: string, info: Record<string, string>, content: string): PdfResult => ({
  type: "pdf",
  title: info.Title ?? titleFromUrl(url),
  author: info.Author ?? "",
  content,
  description: "",
  domain: safeDomain(url),
  siteName: "",
  published: null,
  wordCount: 0,
  readTime: "1 min",
})

const safeDomain = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}
