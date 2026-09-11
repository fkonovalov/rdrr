import { setTimeout } from "node:timers/promises"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parse } from "../../../rdrr"
import { parseRedditFeed } from "../feed"

vi.mock("node:timers/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers/promises")>()
  return { setTimeout: vi.fn<typeof actual.setTimeout>(actual.setTimeout) }
})

const URL = "https://www.reddit.com/r/ricohGR/comments/1wd9yit/gr_snap/"
const feed = (body: string) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed title must not replace the post</title>
  <entry><id>t3_1wd9yit</id><title>GR Snap &amp; recipes</title>
    <author><name>/u/photographer</name></author><category label="r/ricohGR"/>
    <updated>2026-09-12T10:00:00Z</updated><published>2026-09-11T08:00:00Z</published>
    <link href="${URL}"/><content type="html"><![CDATA[${body}]]></content>
  </entry>
  <entry><id>t1_comment</id><author><name>/u/reader</name></author>
    <updated>2026-09-11T09:00:00Z</updated><link href="${URL}comment/"/>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Thanks for the update!&lt;/p&gt;&lt;/div&gt;</content>
  </entry>
</feed>`
const response = (xml: string) => new Response(xml, { headers: { "content-type": "application/atom+xml" } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe("Reddit public feed", () => {
  it("routes directly to the feed and preserves body, code, metadata and comments", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response(
        feed(`<div class="md"><p>GPS from your phone.</p>
      <pre><code>const hasGps = 1 &lt; 2</code></pre><p>Last paragraph.</p></div>`),
      ),
    )
    vi.stubGlobal("fetch", fetch)
    const result = await parse(URL, { userAgent: "test-reader" })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe(`${URL}.rss`)
    expect(result).toMatchObject({
      title: "GR Snap & recipes",
      author: "/u/photographer",
      siteName: "r/ricohGR",
      published: "2026-09-11T08:00:00Z",
    })
    for (const text of ["GPS from your phone.", "const hasGps = 1 < 2", "Last paragraph.", "Thanks for the update!"]) {
      expect(result.content).toContain(text)
    }
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("user-agent")).toBe("test-reader")
  })

  it("preserves gallery links alongside captions and strips unsafe HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () =>
        response(
          feed(`<div class="md"><p>Camera caption.</p>
      <script>alert(1)</script><a href="javascript:alert(2)">bad link</a></div>
      <img src="https://preview.redd.it/photo.jpg" onerror="alert(3)">
      <a href="https://www.reddit.com/gallery/1wd9yit">[link]</a>`),
        ),
      ),
    )
    const result = await parse(URL)
    expect(result.content).toContain("Camera caption.")
    expect(result.content).toContain("https://www.reddit.com/gallery/1wd9yit")
    expect(result.content).toContain("https://preview.redd.it/photo.jpg")
    expect(result.content).not.toMatch(/alert\(|javascript:|onerror/)
  })

  it("rejects wrong-post feeds and HTTP 200 login pages", async () => {
    expect(() => parseRedditFeed(feed('<div class="md">Wrong post.</div>'), "other")).toThrow("did not contain post")
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(
        async () => new Response("<h1>Log in</h1>", { headers: { "content-type": "text/html" } }),
      ),
    )
    await expect(parse(URL)).rejects.toThrow("login or block page")
  })

  it("waits for the server's limit before retrying", async () => {
    vi.mocked(setTimeout).mockResolvedValue(undefined)
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "1", "x-ratelimit-reset": "2" } }),
      )
      .mockResolvedValueOnce(response(feed('<div class="md">Recovered content.</div>')))
    vi.stubGlobal("fetch", fetch)
    expect((await parse(URL)).content).toContain("Recovered content.")
    expect(setTimeout).toHaveBeenCalledWith(3000, undefined, { signal: expect.any(AbortSignal) })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("stops retrying when Reddit keeps returning 429", async () => {
    vi.mocked(setTimeout).mockResolvedValue(undefined)
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("", { status: 429 }))
    vi.stubGlobal("fetch", fetch)
    await expect(parse(URL)).rejects.toThrow("rate limit reached (429)")
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("does not wait an extra minute when Retry-After has already elapsed", async () => {
    vi.mocked(setTimeout).mockResolvedValue(undefined)
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          headers: { "retry-after": new Date(Date.now() - 60000).toUTCString() },
        }),
      )
      .mockResolvedValueOnce(response(feed('<div class="md">Recovered content.</div>')))
    vi.stubGlobal("fetch", fetch)
    expect((await parse(URL)).content).toContain("Recovered content.")
    expect(setTimeout).toHaveBeenCalledWith(1000, undefined, { signal: expect.any(AbortSignal) })
  })

  it("honors timeouts while waiting instead of sending another request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("", { status: 429 }))
    vi.stubGlobal("fetch", fetch)
    await expect(parse(URL, { timeoutMs: 10 })).rejects.toMatchObject({ name: "TimeoutError" })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("cancels a rate-limit wait when the caller aborts", async () => {
    const controller = new AbortController()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("", { status: 429 }))
    vi.stubGlobal("fetch", fetch)
    const pending = parse(URL, { signal: controller.signal })
    await vi.waitFor(() => expect(setTimeout).toHaveBeenCalledTimes(1))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("rejects oversized feeds before parsing them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response("", {
            headers: { "content-type": "application/atom+xml", "content-length": String(21 * 1024 * 1024) },
          }),
      ),
    )
    await expect(parse(URL)).rejects.toMatchObject({ name: "InputTooLargeError" })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    "<feed><entry><id>t3_1wd9yit</id><title>Title only</title>",
    feed('<div class="md">Body</div>').replace("</feed>", ""),
    feed('<div class="md">Body</div>').replace("</entry>", "</wrong>"),
    feed('<div class="md">Body</div>').replace(/<content[\s\S]*?<\/content>/, ""),
    '<!DOCTYPE feed [<!ENTITY body SYSTEM "file:///etc/passwd">]><feed>&body;</feed>',
  ])("rejects malformed or incomplete feeds instead of returning a title: %s", (xml) => {
    expect(() => parseRedditFeed(xml, "1wd9yit")).toThrow("Invalid Reddit feed")
  })

  it("keeps body text without the old md wrapper and accepts an explicitly empty body", () => {
    expect(parseRedditFeed(feed("<p>Complete body.</p>"), "1wd9yit").contentHtml).toContain("Complete body.")
    expect(parseRedditFeed(feed(""), "1wd9yit").title).toBe("GR Snap & recipes")
  })

  it("keeps unwrapped captions together with media links", () => {
    const result = parseRedditFeed(
      feed('<p>Caption outside the old wrapper.</p><a href="https://www.reddit.com/gallery/1wd9yit">[link]</a>'),
      "1wd9yit",
    )
    expect(result.contentHtml).toContain("Caption outside the old wrapper.")
    expect(result.contentHtml).toContain("https://www.reddit.com/gallery/1wd9yit")
  })

  it.each(["503", "terminated", "ECONNRESET", "incomplete XML"])("recovers from %s automatically", async (kind) => {
    vi.mocked(setTimeout).mockResolvedValue(undefined)
    const fetch = vi.fn<typeof globalThis.fetch>()
    if (kind === "503") fetch.mockResolvedValueOnce(new Response("", { status: 503, headers: { "retry-after": "1" } }))
    if (kind === "ECONNRESET")
      fetch.mockRejectedValueOnce(
        new TypeError("fetch failed", {
          cause: Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
        }),
      )
    if (kind === "terminated")
      fetch.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError("terminated"))
            },
          }),
          { headers: { "content-type": "application/atom+xml" } },
        ),
      )
    if (kind === "incomplete XML") fetch.mockResolvedValueOnce(response("<feed><entry><id>t3_1wd9yit</id>"))
    fetch.mockResolvedValueOnce(response(feed('<div class="md">Recovered content.</div>')))
    vi.stubGlobal("fetch", fetch)
    expect((await parse(URL)).content).toContain("Recovered content.")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(setTimeout).toHaveBeenCalledTimes(1)
  })

  it("handles a transient error followed by a rate limit within the same bounded operation", async () => {
    vi.mocked(setTimeout).mockResolvedValue(undefined)
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(response(feed('<div class="md">Recovered content.</div>')))
    vi.stubGlobal("fetch", fetch)
    expect((await parse(URL)).content).toContain("Recovered content.")
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(setTimeout).toHaveBeenNthCalledWith(2, 1000, undefined, { signal: expect.any(AbortSignal) })
  })

  it.each([403, 404, 501])("does not retry permanent HTTP %s errors", async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("", { status }))
    vi.stubGlobal("fetch", fetch)
    await expect(parse(URL)).rejects.toThrow(String(status))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("preserves the focused comment and supported query values", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(feed("<p>Post body.</p>")))
    vi.stubGlobal("fetch", fetch)
    const result = await parse(`${URL}comment/?sort=new&context=3&depth=2&utm_source=share`)
    expect(fetch.mock.calls[0]?.[0]).toBe(`${URL}comment/.rss?sort=new&context=3&depth=2`)
    expect(result.content).toContain("Thanks for the update!")
    await expect(parse(`${URL}missing/`)).rejects.toThrow("did not contain comment missing")
  })

  it("does not impose a limit and includes more than 100 comments", async () => {
    const xml = feed("<p>Post body.</p>")
    const comment = xml.match(/<entry><id>t1_comment[\s\S]*?<\/entry>/)?.[0] ?? ""
    const expanded = xml.replace(
      comment,
      Array.from({ length: 196 }, (_, i) => comment.replace("t1_comment", `t1_c${i}`)).join(""),
    )
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(expanded))
    vi.stubGlobal("fetch", fetch)
    const result = await parse("https://redd.it/1wd9yit")
    expect(fetch.mock.calls[0]?.[0]).toBe("https://www.reddit.com/comments/1wd9yit/.rss")
    expect((result.content.match(/Thanks for the update!/g) ?? []).length).toBe(196)
  })
})
