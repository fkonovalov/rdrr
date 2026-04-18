import { describe, expect, it } from "vitest"
import { extract, extractAsync, parseLinkedomHTML } from ".."

describe("parseLinkedomHTML edge cases", () => {
  it("does not crash on empty input", () => {
    // Regression: linkedom threw from deep inside its internals on empty
    // input, surfacing as "Cannot destructure property 'firstElementChild' of
    // 'e' as it is null" in the CLI.
    const doc = parseLinkedomHTML("")
    expect(doc.documentElement).toBeDefined()
    expect(doc.body).toBeDefined()
  })

  it("does not crash on whitespace-only input", () => {
    const doc = parseLinkedomHTML("   \n\t  ")
    expect(doc.documentElement).toBeDefined()
  })
})

const HTML = `<!doctype html><html><head><title>Doc</title></head><body>
  <main><h1>Heading</h1><p>Paragraph with <strong>bold</strong> text.</p></main>
</body></html>`

describe("extract/extractAsync honour options.markdown", () => {
  it("returns raw HTML by default", () => {
    const doc = parseLinkedomHTML(HTML)
    const result = extract(doc, { url: "https://example.com/doc" })
    expect(/<\w+[^>]*>/.test(result.content)).toBe(true)
  })

  it("converts to markdown when markdown:true is passed", () => {
    const doc = parseLinkedomHTML(HTML)
    const result = extract(doc, { url: "https://example.com/doc", markdown: true })
    // Markdown output should no longer contain HTML tags and should use ** for bold.
    expect(/<[^>]+>/.test(result.content)).toBe(false)
    expect(result.content).toMatch(/\*\*bold\*\*/)
  })

  it("extractAsync also converts when markdown:true is passed", async () => {
    const doc = parseLinkedomHTML(HTML)
    const result = await extractAsync(doc, { url: "https://example.com/doc", markdown: true })
    expect(/<[^>]+>/.test(result.content)).toBe(false)
    expect(result.content).toMatch(/\*\*bold\*\*/)
  })
})
