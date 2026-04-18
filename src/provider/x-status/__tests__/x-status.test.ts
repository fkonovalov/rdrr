import { afterEach, describe, expect, it, vi } from "vitest"
import { parseXStatus } from ".."

const FX_OK = {
  code: 200,
  message: "OK",
  tweet: {
    id: "123",
    url: "https://x.com/someone/status/123",
    text: "hello world",
    raw_text: {
      text: "hello @friend https://t.co/abc",
      display_text_range: [0, 30],
      facets: [
        { type: "mention", indices: [6, 13], original: "friend", text: "friend" },
        { type: "url", indices: [14, 30], replacement: "https://example.com/", display: "example.com" },
      ],
    },
    author: { screen_name: "someone", name: "Some One" },
    created_at: "2026-04-18T10:11:04.000Z",
    created_timestamp: Math.floor(new Date("2026-04-18T10:11:04.000Z").getTime() / 1000),
    lang: "en",
  },
}

const SYN_OK = {
  __typename: "Tweet",
  id_str: "123",
  text: "syndication text body",
  lang: "en",
  created_at: "2026-04-18T10:11:04.000Z",
  display_text_range: [0, 21],
  user: { screen_name: "someone", name: "Some One" },
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

interface Handler {
  (url: string): Response | Promise<Response> | null
}

const mockFetch = (handlers: Handler[]): { fetch: typeof fetch; calls: string[] } => {
  const calls: string[] = []
  const fn = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    calls.push(url)
    for (const h of handlers) {
      const res = await h(url)
      if (res) return res
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
  return { fetch: fn, calls }
}

describe("parseXStatus", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("fetches via fxtwitter as the primary strategy", async () => {
    const { fetch, calls } = mockFetch([(url) => (url.includes("api.fxtwitter.com") ? jsonResponse(FX_OK) : null)])
    vi.stubGlobal("fetch", fetch)

    const result = await parseXStatus("https://x.com/someone/status/123")

    expect(result.type).toBe("x-status")
    expect(result.handle).toBe("someone")
    expect(result.statusId).toBe("123")
    expect(result.source).toBe("fxtwitter")
    expect(result.content).toContain("@friend")
    expect(result.content).toContain("example.com")
    expect(calls.some((u) => u.includes("api.fxtwitter.com"))).toBe(true)
    expect(calls.some((u) => u.includes("syndication"))).toBe(false)
  })

  it("falls back to syndication when fxtwitter fails", async () => {
    const { fetch, calls } = mockFetch([
      (url) => (url.includes("api.fxtwitter.com") ? new Response("boom", { status: 503 }) : null),
      (url) => (url.includes("syndication.twimg.com") ? jsonResponse(SYN_OK) : null),
    ])
    vi.stubGlobal("fetch", fetch)

    const result = await parseXStatus("https://x.com/someone/status/123")

    expect(result.source).toBe("syndication")
    expect(result.content).toContain("syndication text body")
    expect(calls.some((u) => u.includes("api.fxtwitter.com"))).toBe(true)
    expect(calls.some((u) => u.includes("syndication.twimg.com"))).toBe(true)
  })

  it("throws when every strategy fails", async () => {
    const { fetch } = mockFetch([() => new Response("nope", { status: 500 })])
    vi.stubGlobal("fetch", fetch)

    await expect(parseXStatus("https://x.com/someone/status/123")).rejects.toThrow(/fxtwitter.*syndication/)
  })

  it("handles the /i/status/ form without a handle", async () => {
    const { fetch } = mockFetch([(url) => (url.includes("api.fxtwitter.com") ? jsonResponse(FX_OK) : null)])
    vi.stubGlobal("fetch", fetch)

    const result = await parseXStatus("https://x.com/i/status/123")
    expect(result.type).toBe("x-status")
    expect(result.statusId).toBe("123")
  })

  it("rejects invalid status URLs", async () => {
    await expect(parseXStatus("https://x.com/someone")).rejects.toThrow(/Invalid X status/)
  })
})
