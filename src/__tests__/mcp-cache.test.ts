import { describe, expect, it, vi } from "vitest"
import { createAsyncCache } from "../mcp/cache"

const makeClock = (start = 0) => {
  let time = start
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms
    },
  }
}

describe("createAsyncCache", () => {
  it("returns the cached value without recomputing", async () => {
    const cache = createAsyncCache<string>()
    const compute = vi.fn<() => Promise<string>>(async () => "value")

    expect(await cache.get("k", compute)).toBe("value")
    expect(await cache.get("k", compute)).toBe("value")
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it("computes independently per key", async () => {
    const cache = createAsyncCache<string>()

    expect(await cache.get("a", async () => "va")).toBe("va")
    expect(await cache.get("b", async () => "vb")).toBe("vb")
    expect(cache.size()).toBe(2)
  })

  it("expires entries after the TTL", async () => {
    const clock = makeClock()
    const cache = createAsyncCache<string>({ ttlMs: 1000, now: clock.now })
    const compute = vi.fn<() => Promise<string>>(async () => "value")

    await cache.get("k", compute)
    clock.advance(999)
    await cache.get("k", compute)
    expect(compute).toHaveBeenCalledTimes(1)

    clock.advance(1)
    await cache.get("k", compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it("evicts the least-recently-used entry beyond maxEntries", async () => {
    const cache = createAsyncCache<string>({ maxEntries: 2 })
    const computeA = vi.fn<() => Promise<string>>(async () => "a")
    const computeB = vi.fn<() => Promise<string>>(async () => "b")

    await cache.get("a", computeA)
    await cache.get("b", computeB)
    await cache.get("a", computeA) // refresh recency: "b" is now the oldest
    await cache.get("c", async () => "c") // evicts "b"

    expect(cache.size()).toBe(2)
    await cache.get("a", computeA)
    expect(computeA).toHaveBeenCalledTimes(1)
    await cache.get("b", computeB)
    expect(computeB).toHaveBeenCalledTimes(2)
  })

  it("deduplicates concurrent computes for the same key (single-flight)", async () => {
    const cache = createAsyncCache<string>()
    let resolve!: (value: string) => void
    const compute = vi.fn<() => Promise<string>>(() => new Promise<string>((r) => (resolve = r)))

    const first = cache.get("k", compute)
    const second = cache.get("k", compute)
    resolve("value")

    expect(await first).toBe("value")
    expect(await second).toBe("value")
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it("bypasses the stored value with force", async () => {
    const cache = createAsyncCache<string>()
    let counter = 0
    const compute = vi.fn<() => Promise<string>>(async () => `v${++counter}`)

    expect(await cache.get("k", compute)).toBe("v1")
    expect(await cache.get("k", compute, { force: true })).toBe("v2")
    expect(compute).toHaveBeenCalledTimes(2)
    // The forced result replaces the cached value.
    expect(await cache.get("k", compute)).toBe("v2")
  })

  it("does not cache failed computes", async () => {
    const cache = createAsyncCache<string>()
    const compute = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("recovered")

    await expect(cache.get("k", compute)).rejects.toThrow("boom")
    expect(await cache.get("k", compute)).toBe("recovered")
    expect(compute).toHaveBeenCalledTimes(2)
  })
})
