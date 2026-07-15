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
  { text: "Hello world", offset: 0, duration: 2 },
  { text: "Second line of speech", offset: 65, duration: 3 },
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

  it("succeeds with empty transcript when captions are unavailable", async () => {
    fetchMetadata.mockResolvedValue(META)
    fetchTranscript.mockRejectedValue(new Error("no captions"))
    fetchChapters.mockResolvedValue([])

    const result = await parseYouTube("https://youtu.be/abc123def45")
    expect(result.transcript).toHaveLength(0)
    expect(result.wordCount).toBe(0)
    expect(result.content).toContain("# Test Video")
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
