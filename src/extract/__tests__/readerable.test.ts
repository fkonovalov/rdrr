import { afterEach, describe, expect, it, vi } from "vitest"
import { isProbablyReaderable } from "../readerable"
import { parseLinkedomHTML } from "../utils/parse-html"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("isProbablyReaderable (document input)", () => {
  it("returns true for a document with substantial article content", () => {
    const html = `<html><body><article>${"<p>" + "Paragraph body text that is long enough to pass the 140 character minimum threshold imposed by the readerable scorer. ".repeat(3) + "</p>"}${"<p>" + "Another paragraph with similar length to accumulate score beyond the default minScore of twenty. ".repeat(3) + "</p>"}</article></body></html>`
    const doc = parseLinkedomHTML(html, "https://example.com")
    return expect(isProbablyReaderable(doc)).resolves.toBe(true)
  })

  it("returns false for navigation-heavy pages without prose", async () => {
    const html = `<html><body><nav><ul><li><a href="/a">a</a></li><li><a href="/b">b</a></li></ul></nav></body></html>`
    const doc = parseLinkedomHTML(html, "https://example.com")
    expect(await isProbablyReaderable(doc)).toBe(false)
  })

  it("ignores hidden paragraphs", async () => {
    const prose = "Enough body text to clear the 140 character minimum length threshold set by the heuristic. ".repeat(
      3,
    )
    const html = `<html><body><p style="display:none">${prose}</p></body></html>`
    const doc = parseLinkedomHTML(html, "https://example.com")
    expect(await isProbablyReaderable(doc)).toBe(false)
  })

  it("ignores paragraphs nested in <li>", async () => {
    const prose = "Enough body text to clear the 140 character minimum length threshold set by the heuristic. ".repeat(
      3,
    )
    const html = `<html><body><ul><li><p>${prose}</p></li></ul></body></html>`
    const doc = parseLinkedomHTML(html, "https://example.com")
    expect(await isProbablyReaderable(doc)).toBe(false)
  })

  it("accepts threshold override via options", async () => {
    const shortProse = "Three short sentences only. Not very long prose. Still qualifies."
    const html = `<html><body><p>${shortProse}</p></body></html>`
    const doc = parseLinkedomHTML(html, "https://example.com")
    expect(await isProbablyReaderable(doc, { minContentLength: 20, minScore: 1 })).toBe(true)
  })
})

describe("isProbablyReaderable (url input)", () => {
  it("honours request options when probing a URL", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn<(_url: string, init?: RequestInit) => Promise<Response>>(async (_url, init) => {
      expect(init?.signal).toBeDefined()
      controller.abort()
      expect(init?.signal?.aborted).toBe(true)
      return new Response("<p>Short content</p>", { headers: { "content-type": "text/html" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    await isProbablyReaderable("http://127.0.0.1/", {
      allowPrivateNetworks: true,
      userAgent: "agent-test",
      timeoutMs: 1000,
      signal: controller.signal,
    })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ "User-Agent": "agent-test" })
  })
  it("fetches the URL and scores the document", async () => {
    const html = `<html><body><article>${"<p>" + "Body prose long enough to pass 140 characters. ".repeat(4) + "</p>"}${"<p>" + "Second paragraph of similar length to push score above 20. ".repeat(4) + "</p>"}</article></body></html>`
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })),
    )
    expect(await isProbablyReaderable("https://public.example/")).toBe(true)
  })

  it("throws on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    )
    await expect(isProbablyReaderable("https://public.example/")).rejects.toThrow(/Failed to fetch/)
  })
})
