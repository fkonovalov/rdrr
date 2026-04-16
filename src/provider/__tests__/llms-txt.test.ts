import { afterEach, describe, expect, it, vi } from "vitest"
import { detectLlmsTxt } from "../llms-txt"

const md = `# Example llms.txt\n\nA well-formed document with enough body text to pass the minimum size threshold. This line exists only so the body has more than one hundred characters and the heading is recognised on the first 500 characters of the response.`

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const setFetch = (handler: (url: string) => Response) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => handler(typeof input === "string" ? input : input.toString())),
  )
}

describe("detectLlmsTxt", () => {
  it("returns content when /llms.txt exists", async () => {
    setFetch((url) => {
      if (url.endsWith("/llms.txt")) {
        return new Response(md, { status: 200, headers: { "content-type": "text/markdown" } })
      }
      return new Response("not found", { status: 404 })
    })
    const result = await detectLlmsTxt("https://example.com/some/page")
    expect(result?.llmsTxtUrl).toBe("https://example.com/llms.txt")
    expect(result?.llmsContent).toBe(md)
  })

  it("falls back to /.well-known/llms.txt", async () => {
    setFetch((url) => {
      if (url.endsWith("/.well-known/llms.txt")) {
        return new Response(md, { status: 200, headers: { "content-type": "text/markdown" } })
      }
      return new Response("", { status: 404 })
    })
    const result = await detectLlmsTxt("https://example.com/x")
    expect(result?.llmsTxtUrl).toBe("https://example.com/.well-known/llms.txt")
  })

  it("prefers root /llms.txt when both exist", async () => {
    setFetch(() => new Response(md, { status: 200, headers: { "content-type": "text/markdown" } }))
    const result = await detectLlmsTxt("https://example.com/x")
    expect(result?.llmsTxtUrl).toBe("https://example.com/llms.txt")
  })

  it("rejects non-text content types", async () => {
    setFetch(() => new Response(md, { status: 200, headers: { "content-type": "application/octet-stream" } }))
    expect(await detectLlmsTxt("https://example.com/")).toBeNull()
  })

  it("rejects bodies under 100 chars", async () => {
    setFetch(() => new Response("# tiny", { status: 200, headers: { "content-type": "text/markdown" } }))
    expect(await detectLlmsTxt("https://example.com/")).toBeNull()
  })

  it("rejects bodies without a leading heading", async () => {
    const noHeading = "just prose, ".repeat(20)
    setFetch(() => new Response(noHeading, { status: 200, headers: { "content-type": "text/markdown" } }))
    expect(await detectLlmsTxt("https://example.com/")).toBeNull()
  })

  it("returns null for invalid URL", async () => {
    expect(await detectLlmsTxt("not a url")).toBeNull()
  })

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down")
      }),
    )
    expect(await detectLlmsTxt("https://example.com/")).toBeNull()
  })

  it("rejects when content-length exceeds the max", async () => {
    setFetch(
      () =>
        new Response(md, {
          status: 200,
          headers: { "content-type": "text/markdown", "content-length": String(10_000_000) },
        }),
    )
    expect(await detectLlmsTxt("https://example.com/")).toBeNull()
  })
})
