import { afterEach, describe, expect, it, vi } from "vitest"
import type { RawChapter, RawItem, VideoMetadata } from "../youtube/types"
import { parseYouTube } from "../youtube"

vi.mock("../youtube/innertube", () => ({
  fetchMetadata: vi.fn<() => Promise<VideoMetadata>>(),
  fetchTranscript: vi.fn<() => Promise<RawItem[]>>(),
  fetchChapters: vi.fn<() => Promise<RawChapter[]>>(),
}))

const innertube = await import("../youtube/innertube")
const fetchMetadata = vi.mocked(innertube.fetchMetadata)
const fetchTranscript = vi.mocked(innertube.fetchTranscript)
const fetchChapters = vi.mocked(innertube.fetchChapters)

const META = { title: "Test Video", author: "Test Author", thumbnailUrl: "https://i.ytimg.com/vi/abc/hq.jpg" }

const ITEMS = [
  { text: "Hello world", offset: 0, duration: 2000 },
  { text: "Second line of speech", offset: 65_000, duration: 3000 },
]

afterEach(() => {
  vi.resetAllMocks()
})

describe("parseYouTube", () => {
  it("renders metadata and timestamped transcript", async () => {
    fetchMetadata.mockResolvedValue(META)
    fetchTranscript.mockResolvedValue(ITEMS)
    fetchChapters.mockResolvedValue([
      { title: "Intro", startTime: 0 },
      { title: "Main", startTime: 60 },
    ])

    const result = await parseYouTube("https://www.youtube.com/watch?v=abc123def45")
    expect(result.type).toBe("youtube")
    expect(result.videoId).toBe("abc123def45")
    expect(result.title).toBe("Test Video")
    expect(result.content).toContain("# Test Video")
    expect(result.content).toContain("**Author:** Test Author")
    expect(result.content).toMatch(/\[0:00\] Hello world/)
    expect(result.chapters).toHaveLength(2)
    expect(result.wordCount).toBeGreaterThan(0)
  })

  it("preserves caption boundaries, real end times and chapter assignments", async () => {
    fetchMetadata.mockResolvedValue(META)
    fetchTranscript.mockResolvedValue([
      { text: "Here are the elephants", offset: 1200, duration: 4600 },
      { text: "They have long trunks", offset: 7000, duration: 8100 },
      { text: "That is all there is to say", offset: 16_000, duration: 2500 },
    ])
    fetchChapters.mockResolvedValue([
      { title: "Intro", startTime: 0 },
      { title: "Trunks", startTime: 5 },
      { title: "End", startTime: 15 },
    ])
    const result = await parseYouTube("https://youtu.be/abc123def45")
    expect(result.transcript).toMatchObject([
      { startTime: 1.2, endTime: 5.8, chapterIndex: 0 },
      { startTime: 7, endTime: 15.1, chapterIndex: 1 },
      { startTime: 16, endTime: 18.5, chapterIndex: 2 },
    ])
    for (const time of ["0:01", "0:07", "0:16"]) expect(result.content).toContain(`[${time}]`)
  })

  it("keeps timestamps attached to speech when empty caption cues are cleaned", async () => {
    fetchMetadata.mockResolvedValue(META)
    fetchTranscript.mockResolvedValue([
      { text: "[Music]", offset: 0, duration: 2000 },
      { text: ">> Hello there", offset: 7000, duration: 2500 },
      { text: "Goodbye", offset: 65_000, duration: 3000 },
    ])
    fetchChapters.mockResolvedValue([])
    const result = await parseYouTube("https://youtu.be/abc123def45")
    expect(result.transcript).toMatchObject([
      { text: "Hello there", startTime: 7, endTime: 9.5 },
      { text: "Goodbye", startTime: 65, endTime: 68 },
    ])
    expect(result.content).not.toContain("[0:00]")
  })

  it("omits cues with invalid timing instead of emitting invalid timestamps", async () => {
    fetchMetadata.mockResolvedValue(META)
    fetchTranscript.mockResolvedValue([
      { text: "Malformed start", offset: Number.NaN, duration: 2000 },
      { text: "Malformed end", offset: 0, duration: Number.POSITIVE_INFINITY },
      { text: "Negative duration", offset: 0, duration: -1000 },
      { text: "Valid speech", offset: 3000, duration: 2000 },
    ])
    fetchChapters.mockResolvedValue([])
    const result = await parseYouTube("https://youtu.be/abc123def45")
    expect(result.transcript).toMatchObject([{ text: "Valid speech", startTime: 3, endTime: 5 }])
  })

  it("reports zero reading time when caption cleanup leaves no speech", async () => {
    fetchMetadata.mockResolvedValue(META)
    fetchTranscript.mockResolvedValue([{ text: "[Music]", offset: 0, duration: 3000 }])
    fetchChapters.mockResolvedValue([])
    const result = await parseYouTube("https://youtu.be/abc123def45")
    expect(result).toMatchObject({ content: "", transcript: [], wordCount: 0, readTime: "0 min" })
  })

  it("keeps metadata but exposes an empty body when captions are unavailable", async () => {
    fetchMetadata.mockResolvedValue(META)
    fetchTranscript.mockRejectedValue(new Error("no captions"))
    fetchChapters.mockResolvedValue([])

    const result = await parseYouTube("https://youtu.be/abc123def45")
    expect(result.transcript).toHaveLength(0)
    expect(result.wordCount).toBe(0)
    expect(result.title).toBe("Test Video")
    expect(result.content).toBe("")
  })

  it("rejects cancellation before making any requests", async () => {
    const signal = AbortSignal.abort()
    await expect(parseYouTube("https://youtu.be/abc123def45", { signal })).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMetadata).not.toHaveBeenCalled()
  })

  it("preserves transcript timeout errors", async () => {
    fetchMetadata.mockResolvedValue(META)
    fetchTranscript.mockRejectedValue(new DOMException("Timed out", "TimeoutError"))
    fetchChapters.mockResolvedValue([])
    await expect(parseYouTube("https://youtu.be/abc123def45")).rejects.toMatchObject({ name: "TimeoutError" })
  })

  it("throws when metadata cannot be fetched", async () => {
    fetchMetadata.mockRejectedValue(new Error("player 404"))
    fetchTranscript.mockResolvedValue([])
    fetchChapters.mockResolvedValue([])

    await expect(parseYouTube("https://www.youtube.com/watch?v=abc123def45")).rejects.toThrow(
      /Could not fetch video metadata/,
    )
  })

  it("rejects urls without a video id", async () => {
    await expect(parseYouTube("https://www.youtube.com/feed/subscriptions")).rejects.toThrow(/Invalid YouTube URL/)
  })
})
