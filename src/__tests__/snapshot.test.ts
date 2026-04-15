import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
/**
 * Snapshot test: runs all URLs through parse() and writes markdown output
 * to `src/__tests__/snapshot/` for manual inspection.
 *
 * Not a parity or assertion suite -- purely for diffing and spot-checks.
 * Basic sanity checks only (title, wordCount > 0).
 *
 * Also covers `--llms` smoke test: verifies llms.txt is appended to output
 * when `includeLlmsTxt: true` is passed.
 */
import { describe, it, expect } from "vitest"
import type { ParseResult } from "../types"
import { parse } from "../rdrr"

const OUT_DIR = resolve(__dirname, "snapshot")
mkdirSync(OUT_DIR, { recursive: true })

const URLS = [
  "https://react.dev/learn",
  "https://en.wikipedia.org/wiki/TypeScript",
  "https://developer.apple.com/documentation/updates/swiftui",
  "https://x.com/X",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://docs.llamaindex.ai/en/stable/",
]

const slug = (url: string): string =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "_")
    .slice(0, 60)

const esc = (s: string): string => s.replace(/"/g, '\\"').replace(/\n/g, " ")

const buildFrontmatter = (result: ParseResult, url: string): string => {
  const fields: Array<[string, unknown]> = [
    ["title", result.title],
    ["author", result.author],
    ["site", result.siteName],
    ["published", result.published],
    ["source", url],
    ["domain", result.domain],
    ["language", result.language],
    ["dir", result.dir],
    ["description", result.description],
    ["word_count", result.wordCount],
  ]
  const lines = fields
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "string" ? `"${esc(String(value))}"` : value}`)
  return lines.length > 0 ? `---\n${lines.join("\n")}\n---\n\n` : ""
}

describe("snapshot", () => {
  for (const url of URLS) {
    it(`parses ${url}`, async () => {
      const result = await parse(url)

      const output = buildFrontmatter(result, url) + result.content
      writeFileSync(resolve(OUT_DIR, `${slug(url)}.md`), output)

      // Sanity: parse() completed without throwing and returned a result.
      // Strict content validation is the parity test's job; this one is for
      // generating markdown for manual inspection.
      expect(result).toBeDefined()
      expect(result.content).toBeTypeOf("string")
    }, 30_000)
  }
})

describe("llms.txt inclusion", () => {
  it("appends llms.txt when includeLlmsTxt is true (svelte.dev)", async () => {
    const result = await parse("https://svelte.dev/docs/svelte/overview", { includeLlmsTxt: true })

    writeFileSync(
      resolve(OUT_DIR, `${slug("https://svelte.dev/docs/svelte/overview")}_with_llms.md`),
      buildFrontmatter(result, "https://svelte.dev/docs/svelte/overview") + result.content,
    )

    expect(result.llmsTxt).toBeDefined()
    expect(result.llmsTxt!.length).toBeGreaterThan(100)
    expect(result.llmsTxt).toMatch(/^#\s+/)
    expect(result.content).toContain("## llms.txt")
    expect(result.content).toContain("Source: https://svelte.dev/llms.txt")
  }, 30_000)

  it("omits llms.txt when flag is not set", async () => {
    const result = await parse("https://svelte.dev/docs/svelte/overview")
    expect(result.llmsTxt).toBeUndefined()
    expect(result.content).not.toContain("## llms.txt")
  }, 30_000)
})
