import { countWords, formatTime } from "@shared"
import type { TranscriptSegment } from "../../types"
import type { RawItem } from "./types"
import { cleanSegmentText } from "./clean"

const SENTENCE_END = /[.!?]["'\u2019\u201D)]*\s*$/
const QUESTION_END = /\?["'\u2019\u201D)]*\s*$/
const GROUP_GAP = 20
const MIN_WORDS = 50
const SOFT_BREAK_GAP = 2.5
const MERGE_MAX_WORDS = 80
const MERGE_MAX_SPAN = 45
const SHORT_MAX_WORDS = 3
const FIRST_MERGE_MIN = 8

interface RawSeg {
  start: number
  text: string
}

interface GroupedSeg {
  start: number
  text: string
  speakerChange: boolean
  speaker?: number
}

export const groupTranscriptItems = (items: RawItem[]): TranscriptSegment[] => {
  if (items.length === 0) return []

  const rawSegs: RawSeg[] = items.map((item) => ({ start: item.offset / 1000, text: item.text }))
  const hasSpeakers = rawSegs.some((s) => s.text.startsWith(">>"))
  const sentenceGroups = hasSpeakers ? groupBySpeaker(rawSegs) : groupBySentence(rawSegs)
  const grouped = mergeIntoParagraphs(sentenceGroups)

  return grouped
    .map((g, i) => {
      const nextStart = i + 1 < grouped.length ? grouped[i + 1]!.start : g.start + 30
      return {
        text: cleanSegmentText(g.text),
        startTime: g.start,
        endTime: nextStart,
        formattedTime: formatTime(g.start),
        chapterIndex: 0,
      }
    })
    .filter((s) => s.text.length > 0)
}

const groupBySentence = (segments: RawSeg[]): GroupedSeg[] => {
  const groups: GroupedSeg[] = []
  let buffer = ""
  let bufferStart = 0
  let lastStart = 0

  const flush = (): void => {
    if (buffer.trim()) {
      groups.push({ start: bufferStart, text: buffer.trim(), speakerChange: false })
      buffer = ""
    }
  }

  for (const seg of segments) {
    const prevStart = lastStart
    if (buffer && seg.start - prevStart > GROUP_GAP) flush()
    if (!buffer) bufferStart = seg.start
    buffer += (buffer ? " " : "") + seg.text
    lastStart = seg.start
    if (SENTENCE_END.test(seg.text)) {
      flush()
    } else if (countWords(buffer) >= MIN_WORDS && seg.start - prevStart >= SOFT_BREAK_GAP) {
      flush()
    }
  }
  flush()
  return groups
}

const groupBySpeaker = (segments: RawSeg[]): GroupedSeg[] => {
  const turns: Array<{ start: number; segments: RawSeg[]; speakerChange: boolean; speaker?: number }> = []
  let currentTurn: (typeof turns)[0] | null = null
  let speakerIdx = -1
  let prevText = ""

  for (const seg of segments) {
    const isSpeakerChange = seg.text.startsWith(">>")
    const cleanText = seg.text.replace(/^>>\s*/, "").replace(/^-\s+/, "")
    const prevEnded = (SENTENCE_END.test(prevText) || !prevText) && !/,\s*$/.test(prevText)
    const isReal = isSpeakerChange && prevEnded

    if (isReal) {
      if (currentTurn) turns.push(currentTurn)
      speakerIdx = (speakerIdx + 1) % 2
      currentTurn = {
        start: seg.start,
        segments: [{ start: seg.start, text: cleanText }],
        speakerChange: true,
        speaker: speakerIdx,
      }
    } else {
      if (!currentTurn) currentTurn = { start: seg.start, segments: [], speakerChange: false }
      currentTurn.segments.push({ start: seg.start, text: cleanText })
    }
    prevText = cleanText
  }
  if (currentTurn) turns.push(currentTurn)

  const groups: GroupedSeg[] = []
  for (const turn of turns) {
    const sg =
      turn.speaker === undefined ? groupBySentence(turn.segments) : mergeSentenceGroups(groupBySentence(turn.segments))
    for (let i = 0; i < sg.length; i++) {
      groups.push({ ...sg[i]!, speakerChange: i === 0 && turn.speakerChange, speaker: turn.speaker })
    }
  }
  return groups
}

const mergeSentenceGroups = (groups: GroupedSeg[]): GroupedSeg[] => {
  if (groups.length <= 1) return groups
  const merged: GroupedSeg[] = []
  let current = { ...groups[0]! }
  let isFirst = true

  for (let i = 1; i < groups.length; i++) {
    const next = groups[i]!
    if (shouldMerge(current, next, isFirst)) {
      current.text = `${current.text} ${next.text}`
      continue
    }
    merged.push(current)
    current = { ...next }
    isFirst = false
  }
  merged.push(current)
  return merged
}

const shouldMerge = (cur: GroupedSeg, next: GroupedSeg, isFirst: boolean): boolean => {
  const cw = countWords(cur.text)
  const nw = countWords(next.text)
  if (isShortUtterance(cur.text) || isShortUtterance(next.text)) return false
  if (isFirst && cw < FIRST_MERGE_MIN) return false
  if (QUESTION_END.test(cur.text) || QUESTION_END.test(next.text)) return false
  if (cw + nw > MERGE_MAX_WORDS) return false
  if (next.start - cur.start > MERGE_MAX_SPAN) return false
  return true
}

const isShortUtterance = (text: string): boolean => {
  const w = countWords(text)
  return w > 0 && w <= SHORT_MAX_WORDS && SENTENCE_END.test(text)
}

const mergeIntoParagraphs = (groups: GroupedSeg[]): GroupedSeg[] => {
  if (groups.length <= 1) return groups
  const merged: GroupedSeg[] = []
  let current = { ...groups[0]! }

  for (let i = 1; i < groups.length; i++) {
    const next = groups[i]!
    const cw = countWords(current.text)
    const nw = countWords(next.text)
    if (cw + nw <= MERGE_MAX_WORDS && next.start - current.start <= MERGE_MAX_SPAN) {
      current.text = `${current.text} ${next.text}`
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}
