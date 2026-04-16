import { describe, expect, it } from "vitest"
import { analyseHeadings, classifyLine } from "../headings"
import { reconstructLines } from "../lines"
import type { LineItem, TextItem } from "../types"

const textItem = (str: string, y: number, height = 12, hasEOL = false): TextItem => ({
  str,
  transform: [1, 0, 0, height, 0, y],
  width: str.length * 7,
  height,
  hasEOL,
})

describe("reconstructLines", () => {
  it("returns [] for empty input", () => {
    expect(reconstructLines([])).toEqual([])
  })

  it("groups items on the same y into one line", () => {
    const lines = reconstructLines([textItem("Hello ", 100), textItem("world", 100, 12, true)])
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe("Hello world")
    expect(lines[0]!.y).toBe(100)
  })

  it("splits items on different y values", () => {
    const lines = reconstructLines([textItem("First", 100, 12, true), textItem("Second", 80, 12, true)])
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text).toBe("First")
    expect(lines[1]!.text).toBe("Second")
  })

  it("tolerates small y jitter (<= 2)", () => {
    const lines = reconstructLines([textItem("A ", 100), textItem("B ", 101.5), textItem("C", 100, 12, true)])
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe("A B C")
  })

  it("tracks max height per line", () => {
    const lines = reconstructLines([textItem("small ", 100, 10), textItem("BIG", 100, 22, true)])
    expect(lines[0]!.height).toBe(22)
  })

  it("flushes pending line at EOF", () => {
    const lines = reconstructLines([textItem("trailing", 100)])
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe("trailing")
  })

  it("skips empty strings without EOL", () => {
    const lines = reconstructLines([textItem("", 100), textItem("real", 100, 12, true)])
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe("real")
  })
})

describe("analyseHeadings", () => {
  it("returns safe defaults for empty input", () => {
    expect(analyseHeadings([])).toEqual({ mean: 12, stddev: 0, bodyHeight: 12 })
  })

  it("identifies dominant body height via histogram", () => {
    const lines: LineItem[] = [
      { text: "a", height: 12, y: 1, isSmall: false },
      { text: "b", height: 12, y: 2, isSmall: false },
      { text: "c", height: 12, y: 3, isSmall: false },
      { text: "d", height: 24, y: 4, isSmall: false }, // a heading
    ]
    const stats = analyseHeadings(lines)
    expect(stats.bodyHeight).toBe(12)
    expect(stats.stddev).toBeGreaterThan(0)
  })

  it("marks sub-threshold lines as small", () => {
    const lines: LineItem[] = [
      { text: "body", height: 12, y: 1, isSmall: false },
      { text: "tiny", height: 8, y: 2, isSmall: false },
    ]
    analyseHeadings(lines)
    expect(lines[0]!.isSmall).toBe(false)
    expect(lines[1]!.isSmall).toBe(true)
  })
})

describe("classifyLine", () => {
  const stats = { mean: 14, stddev: 3, bodyHeight: 12 }

  it("returns 'p' for body-sized line", () => {
    const line: LineItem = { text: "regular prose", height: 12, y: 1, isSmall: false }
    expect(classifyLine(line, stats)).toBe("p")
  })

  it("returns 'h1' for 1.4x body", () => {
    const line: LineItem = { text: "Big Heading", height: 20, y: 1, isSmall: false }
    expect(classifyLine(line, stats)).toBe("h1")
  })

  it("returns 'h2' for 1.15x body (but < 1.4x)", () => {
    const line: LineItem = { text: "Sub Heading", height: 15, y: 1, isSmall: false }
    expect(classifyLine(line, stats)).toBe("h2")
  })

  it("returns 'small' when isSmall flag is set", () => {
    const line: LineItem = { text: "footnote", height: 8, y: 1, isSmall: true }
    expect(classifyLine(line, stats)).toBe("small")
  })

  it("returns 'blockquote' for quoted sentence", () => {
    const line: LineItem = { text: "\u201CThe quick brown fox.\u201D", height: 12, y: 1, isSmall: false }
    expect(classifyLine(line, stats)).toBe("blockquote")
  })

  it("collapses to 'p' when stddev is too small to distinguish", () => {
    const flat = { mean: 12, stddev: 0.1, bodyHeight: 12 }
    const line: LineItem = { text: "anything", height: 30, y: 1, isSmall: false }
    expect(classifyLine(line, flat)).toBe("p")
  })
})
