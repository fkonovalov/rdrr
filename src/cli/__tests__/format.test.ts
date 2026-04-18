import { describe, expect, it } from "vitest"
import type { ParseResult } from "../../types"
import { parseFormat, renderJsonl, renderXml } from "../format"

const sample: ParseResult = {
  type: "webpage",
  title: "Example <x>",
  author: "Alice",
  content: "# Heading\n\nBody paragraph with [link](https://example.com).",
  description: "Short description",
  domain: "example.com",
  siteName: "Example",
  language: "en",
  published: "2026-04-18",
  wordCount: 42,
  readTime: "1 min",
}

describe("parseFormat", () => {
  it("accepts every documented value", () => {
    expect(parseFormat("md")).toBe("md")
    expect(parseFormat("json")).toBe("json")
    expect(parseFormat("jsonl")).toBe("jsonl")
    expect(parseFormat("xml")).toBe("xml")
  })

  it("rejects unknown values", () => {
    expect(() => parseFormat("yaml")).toThrow(/Unsupported format/)
  })
})

describe("renderJsonl", () => {
  it("emits one line per record", () => {
    const out = renderJsonl(sample)
    expect(out.endsWith("\n")).toBe(true)
    expect(out.split("\n").filter(Boolean)).toHaveLength(1)
    expect(JSON.parse(out.trim()).title).toBe("Example <x>")
  })

  it("handles arrays", () => {
    const out = renderJsonl([sample, sample])
    expect(out.trim().split("\n")).toHaveLength(2)
  })
})

describe("renderXml", () => {
  it("escapes metadata and CDATA-wraps the body", () => {
    const out = renderXml(sample, { source: "https://example.com", fetchedAt: "2026-04-18T00:00:00Z" })
    expect(out).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    expect(out).toContain("<article ")
    expect(out).toContain("<title>Example &lt;x&gt;</title>")
    expect(out).toContain("<![CDATA[# Heading")
    expect(out.trim().endsWith("</article>")).toBe(true)
  })

  it("emits <quality> and <truncated> elements when the enriched fields are present", () => {
    const enriched = {
      ...sample,
      quality: { score: 87, verdict: "good" as const },
      truncated: { omittedTokens: 10, totalTokens: 100, kept: 2, total: 5 },
    }
    const out = renderXml(enriched, { source: "https://example.com", fetchedAt: "2026-04-18T00:00:00Z" })
    expect(out).toContain('<quality score="87" verdict="good"/>')
    expect(out).toContain('<truncated omittedTokens="10" totalTokens="100"/>')
  })

  it("splits a stray ]]> inside content so a CDATA block never closes early", () => {
    const hostile = { ...sample, content: "before ]]> after" }
    const out = renderXml(hostile, { source: "https://x", fetchedAt: "2026-04-18T00:00:00Z" })
    // Original `]]>` is rewritten as `]]]]><![CDATA[>` so that when concatenated
    // with the wrapping CDATA tags, no single `]]>` sits inside an open section.
    expect(out).toContain("]]]]><![CDATA[>")
    expect(out).not.toContain("before ]]> after")
    // The body should still round-trip to the expected logical text.
    const match = out.match(/<content>(.*)<\/content>/s)
    const cdataContent = match![1]!.replace(/]]]]><!\[CDATA\[>/g, "]]>").replace(/^<!\[CDATA\[/, "").replace(/]]>$/, "")
    expect(cdataContent).toBe("before ]]> after")
  })
})
