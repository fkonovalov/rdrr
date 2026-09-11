import { countWords, estimateReadTime, formatTime } from "@shared"
import type { Chapter, ParseOptions, TranscriptSegment, YouTubeResult } from "../types"
import type { VideoMetadata } from "./youtube/types"
import { extractVideoId } from "../detect"
import { fetchChapters, fetchMetadata, fetchTranscript } from "./youtube/innertube"
import { detectLyricContent, groupLyricItems } from "./youtube/lyrics"
import { toTranscriptSegments } from "./youtube/transcript"

export const parseYouTube = async (url: string, options?: ParseOptions): Promise<YouTubeResult> => {
  options?.signal?.throwIfAborted()
  const wpm = options?.wordsPerMinute
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error(`Invalid YouTube URL: ${url}`)

  const [metadata, transcript, chapters] = await Promise.allSettled([
    fetchMetadata(videoId, options),
    fetchTranscript(videoId, options?.language, options),
    fetchChapters(videoId, options),
  ])

  options?.signal?.throwIfAborted()
  for (const result of [metadata, transcript]) {
    if (result.status === "rejected" && result.reason instanceof Error && result.reason.name === "TimeoutError") {
      throw result.reason
    }
  }
  if (metadata.status === "rejected") throw new Error(`Could not fetch video metadata: ${metadata.reason}`)

  const items = transcript.status === "fulfilled" ? transcript.value : []
  const rawChapters = chapters.status === "fulfilled" ? chapters.value : []
  const formattedChapters: Chapter[] = rawChapters.map((c) => ({ ...c, formattedTime: formatTime(c.startTime) }))

  const lyric = detectLyricContent(items)
  const segments = lyric.isLyric ? groupLyricItems(items) : toTranscriptSegments(items)

  assignChapterIndices(segments, formattedChapters)

  const wc = segments.reduce((sum, segment) => sum + countWords(segment.text), 0)
  const content = buildMarkdown(segments, metadata.value, videoId)

  return {
    type: "youtube",
    videoId,
    title: metadata.value.title,
    author: metadata.value.author,
    content,
    description: "",
    domain: "youtube.com",
    siteName: "YouTube",
    published: null,
    thumbnailUrl: metadata.value.thumbnailUrl,
    chapters: formattedChapters,
    transcript: segments,
    isLyric: lyric.isLyric,
    wordCount: wc,
    readTime: estimateReadTime(wc, wpm),
  }
}

const assignChapterIndices = (segments: TranscriptSegment[], chapters: Chapter[]): void => {
  if (chapters.length === 0) return
  for (const seg of segments) {
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (seg.startTime >= chapters[i]!.startTime) {
        seg.chapterIndex = i
        break
      }
    }
  }
}

const buildMarkdown = (segments: TranscriptSegment[], meta: VideoMetadata, videoId: string): string => {
  if (segments.length === 0) return ""
  const lines: string[] = [
    `# ${meta.title}`,
    "",
    `**Author:** ${meta.author}`,
    `**Source:** https://www.youtube.com/watch?v=${videoId}`,
    "",
    "---",
    "",
  ]

  for (const seg of segments) {
    lines.push(`[${seg.formattedTime}] ${seg.text}`, "")
  }

  return lines.join("\n")
}
