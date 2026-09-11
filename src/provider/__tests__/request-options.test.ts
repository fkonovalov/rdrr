import { afterEach, describe, expect, it, vi } from "vitest"
import { parseXProfile } from "../x-profile"
import { parseXStatus } from "../x-status"
import { parseYouTube } from "../youtube"
import { fetchTranscript } from "../youtube/innertube"

afterEach(() => vi.unstubAllGlobals())

it("uses the other YouTube client when one times out", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.includes("/captions")) return new Response('<text start="0" dur="1">Hello</text>')
      if (String(init?.body).includes("ANDROID")) {
        const signal = init?.signal
        if (!signal) throw new Error("Missing request signal")
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true })
        })
      }
      return Response.json({
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ languageCode: "en", baseUrl: "https://www.youtube.com/captions" }],
          },
        },
      })
    }),
  )
  await expect(fetchTranscript("abc123def45", "en", { timeoutMs: 5 })).resolves.toEqual([
    { text: "Hello", offset: 0, duration: 1000 },
  ])
})

const cases = [
  { name: "YouTube", parse: parseYouTube, url: "https://youtu.be/abc123def45" },
  { name: "X profile", parse: parseXProfile, url: "https://x.com/example" },
]

describe.each(cases)("$name request options", ({ parse, url }) => {
  it("cancels every active request using the caller's signal", async () => {
    const controller = new AbortController()
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn<(_input: unknown, init?: RequestInit) => Promise<Response>>((_input, init) => {
      expect(new Headers(init?.headers).get("User-Agent")).toBe("agent-test")
      const signal = init?.signal
      if (!signal) throw new Error("Missing request signal")
      signals.push(signal)
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const pending = parse(url, { signal: controller.signal, userAgent: "agent-test", timeoutMs: 1000 })
    await vi.waitFor(() => expect(signals.length).toBeGreaterThan(1))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(signals.length).toBeGreaterThan(1)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it("uses the requested timeout rather than an upstream default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init?: RequestInit) => {
        const signal = init?.signal
        if (!signal) throw new Error("Missing request signal")
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true })
        })
      }),
    )
    await expect(parse(url, { timeoutMs: 5 })).rejects.toMatchObject({ name: "TimeoutError" })
  })
})

it("preserves cancellation instead of trying the X status fallback", async () => {
  const controller = new AbortController()
  const fetchMock = vi.fn<typeof fetch>(async () => {
    controller.abort()
    throw controller.signal.reason
  })
  vi.stubGlobal("fetch", fetchMock)
  await expect(parseXStatus("https://x.com/someone/status/123", { signal: controller.signal })).rejects.toMatchObject({
    name: "AbortError",
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
