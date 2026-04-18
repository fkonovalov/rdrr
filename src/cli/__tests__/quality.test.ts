import { describe, expect, it } from "vitest"
import type { ParseResult } from "../../types"
import { computeQuality } from "../quality"

const base = (overrides: Partial<ParseResult>): ParseResult => ({
  type: "webpage",
  title: "Example",
  author: "",
  content: "",
  description: "",
  domain: "example.com",
  siteName: "",
  published: null,
  wordCount: 0,
  readTime: "1 min",
  ...overrides,
})

describe("computeQuality", () => {
  it("scores long, well-structured articles as good", () => {
    const content = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}. ${"text ".repeat(30)}`).join("\n\n")
    const report = computeQuality(base({ content, author: "Alice" }))
    expect(report.verdict).toBe("good")
    expect(report.score).toBeGreaterThanOrEqual(70)
    expect(report.signals.hasByline).toBe(true)
  })

  it("scores link-heavy navigation-like content as partial or poor", () => {
    const content = Array.from({ length: 5 }, (_, i) => `[link ${i}](https://x/${i})`).join(" ")
    const report = computeQuality(base({ content }))
    expect(report.signals.linkRatio).toBeGreaterThan(0.5)
    expect(report.score).toBeLessThan(70)
  })

  it("caps the score at 30 when a paywall marker is present", () => {
    const content = `${"legitimate prose ".repeat(200)}\n\nSubscribe to read the full article`
    const report = computeQuality(base({ content, author: "Alice" }))
    expect(report.score).toBeLessThanOrEqual(30)
    expect(report.verdict).toBe("poor")
  })

  it("counts boilerplate phrases against the score", () => {
    const content = `Accept all cookies\n\nManage preferences\n\nSign in\n\nSubscribe now\n\nPrivacy policy`
    const report = computeQuality(base({ content }))
    // Five hits saturates the boilerplate signal, which caps at 4.
    expect(report.signals.boilerplateRatio).toBe(1)
    expect(report.score).toBeLessThan(50)
  })

  it("flags non-English boilerplate (Russian, German, French, Spanish)", () => {
    const content = [
      "Принять все cookie",
      "Политика конфиденциальности",
      "Alle Cookies akzeptieren",
      "Politique de confidentialité",
      "Aceptar todas las cookies",
    ].join("\n\n")
    const report = computeQuality(base({ content }))
    expect(report.signals.boilerplateRatio).toBeGreaterThan(0)
  })

  it("caps the score when a Russian paywall marker appears", () => {
    const content = `${"осмысленный текст ".repeat(200)}\n\nТолько для подписчиков`
    const report = computeQuality(base({ content, author: "Автор" }))
    expect(report.score).toBeLessThanOrEqual(30)
  })

  it("treats essentially-empty content as poor regardless of metadata", () => {
    // Bug: link-ratio bonus was firing on empty content, giving it 60/partial
    // even when there was nothing to extract. Empty means poor, full stop.
    expect(computeQuality(base({ content: "" })).verdict).toBe("poor")
    expect(computeQuality(base({ content: "tiny", title: "Nice Title", author: "Someone" })).verdict).toBe("poor")
  })
})
