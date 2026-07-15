import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ParseResult } from "../types"
import { createIdleTimer, installProcessGuards } from "../mcp/guards"
import { createServer } from "../mcp/server"
import { PrivateNetworkError } from "../security/ssrf"

vi.mock("../rdrr", () => ({ parse: vi.fn<() => Promise<ParseResult>>() }))
vi.mock("../extract/readerable", () => ({ isProbablyReaderable: vi.fn<() => Promise<boolean>>(async () => true) }))

const { parse } = await import("../rdrr")
const { isProbablyReaderable } = await import("../extract/readerable")
const parseMock = vi.mocked(parse)
const readerableMock = vi.mocked(isProbablyReaderable)

const webpage = (over: Partial<ParseResult> = {}): ParseResult => ({
  type: "webpage",
  title: "Sample Title",
  author: "Ada Lovelace",
  content: "First paragraph of the article.\n\nSecond paragraph with more detail.",
  description: "A sample page",
  domain: "example.com",
  siteName: "Example",
  language: "en",
  published: null,
  wordCount: 11,
  readTime: "1 min read",
  ...over,
})

const connect = async () => {
  const server = createServer({ version: "0.0.0-test" })
  const client = new Client({ name: "test-client", version: "0.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return client
}

const structuredOf = async (client: Client, name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args })
  expect(result.isError).toBeFalsy()
  return result.structuredContent as Record<string, unknown>
}

beforeEach(() => {
  parseMock.mockReset()
  readerableMock.mockReset()
  readerableMock.mockResolvedValue(true)
})

describe("tool registration", () => {
  it("exposes the four tools with descriptions and read-only annotations", async () => {
    const client = await connect()
    const { tools } = await client.listTools()

    expect(tools.map((t) => t.name).sort()).toEqual(["check", "extract_html", "fetch", "parallel_fetch"])
    for (const tool of tools) {
      expect(tool.description).toBeTruthy()
      expect(tool.annotations?.readOnlyHint).toBe(true)
      expect(tool.annotations?.idempotentHint).toBe(true)
      expect(tool.outputSchema).toBeTruthy()
    }
  })
})

describe("fetch", () => {
  it("returns markdown text plus structured metadata", async () => {
    parseMock.mockResolvedValue(webpage())
    const client = await connect()

    const result = await client.callTool({ name: "fetch", arguments: { url: "https://example.com/a" } })

    expect(result.isError).toBeFalsy()
    const structured = result.structuredContent as Record<string, unknown>
    expect(structured.title).toBe("Sample Title")
    expect(structured.author).toBe("Ada Lovelace")
    expect(structured.type).toBe("webpage")
    expect(structured.domain).toBe("example.com")
    expect(structured.wordCount).toBe(11)
    // The body lives only in the text block; structuredContent is metadata.
    expect(structured.content).toBeUndefined()
    expect(structured.truncated).toBeUndefined()
    expect(structured.extractionEmpty).toBeUndefined()

    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text
    expect(text).toContain('title: "Sample Title"')
    expect(text).toContain('source: "https://example.com/a"')
    expect(text).toContain("First paragraph of the article.")
  })

  it("does not bind a caller's abort signal to the shared cache entry", async () => {
    // The in-flight promise is shared by concurrent callers (single-flight);
    // one caller's cancellation must not reject the others, so no external
    // signal is forwarded. timeoutMs still bounds the fetch inside parse().
    parseMock.mockResolvedValue(webpage())
    const client = await connect()

    await client.callTool({ name: "fetch", arguments: { url: "https://example.com/a" } })

    const options = parseMock.mock.calls[0]![1]
    expect(options?.signal).toBeUndefined()
  })

  it("truncates to the token budget and paginates via startIndex", async () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} ${"x".repeat(60)}`)
    parseMock.mockResolvedValue(webpage({ content: paragraphs.join("\n\n") }))
    const client = await connect()

    const first = await client.callTool({
      name: "fetch",
      arguments: { url: "https://example.com/long", maxTokens: 40 },
    })
    const firstText = (first.content as Array<{ text: string }>)[0]!.text
    const firstStructured = first.structuredContent as Record<string, unknown>
    const truncated = firstStructured.truncated as { kept: number; total: number; nextStartIndex: number; hint: string }
    expect(firstText).toContain("Paragraph 0")
    expect(firstText).toContain("[truncated")
    expect(truncated.nextStartIndex).toBeGreaterThan(0)
    expect(truncated.total).toBeGreaterThan(truncated.kept)
    expect(truncated.hint).toContain(`startIndex=${truncated.nextStartIndex}`)

    const second = await client.callTool({
      name: "fetch",
      arguments: { url: "https://example.com/long", maxTokens: 40, startIndex: truncated.nextStartIndex },
    })
    const secondText = (second.content as Array<{ text: string }>)[0]!.text
    expect(secondText).toContain("Paragraph")
    expect(secondText).not.toContain("Paragraph 0")
    // Same URL: the second page must come from the cache.
    expect(parseMock).toHaveBeenCalledTimes(1)
  })

  it("hard-cuts a single oversized paragraph so the budget always holds", async () => {
    parseMock.mockResolvedValue(webpage({ content: "y".repeat(4000) }))
    const client = await connect()

    const result = await client.callTool({
      name: "fetch",
      arguments: { url: "https://example.com/wall", maxTokens: 100 },
    })
    const text = (result.content as Array<{ text: string }>)[0]!.text
    const structured = result.structuredContent as Record<string, unknown>
    const truncated = structured.truncated as { nextStartIndex: number }
    expect(text.match(/y+/)![0]!.length).toBeLessThan(500)
    expect(truncated.nextStartIndex).toBe(400)
  })

  it("includes a quality report when includeQuality is set", async () => {
    parseMock.mockResolvedValue(webpage())
    const client = await connect()

    const structured = await structuredOf(client, "fetch", { url: "https://example.com/a", includeQuality: true })
    const quality = structured.quality as { score: number; verdict: string; signals: Record<string, unknown> }
    expect(quality.score).toBeGreaterThanOrEqual(0)
    expect(["good", "partial", "poor"]).toContain(quality.verdict)
    expect(quality.signals.hasTitle).toBe(true)
  })

  it("restricts the response to the requested fields", async () => {
    parseMock.mockResolvedValue(webpage())
    const client = await connect()

    const structured = await structuredOf(client, "fetch", { url: "https://example.com/a", fields: ["title"] })
    expect(structured.title).toBe("Sample Title")
    expect(structured.content).toBeUndefined()
    expect(structured.author).toBeUndefined()
    expect(structured.type).toBeUndefined()
    expect(structured.quality).toBeUndefined()
  })

  it("flags empty extractions in both structured and text output", async () => {
    parseMock.mockResolvedValue(webpage({ content: "  \n " }))
    const client = await connect()

    const result = await client.callTool({ name: "fetch", arguments: { url: "https://example.com/spa" } })
    const structured = result.structuredContent as Record<string, unknown>
    expect(structured.extractionEmpty).toBe(true)

    const text = (result.content as Array<{ text: string }>)[0]!.text
    expect(text).toContain('extraction: "empty"')
    expect(text).toContain("No content could be extracted")
  })

  it("returns isError with a classified kind for known failures", async () => {
    parseMock.mockRejectedValue(new PrivateNetworkError("Refusing to fetch private IP: 127.0.0.1"))
    const client = await connect()

    const result = await client.callTool({ name: "fetch", arguments: { url: "https://127.0.0.1/x" } })
    expect(result.isError).toBe(true)
    const structured = result.structuredContent as { error: { kind: string; message: string } }
    expect(structured.error.kind).toBe("private-network")
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain("Refusing to fetch")
  })

  it("serves repeat calls from the cache and honours force", async () => {
    parseMock.mockResolvedValue(webpage())
    const client = await connect()

    await client.callTool({ name: "fetch", arguments: { url: "https://example.com/a" } })
    await client.callTool({ name: "fetch", arguments: { url: "https://example.com/a" } })
    expect(parseMock).toHaveBeenCalledTimes(1)

    await client.callTool({ name: "fetch", arguments: { url: "https://example.com/a", force: true } })
    expect(parseMock).toHaveBeenCalledTimes(2)
  })
})

describe("parallel_fetch", () => {
  it("returns partial success when one URL fails", async () => {
    parseMock.mockImplementation(async (url: string) => {
      if (url.includes("bad")) throw new Error("Failed to fetch: 404 Not Found")
      return webpage({ title: `Title for ${url}` })
    })
    const client = await connect()

    const structured = await structuredOf(client, "parallel_fetch", {
      urls: ["https://example.com/good", "https://example.com/bad"],
    })
    const results = structured.results as Array<Record<string, unknown>>
    expect(results).toHaveLength(2)
    expect(results[0]!.title).toBe("Title for https://example.com/good")
    expect(results[0]!.error).toBeUndefined()
    expect((results[1]!.error as { kind: string }).kind).toBe("http")
    expect((structured.meta as { requested: number }).requested).toBe(2)
  })

  it("drops the tail of the batch when the response budget is exhausted", async () => {
    parseMock.mockImplementation(async (url: string) => webpage({ title: url, content: "z".repeat(200_000) }))
    const client = await connect()

    const structured = await structuredOf(client, "parallel_fetch", {
      urls: ["https://example.com/1", "https://example.com/2", "https://example.com/3"],
      perItemMaxTokens: 8000,
    })
    const results = structured.results as Array<Record<string, unknown>>
    const meta = structured.meta as { requested: number; returned: number; truncatedAt: number }
    expect(results.length).toBeLessThan(3)
    expect(meta.truncatedAt).toBe(results.length)
    expect(meta.returned).toBe(results.length)
  })
})

describe("check", () => {
  it("routes typed URLs without probing the network", async () => {
    const client = await connect()

    const structured = await structuredOf(client, "check", { url: "https://youtu.be/dQw4w9WgXcQ" })
    expect(structured.type).toBe("youtube")
    expect(structured.readable).toBe(true)
    expect(readerableMock).not.toHaveBeenCalled()
  })

  it("probes generic webpages with the readerable heuristic", async () => {
    readerableMock.mockResolvedValue(false)
    const client = await connect()

    const structured = await structuredOf(client, "check", { url: "http://example.com/article/" })
    expect(structured.type).toBe("webpage")
    expect(structured.readable).toBe(false)
    expect(structured.normalizedUrl).toBe("https://example.com/article")
  })
})

describe("extract_html", () => {
  it("runs the extraction pipeline on provided HTML", async () => {
    const html =
      "<html><head><title>Smoke</title></head><body><article><h1>Smoke</h1>" +
      "<p>Hello from the rdrr MCP test. This paragraph carries the content.</p></article></body></html>"
    const client = await connect()

    const result = await client.callTool({
      name: "extract_html",
      arguments: { html, url: "https://example.com/smoke" },
    })
    expect(result.isError).toBeFalsy()
    const structured = result.structuredContent as Record<string, unknown>
    const text = (result.content as Array<{ text: string }>)[0]!.text
    expect(structured.type).toBe("webpage")
    expect(text).toContain("Hello from the rdrr MCP test")
    expect(parseMock).not.toHaveBeenCalled()
  })
})

describe("process guards", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const makeFakeProcess = () => {
    const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    return proc
  }

  it("logs uncaught exceptions and rejections to stderr instead of crashing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const proc = makeFakeProcess()
    installProcessGuards(proc as unknown as NodeJS.Process)

    expect(() => proc.emit("uncaughtException", new Error("EPIPE"))).not.toThrow()
    expect(() => proc.emit("unhandledRejection", new Error("late"))).not.toThrow()
    // Without a listener, an EventEmitter "error" event throws -- the guard absorbs it.
    expect(() => proc.stdout.emit("error", new Error("EPIPE"))).not.toThrow()
    expect(errorSpy).toHaveBeenCalledWith("[rdrr-mcp] uncaught exception:", "EPIPE")
  })

  it("pauses the idle timeout while a tool call is in flight", () => {
    vi.useFakeTimers()
    const expire = vi.fn<() => void>()
    const timer = createIdleTimer(1000, expire)

    vi.advanceTimersByTime(900)
    timer.begin()
    // A tool call slower than the idle timeout must never kill the server.
    vi.advanceTimersByTime(5000)
    expect(expire).not.toHaveBeenCalled()

    timer.end()
    vi.advanceTimersByTime(999)
    expect(expire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(expire).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("waits for every overlapping call to finish before rearming", () => {
    vi.useFakeTimers()
    const expire = vi.fn<() => void>()
    const timer = createIdleTimer(1000, expire)

    timer.begin()
    timer.begin()
    timer.end()
    vi.advanceTimersByTime(5000)
    expect(expire).not.toHaveBeenCalled()

    timer.end()
    vi.advanceTimersByTime(1000)
    expect(expire).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("is disabled when no timeout is configured", () => {
    vi.useFakeTimers()
    const expire = vi.fn<() => void>()
    createIdleTimer(Number.NaN, expire)
    createIdleTimer(0, expire)
    vi.advanceTimersByTime(1_000_000)
    expect(expire).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
