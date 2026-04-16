import { countWords, estimateReadTime, mergeSignals, safeDomain } from "@shared"
import type { ParseOptions, PdfResult } from "../types"
import { assertPublicUrl } from "../security/ssrf"
import { analyseHeadings, classifyLine } from "./pdf/headings"
import { reconstructLines } from "./pdf/lines"
import { buildMarkdown, titleFromUrl } from "./pdf/render"
import type { LineItem, PageLines, TextItem } from "./pdf/types"

const MAX_PDF_SIZE = 50 * 1024 * 1024
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
const DEFAULT_TIMEOUT_MS = 30_000

export const parsePdf = async (url: string, options?: ParseOptions): Promise<PdfResult> => {
  const buffer = await fetchBuffer(url, options)
  return parsePdfFromBuffer(buffer, url, options?.wordsPerMinute)
}

const parsePdfFromBuffer = async (buffer: ArrayBuffer, url: string, wpm?: number): Promise<PdfResult> => {
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
    readTime: estimateReadTime(wc, wpm),
  }
}

const fetchBuffer = async (url: string, options?: ParseOptions): Promise<ArrayBuffer> => {
  if (!options?.allowPrivateNetworks) await assertPublicUrl(url)
  const res = await fetch(url, {
    headers: { "User-Agent": options?.userAgent ?? DEFAULT_USER_AGENT },
    signal: mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal),
  })
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`)
  const cl = res.headers.get("content-length")
  if (cl) {
    const declared = parseInt(cl, 10)
    if (declared > MAX_PDF_SIZE) throw new Error(`PDF too large: ${Math.round(declared / 1024 / 1024)}MB`)
  }
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_PDF_SIZE) throw new Error("PDF too large")
  return buffer
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
