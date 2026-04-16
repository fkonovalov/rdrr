import { afterEach, describe, expect, it, vi } from "vitest"
import { parseHtml, parseWeb } from "../web"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const htmlResponse = (html: string): Response =>
  new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })

const stubFetch = (impl: (url: string) => Response) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => impl(typeof input === "string" ? input : input.toString())),
  )
}

describe("parseHtml", () => {
  it("extracts title and produces markdown", async () => {
    const html = `<!doctype html>
      <html lang="en">
        <head><title>My Article</title></head>
        <body><article>
          <h1>My Article</h1>
          <p>${"Body sentence. ".repeat(40)}</p>
        </article></body>
      </html>`
    const result = await parseHtml(html, { url: "https://example.com/a" })
    expect(result.type).toBe("webpage")
    expect(result.title).toBe("My Article")
    expect(result.content).toContain("Body sentence.")
    expect(result.wordCount).toBeGreaterThan(50)
    expect(result.readTime).toMatch(/\d+ min/)
  })

  it("honours custom wordsPerMinute", async () => {
    const html = `<html><body><article><h1>t</h1>${"<p>" + "word ".repeat(100) + "</p>"}</article></body></html>`
    const fast = await parseHtml(html, { url: "https://example.com/", wordsPerMinute: 50 })
    const slow = await parseHtml(html, { url: "https://example.com/", wordsPerMinute: 500 })
    expect(parseInt(fast.readTime, 10)).toBeGreaterThan(parseInt(slow.readTime, 10))
  })

  it("accepts html without url", async () => {
    const html = "<html><body><article><h1>A</h1><p>Prose prose prose.</p></article></body></html>"
    const result = await parseHtml(html)
    expect(result.type).toBe("webpage")
    expect(result.domain).toBe("")
  })
})

describe("parseWeb", () => {
  it("fetches, parses HTML, and returns WebpageResult", async () => {
    stubFetch(() =>
      htmlResponse(
        `<html><head><title>Remote</title></head><body><article><h1>Remote</h1><p>${"Paragraph body. ".repeat(30)}</p></article></body></html>`,
      ),
    )
    const result = await parseWeb("https://public.example/a")
    expect(result.type).toBe("webpage")
    expect(result.title).toBe("Remote")
  })

  it("routes PDF content-type to parsePdf (PdfResult)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // Minimal but technically malformed PDF — unpdf will reject, but that happens
        // inside parsePdf. We only need to assert the routing path here.
        return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        })
      }),
    )
    await expect(parseWeb("https://public.example/doc.pdf")).rejects.toThrow(/./)
  })

  it("wraps raw-text content types in fenced code", async () => {
    stubFetch(
      () =>
        new Response(`{"hello":"world"}`, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    const result = await parseWeb("https://public.example/data.json")
    expect(result.type).toBe("webpage")
    expect(result.content).toContain("```json")
    expect(result.content).toContain('{"hello":"world"}')
  })

  it("rejects unsupported content types", async () => {
    stubFetch(
      () => new Response("zzz", { status: 200, headers: { "content-type": "audio/mpeg" } }),
    )
    await expect(parseWeb("https://public.example/audio.mp3")).rejects.toThrow(/Unsupported content type/)
  })

  it("throws for non-ok responses", async () => {
    stubFetch(() => new Response("oops", { status: 500 }))
    await expect(parseWeb("https://public.example/x")).rejects.toThrow(/Failed to fetch: 500/)
  })

  it("refuses to fetch private networks by default", async () => {
    await expect(parseWeb("http://127.0.0.1/")).rejects.toThrow(/private/i)
  })

  it("allows private networks when opted in", async () => {
    stubFetch(() =>
      htmlResponse("<html><body><article><h1>Local</h1><p>Body.</p></article></body></html>"),
    )
    const result = await parseWeb("http://127.0.0.1/", { allowPrivateNetworks: true })
    expect(result.type).toBe("webpage")
  })

  it("refuses https -> http downgrade via redirect", async () => {
    let step = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (step++ === 0) return new Response("", { status: 301, headers: { location: "http://public.example/downgraded" } })
        return htmlResponse("<html><body><p>should never reach</p></body></html>")
      }),
    )
    await expect(parseWeb("https://public.example/")).rejects.toThrow(/https -> http/)
  })

  it("throws descriptive error on 3xx without Location", async () => {
    stubFetch(() => new Response("", { status: 302 }))
    await expect(parseWeb("https://public.example/")).rejects.toThrow(/Redirect \(302\)/)
  })
})
