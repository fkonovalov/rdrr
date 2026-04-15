import { countWords, formatTime } from "@shared"
import type { TranscriptSegment } from "../../types"
import type { RawItem } from "./types"
import { cleanSegmentText } from "./clean"

const PAUSE_THRESHOLD = 3000
const MAX_LYRIC_LINES = 8

export const detectLyricContent = (items: RawItem[]): { isLyric: boolean } => {
  if (items.length < 5) return { isLyric: false }

  const lastItem = items.at(-1)!
  const totalDuration = (lastItem.offset + lastItem.duration) / 1000
  if (totalDuration > 900) return { isLyric: false }

  const allText = items.map((i) => i.text).join(" ")
  const totalWords = countWords(allText)
  const musicSymbols = (allText.match(/[♪♫♬♩🎵🎶]/gu) ?? []).length
  const musicDensity = musicSymbols / items.length
  const totalDur = items.reduce((s, i) => s + i.duration / 1000, 0) || 1
  const wps = totalWords / totalDur
  const punctuated = items.filter((i) => /[.!?]\s*$/.test(i.text)).length
  const punctRatio = punctuated / items.length

  if (musicSymbols >= 3 && musicDensity > 0.02) return { isLyric: true }
  if (wps >= 1.8) return { isLyric: false }
  if (wps < 1.2 && punctRatio < 0.05) return { isLyric: true }

  return { isLyric: false }
}

export const groupLyricItems = (items: RawItem[]): TranscriptSegment[] => {
  if (items.length === 0) return []
  const segments: TranscriptSegment[] = []
  let lines: string[] = []
  let segStart = items[0]!.offset / 1000
  let segEnd = segStart

  const flush = (): void => {
    if (lines.length === 0) return
    segments.push({
      text: lines.join("\n"),
      startTime: segStart,
      endTime: segEnd,
      formattedTime: formatTime(segStart),
      chapterIndex: 0,
    })
    lines = []
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const cleaned = cleanSegmentText(item.text)
    if (!cleaned) continue

    if (lines.length > 0 && i > 0) {
      const prevEnd = items[i - 1]!.offset + items[i - 1]!.duration
      const gap = item.offset - prevEnd
      if (gap >= PAUSE_THRESHOLD || lines.length >= MAX_LYRIC_LINES) {
        flush()
        segStart = item.offset / 1000
      }
    }

    lines.push(cleaned)
    segEnd = (item.offset + item.duration) / 1000
  }

  flush()
  return segments
}
