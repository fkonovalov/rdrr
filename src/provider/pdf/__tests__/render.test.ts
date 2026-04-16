import { describe, expect, it } from "vitest"
import { buildMarkdown, titleFromUrl } from "../render"
import type { FontStats, PageLines } from "../types"

const stats: FontStats = { mean: 14, stddev: 3, bodyHeight: 12 }

const pages = (lines: PageLines[]): PageLines[] => lines

describe("buildMarkdown", () => {
  it("renders heading and paragraph", () => {
    const out = buildMarkdown(
      pages([
        {
          pageNum: 1,
          lines: [
            { text: "Title", height: 20, y: 1, isSmall: false },
            { text: "Body text.", height: 12, y: 2, isSmall: false },
          ],
        },
      ]),
      stats,
      1,
    )
    expect(out).toMatch(/^# Title/)
    expect(out).toContain("Body text.")
  })

  it("inserts page separator between pages", () => {
    const out = buildMarkdown(
      pages([
        { pageNum: 1, lines: [{ text: "Page one.", height: 12, y: 1, isSmall: false }] },
        { pageNum: 2, lines: [{ text: "Page two.", height: 12, y: 1, isSmall: false }] },
      ]),
      stats,
      2,
    )
    expect(out).toContain("---")
    expect(out).toMatch(/Page one/)
    expect(out).toMatch(/Page two/)
  })

  it("prepends page-count banner when multi-page", () => {
    const out = buildMarkdown(
      pages([{ pageNum: 1, lines: [{ text: "only", height: 12, y: 1, isSmall: false }] }]),
      stats,
      5,
    )
    expect(out.startsWith("*5 pages*")).toBe(true)
  })

  it("omits banner for single-page docs", () => {
    const out = buildMarkdown(
      pages([{ pageNum: 1, lines: [{ text: "only", height: 12, y: 1, isSmall: false }] }]),
      stats,
      1,
    )
    expect(out.startsWith("*")).toBe(false)
  })

  it("renders blockquote for quoted line", () => {
    const out = buildMarkdown(
      pages([
        {
          pageNum: 1,
          lines: [{ text: "\u201CA quoted sentence.\u201D", height: 12, y: 1, isSmall: false }],
        },
      ]),
      stats,
      1,
    )
    expect(out).toContain("> \u201CA quoted sentence.\u201D")
  })

  it("merges consecutive paragraph lines into one paragraph", () => {
    const out = buildMarkdown(
      pages([
        {
          pageNum: 1,
          lines: [
            { text: "First half", height: 12, y: 1, isSmall: false },
            { text: "second half.", height: 12, y: 2, isSmall: false },
          ],
        },
      ]),
      stats,
      1,
    )
    expect(out).toContain("First half second half.")
  })

  it("collapses 3+ newlines to 2", () => {
    const out = buildMarkdown(
      pages([
        {
          pageNum: 1,
          lines: [
            { text: "Big", height: 20, y: 1, isSmall: false },
            { text: "Medium", height: 16, y: 2, isSmall: false },
            { text: "Body", height: 12, y: 3, isSmall: false },
          ],
        },
      ]),
      stats,
      1,
    )
    expect(out).not.toMatch(/\n{3,}/)
  })
})

describe("titleFromUrl", () => {
  it("strips .pdf suffix and replaces separators", () => {
    expect(titleFromUrl("https://example.com/annual-report.pdf")).toBe("annual report")
    expect(titleFromUrl("https://example.com/my_document_2024.PDF")).toBe("my document 2024")
  })

  it("decodes percent-encoded path", () => {
    expect(titleFromUrl("https://example.com/Test%20File.pdf")).toBe("Test File")
  })

  it("returns default when pathname has no filename", () => {
    expect(titleFromUrl("https://example.com/")).toBe("PDF Document")
  })

  it("falls back gracefully for invalid URLs", () => {
    expect(titleFromUrl("not a url")).toBe("PDF Document")
  })
})
