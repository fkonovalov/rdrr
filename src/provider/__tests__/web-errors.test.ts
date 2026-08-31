import { afterEach, describe, expect, it, vi } from "vitest"
import { parseWeb } from "../web"

const throwWithCause = (code: string): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const err = new TypeError("fetch failed")
      ;(err as { cause?: unknown }).cause = { code }
      throw err
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("network error reporting", () => {
  it("surfaces the errno and a hint instead of bare fetch failed", async () => {
    throwWithCause("ENOTFOUND")

    await expect(parseWeb("https://no-such-host.example", { allowPrivateNetworks: true })).rejects.toThrow(
      "Could not fetch no-such-host.example: ENOTFOUND (DNS lookup failed; the domain may not exist)",
    )
  })

  it("falls back to the cause code without a hint for unknown errnos", async () => {
    throwWithCause("EPROTO")

    await expect(parseWeb("https://tls-broken.example", { allowPrivateNetworks: true })).rejects.toThrow(
      "Could not fetch tls-broken.example: EPROTO",
    )
  })

  it("explains 404 as a likely wrong URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
    )

    await expect(parseWeb("https://real-host.example/missing", { allowPrivateNetworks: true })).rejects.toThrow(
      /404 Not Found.*URL itself is likely wrong/,
    )
  })
})
