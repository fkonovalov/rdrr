import { afterEach, describe, expect, it, vi } from "vitest"
import { parseHtml } from "../../provider/web"

const HN = `<table class="fatitem"><tr class="athing"><td class="titleline"><a href="https://example.com/project">A useful project</a></td></tr><tr><td><a class="hnuser">founder</a><span class="age" title="2026-09-09T01:00:00"></span></td></tr></table>
<table><tr class="comtr" id="2"><td class="ind"><img width="0"></td><td><a class="hnuser">alice</a><span class="age" title="2026-09-09T02:00:00"></span><div class="commtext">Parent comment with useful context.</div></td></tr>
<tr class="comtr" id="3"><td class="ind"><img width="40"></td><td><a class="hnuser">bob</a><span class="age" title="2026-09-09T03:00:00"></span><div class="commtext">Nested reply with another perspective.</div></td></tr></table>`

afterEach(() => vi.unstubAllGlobals())

describe("content fidelity", () => {
  it("forwards cancellation and User-Agent to asynchronous site requests", async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        expect(new Headers(init?.headers).get("User-Agent")).toBe("agent-test")
        controller.abort()
        expect(init?.signal?.aborted).toBe(true)
        throw controller.signal.reason
      }),
    )
    await expect(
      parseHtml("<html><body></body></html>", {
        url: "https://wiki.c2.com/?DesignPatterns",
        signal: controller.signal,
        userAgent: "agent-test",
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("preserves HN authors, permalinks, replies and upstream continuation", async () => {
    const result = await parseHtml(`${HN}<a class="morelink" href="item?id=1&p=2">More</a>`, {
      url: "https://news.ycombinator.com/item?id=1",
    })
    expect(result.author).toBe("founder")
    for (const text of [
      "alice",
      "bob",
      "Parent comment",
      "Nested reply",
      "item?id=2",
      "item?id=3",
      "More comments are available",
    ])
      expect(result.content).toContain(text)
    expect(result.content.indexOf("Parent comment")).toBeLessThan(result.content.indexOf("Nested reply"))
    expect(result.nextPageUrl).toBe("https://news.ycombinator.com/item?id=1&p=2")
  })

  it.each(["https://attacker.example/item?id=1", "javascript:alert(1)", "item?id=2&p=2", ""])(
    "does not invent or trust invalid continuation %s",
    async (href) => {
      const result = await parseHtml(`${HN}<a class="morelink" href="${href}">More</a>`, {
        url: "https://news.ycombinator.com/item?id=1",
      })
      expect(result.nextPageUrl).toBeUndefined()
      expect(result.content).not.toContain("More comments are available")
    },
  )

  it("preserves text-bearing heading anchors while removing decorative permalinks", async () => {
    const result = await parseHtml(
      `<html><body><main>
        <h1>Array reference</h1>
        <p>${"This reference explains array mapping with parameters and working examples. ".repeat(6)}</p>
        <h2 id="syntax"><a class="heading-anchor" href="#syntax">Syntax</a></h2>
        <pre><code>map(callbackFn, thisArg)</code></pre>
        <h3 id="parameters"><a class="heading-anchor" href="#parameters"><code>callbackFn</code> Parameters</a></h3>
        <p>The callback receives an element, its index and the source array.</p>
        <h2 id="examples">Examples<a class="anchor" href="#examples" aria-label="Permalink">#</a></h2>
        <p>A mapping creates a new array without changing the original.</p>
        <h2 id="ru"><a class="heading-anchor" href="#ru">Примеры</a></h2>
        <p>Используйте функцию для преобразования элементов исходного массива.</p>
      </main></body></html>`,
      { url: "https://example.com/reference" },
    )
    expect(result.content).toMatch(/^## .*Syntax/m)
    expect(result.content).toMatch(/^### .*callbackFn.*Parameters/m)
    expect(result.content).toMatch(/^## .*Примеры/m)
    expect(result.content).toContain("## Examples")
    expect(result.content).not.toContain("[#]")
    expect(result.content).not.toContain("Examples#")
    expect(result.content).toContain("map(callbackFn, thisArg)")
  })

  it("keeps code, table values and article links while dropping navigation", async () => {
    const result = await parseHtml(
      `<html><head><title>Parser contract</title></head><body><nav>UNWANTED_NAVIGATION</nav><article><h1>Parser contract</h1><p>${"This article explains a practical parser contract with important implementation details. ".repeat(5)}</p><pre><code class="language-ts">const value = a &lt; b ? "small" : "large"</code></pre><table><tr><th>Mode</th><th>Limit</th></tr><tr><td>strict</td><td>42</td></tr></table><p>Read the <a href="/reference">complete reference</a> for more details.</p></article></body></html>`,
      { url: "https://example.com/article" },
    )
    expect(result.content).toContain('const value = a < b ? "small" : "large"')
    expect(result.content).toContain("```")
    expect(result.content).toContain("strict")
    expect(result.content).toContain("42")
    expect(result.content).toContain("[complete reference](https://example.com/reference)")
    expect(result.content).not.toContain("UNWANTED_NAVIGATION")
  })
})
