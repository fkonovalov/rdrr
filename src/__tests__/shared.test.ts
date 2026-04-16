import { describe, expect, it } from "vitest"
import { countWords, ensureProtocol, estimateReadTime, formatTime, mergeSignals, safeDomain } from "../shared"

describe("countWords", () => {
  it("returns 0 for empty input", () => {
    expect(countWords("")).toBe(0)
  })

  it("counts simple english words", () => {
    expect(countWords("one two three four")).toBe(4)
  })

  it("handles multiple whitespace between words", () => {
    expect(countWords("foo    bar\n\tbaz")).toBe(3)
  })

  it("counts punctuation-attached words once", () => {
    expect(countWords("hello, world!")).toBe(2)
  })

  it("counts CJK characters individually", () => {
    // 4 CJK (你好世界) + 1 English token (test) = 5
    expect(countWords("你好世界 test")).toBe(5)
  })

  it("counts hiragana and katakana", () => {
    expect(countWords("こんにちは")).toBe(5)
    expect(countWords("カタカナ")).toBe(4)
  })

  it("counts hangul", () => {
    expect(countWords("안녕하세요")).toBe(5)
  })

  it("mixes cjk with latin", () => {
    // "foo 中文 bar" — 2 latin + 2 cjk
    expect(countWords("foo 中文 bar")).toBe(4)
  })

  it("treats control chars as separators", () => {
    expect(countWords("a\x00b\x01c")).toBe(3)
  })
})

describe("estimateReadTime", () => {
  it("returns '1 min' for 0 words", () => {
    expect(estimateReadTime(0)).toBe("1 min")
  })

  it("returns '1 min' for under 200 words", () => {
    expect(estimateReadTime(150)).toBe("1 min")
    expect(estimateReadTime(200)).toBe("1 min")
  })

  it("rounds up", () => {
    expect(estimateReadTime(201)).toBe("2 min")
    expect(estimateReadTime(400)).toBe("2 min")
    expect(estimateReadTime(401)).toBe("3 min")
  })

  it("honours custom wpm", () => {
    expect(estimateReadTime(600, 300)).toBe("2 min")
    expect(estimateReadTime(600, 100)).toBe("6 min")
  })

  it("falls back to default for non-positive wpm", () => {
    expect(estimateReadTime(600, 0)).toBe("3 min")
    expect(estimateReadTime(600, -50)).toBe("3 min")
  })
})

describe("formatTime", () => {
  it("formats seconds as m:ss", () => {
    expect(formatTime(0)).toBe("0:00")
    expect(formatTime(5)).toBe("0:05")
    expect(formatTime(65)).toBe("1:05")
    expect(formatTime(599)).toBe("9:59")
  })

  it("adds hour component past an hour", () => {
    expect(formatTime(3600)).toBe("1:00:00")
    expect(formatTime(3661)).toBe("1:01:01")
    expect(formatTime(7325)).toBe("2:02:05")
  })

  it("floors fractional seconds", () => {
    expect(formatTime(65.9)).toBe("1:05")
  })
})

describe("safeDomain", () => {
  it("returns hostname for valid urls", () => {
    expect(safeDomain("https://example.com/foo")).toBe("example.com")
    expect(safeDomain("http://sub.example.com:8080/")).toBe("sub.example.com")
  })

  it("returns empty string for invalid urls", () => {
    expect(safeDomain("not-a-url")).toBe("")
    expect(safeDomain("")).toBe("")
  })
})

describe("ensureProtocol", () => {
  it("keeps absolute urls as-is", () => {
    expect(ensureProtocol("https://example.com")).toBe("https://example.com")
    expect(ensureProtocol("http://example.com")).toBe("http://example.com")
  })

  it("prepends https:// to bare hosts", () => {
    expect(ensureProtocol("example.com")).toBe("https://example.com")
    expect(ensureProtocol("example.com/path?q=1")).toBe("https://example.com/path?q=1")
  })
})

describe("mergeSignals", () => {
  it("returns a single timeout signal when no external signal", () => {
    const signal = mergeSignals(1000)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it("combines timeout with external signal (any aborts)", async () => {
    const controller = new AbortController()
    const merged = mergeSignals(60_000, controller.signal)
    expect(merged.aborted).toBe(false)
    controller.abort(new Error("user cancelled"))
    expect(merged.aborted).toBe(true)
  })

  it("timeout triggers even without external abort", async () => {
    const merged = mergeSignals(5)
    await new Promise((r) => setTimeout(r, 15))
    expect(merged.aborted).toBe(true)
  })
})
