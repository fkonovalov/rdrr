import { formatTime } from "@shared"
import type { TranscriptSegment } from "../../types"
import type { RawItem } from "./types"
import { cleanSegmentText } from "./clean"

export const toTranscriptSegments = (items: RawItem[]): TranscriptSegment[] =>
  items
    .filter(
      ({ offset, duration }) => Number.isFinite(offset) && offset >= 0 && Number.isFinite(duration) && duration >= 0,
    )
    .map(({ text, offset, duration }) => ({
      text: cleanSegmentText(text),
      startTime: offset / 1000,
      endTime: (offset + duration) / 1000,
      formattedTime: formatTime(offset / 1000),
      chapterIndex: 0,
    }))
    .filter(({ text }) => text.length > 0)
