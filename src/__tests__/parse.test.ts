import { afterEach, describe, expect, it, vi } from "vitest"
import { parse } from "../rdrr"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("parse input validation", () => {
  it("throws when url is empty", async () => {
    await expect(parse("")).rejects.toThrow(/URL is required/)
  })

  it("throws on unparseable strings", async () => {
    // Any string gets `https://` prefixed by ensureProtocol and then normalised.
    // The only reliable way to hit the `Invalid URL` branch is to feed a URL
    // that cannot be parsed even after prefixing.
    await expect(parse("https://")).rejects.toThrow(/Invalid URL/)
  })

  it("prepends https:// to bare hosts before validating", async () => {
    // Will fail at the network step, but only after ensureProtocol promoted it.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          "<html><head><title>T</title></head><body><article><p>hi</p></article></body></html>",
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      ),
    )
    const result = await parse("example.com")
    expect(result.type).toBe("webpage")
  })
})

describe("parse routing", () => {
  it("routes https://x.com/handle to x-profile provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.includes("api.fxtwitter.com") && !url.includes("/statuses")) {
          return new Response(
            JSON.stringify({
              code: 200,
              user: { screen_name: "someone", name: "Someone", description: "bio", followers: 0, following: 0, tweets: 0, joined: "", url: "" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        }
        if (url.includes("/statuses")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  id: "1",
                  url: "https://x.com/someone/status/1",
                  text: "hello world",
                  created_at: "2025-01-01T00:00:00Z",
                  created_timestamp: 1735689600,
                  author: { screen_name: "someone", name: "Someone" },
                  likes: 0,
                  retweets: 0,
                  replies: 0,
                  views: 0,
                },
              ],
              cursor: {},
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const result = await parse("https://x.com/someone", { limit: 1 })
    expect(result.type).toBe("x-profile")
  })

  it("routes github URLs to github provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.includes("/issues/1/comments")) {
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
        }
        if (url.includes("/issues/1")) {
          return new Response(
            JSON.stringify({
              title: "t",
              number: 1,
              state: "open",
              user: { login: "a" },
              created_at: "2025-01-01T00:00:00Z",
              body: null,
              labels: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const result = await parse("https://github.com/acme/widget/issues/1")
    expect(result.type).toBe("github")
  })

  it("appends llms.txt content when includeLlmsTxt is true", async () => {
    const md = `# Site llms\n\nThis file has more than one hundred characters of body prose so it passes the minimum-size and format gate that detectLlmsTxt enforces during validation.`
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.endsWith("/llms.txt")) {
          return new Response(md, { status: 200, headers: { "content-type": "text/markdown" } })
        }
        if (url.endsWith("/.well-known/llms.txt")) {
          return new Response("", { status: 404 })
        }
        return new Response(
          "<html><head><title>Page</title></head><body><article><p>Body content here enough to pass the threshold.</p></article></body></html>",
          { status: 200, headers: { "content-type": "text/html" } },
        )
      }),
    )

    const result = await parse("https://public.example/page", { includeLlmsTxt: true })
    expect(result.llmsTxt).toBe(md)
    expect(result.content).toContain("## llms.txt")
    expect(result.content).toContain("Source: https://public.example/llms.txt")
  })
})
