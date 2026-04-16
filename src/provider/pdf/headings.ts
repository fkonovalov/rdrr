import type { FontStats, LineItem, LineRole } from "./types"

export const analyseHeadings = (allLines: LineItem[]): FontStats => {
  const heights = allLines.map((l) => l.height).filter((h) => h > 0)
  if (heights.length === 0) return { mean: 12, stddev: 0, bodyHeight: 12 }

  const mean = heights.reduce((a, b) => a + b, 0) / heights.length
  const variance = heights.reduce((sum, h) => sum + (h - mean) ** 2, 0) / heights.length
  const stddev = Math.sqrt(variance)

  const buckets = new Map<number, number>()
  for (const h of heights) {
    const rounded = Math.round(h * 2) / 2
    buckets.set(rounded, (buckets.get(rounded) ?? 0) + 1)
  }
  let bodyHeight = mean
  let maxCount = 0
  for (const [h, count] of buckets) {
    if (count > maxCount) {
      maxCount = count
      bodyHeight = h
    }
  }

  for (const line of allLines) line.isSmall = line.height < bodyHeight * 0.85

  return { mean, stddev, bodyHeight }
}

export const classifyLine = (line: LineItem, stats: FontStats): LineRole => {
  const { height, text, isSmall } = line
  const { stddev, bodyHeight } = stats

  if (stddev < 0.5) return "p"
  if (isSmall) return "small"
  if (/^[\u201C"'\u2018]/.test(text) && /[\u201D"'\u2019\u2026.!?]$/.test(text)) return "blockquote"
  if (height > bodyHeight * 1.4) return "h1"
  if (height > bodyHeight * 1.15) return "h2"
  return "p"
}
