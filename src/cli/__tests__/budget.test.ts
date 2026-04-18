import { describe, expect, it } from "vitest"
import { estimateTokens, truncateToBudget } from "../budget"

describe("estimateTokens", () => {
  it("uses the documented 4-char-per-token ratio", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("abcde")).toBe(2)
  })
})

describe("truncateToBudget", () => {
  const sample = Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1}. ${"x".repeat(40)}`).join("\n\n")

  it("returns content unchanged when under budget", () => {
    const result = truncateToBudget(sample, 10_000)
    expect(result.content).toBe(sample)
    expect(result.info).toBeNull()
  })

  it("cuts at paragraph boundaries and appends a marker", () => {
    const result = truncateToBudget(sample, 40)
    expect(result.info).not.toBeNull()
    expect(result.info!.omittedTokens).toBeGreaterThan(0)
    // Marker line has the exact `[truncated X tokens, Y total]` shape.
    expect(result.content).toMatch(/\[truncated \d+ tokens, \d+ total\]$/)
    // Nothing should be cut in the middle of a paragraph.
    expect(result.content.split("\n\n").filter((p) => p.startsWith("Paragraph")).length).toBeLessThan(6)
  })

  it("still reports totals when the budget is smaller than a single paragraph", () => {
    const result = truncateToBudget(sample, 1)
    // Head-preservation: we always keep the first paragraph so the caller has context,
    // even when the budget is too small for anything else.
    expect(result.info!.kept).toBe(1)
    expect(result.content).toContain("Paragraph 1")
    expect(result.content).toContain("[truncated")
  })

  it("does not append a misleading marker when head-preservation already kept everything", () => {
    // Single-paragraph content that exceeds the budget: kept === total, so
    // truncation never actually happened. The output must match the input
    // exactly — no `[truncated 0 tokens, N total]` lie.
    const single = "one long paragraph with enough text to exceed any tiny budget we throw at it ".repeat(3)
    const result = truncateToBudget(single, 5)
    expect(result.info).toBeNull()
    expect(result.content).toBe(single)
    expect(result.content).not.toContain("[truncated")
  })

  it("closes dangling fenced code blocks when a cut lands mid-block", () => {
    // Content that opens a fenced block in one paragraph and closes it much
    // later, separated by another fence-only paragraph that pushes us past the
    // budget if the first paragraph is small enough to be kept on its own.
    const content = [
      "```js",
      "const a = 1",
      "```",
      "More prose that will be dropped.",
      "```ts",
      "const b = 2",
      "```",
    ].join("\n\n")
    const result = truncateToBudget(content, 4)
    // Every opening fence in the kept output must have a matching closing one.
    const fences = result.content.match(/^```/gm) ?? []
    expect(fences.length % 2).toBe(0)
  })
})
