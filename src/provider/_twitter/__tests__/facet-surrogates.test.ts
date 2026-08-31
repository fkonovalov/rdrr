import { describe, expect, it } from "vitest"
import { applyDisplayRange, codePointConverter } from "../normalize"

describe("codePointConverter", () => {
  it("is identity for BMP-only text", () => {
    const toUtf16 = codePointConverter("plain ascii text")
    expect(toUtf16(0)).toBe(0)
    expect(toUtf16(5)).toBe(5)
  })

  it("accounts for surrogate pairs", () => {
    const toUtf16 = codePointConverter("🦞 ab")
    expect(toUtf16(0)).toBe(0)
    expect(toUtf16(1)).toBe(2)
    expect(toUtf16(2)).toBe(3)
    expect(toUtf16(4)).toBe(5)
  })

  it("clamps out-of-range indices", () => {
    const toUtf16 = codePointConverter("🦞")
    expect(toUtf16(99)).toBe(2)
    expect(toUtf16(-1)).toBe(0)
  })
})

describe("applyDisplayRange with emoji before facets", () => {
  it("re-anchors code-point facet indices into UTF-16 space", () => {
    const text = "🦞🦞 see https://t.co/x now"
    const facets = applyDisplayRange({
      text,
      display_text_range: [0, [...text].length],
      facets: [{ type: "url", indices: [7, 21], replacement: "https://example.com", display: "example.com" }],
    })

    const url = facets.facets[0]!
    expect(facets.text.slice(url.start, url.end)).toBe("https://t.co/x")
  })

  it("converts the display range itself", () => {
    const text = "🦞 kept https://t.co/y"
    const cut = applyDisplayRange({ text, display_text_range: [2, [...text].length], facets: [] })
    expect(cut.text).toBe("kept https://t.co/y")
  })
})
