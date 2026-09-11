import type { LookupAddress, LookupAllOptions } from "node:dns"
import type { AddressInfo } from "node:net"
import { createServer } from "node:http"
import { gzipSync } from "node:zlib"
import { afterEach, describe, expect, it, vi } from "vitest"
import { readResponseText } from "../body"
import { fetchResource } from "../fetch"
import { publicLookup } from "../ssrf"

const { lookupMock } = vi.hoisted(() => ({
  lookupMock:
    vi.fn<
      (
        hostname: string,
        options: LookupAllOptions,
        callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
      ) => void
    >(),
}))
vi.mock("node:dns", () => ({ lookup: lookupMock }))
afterEach(() => {
  lookupMock.mockReset()
  vi.unstubAllGlobals()
})

describe("connection safety", () => {
  it("rejects a rebound private address at connection time before reaching the server", async () => {
    let requests = 0
    const server = createServer((_req, res) => {
      requests++
      res.end("secret")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const port = (server.address() as AddressInfo).port
    lookupMock.mockImplementationOnce((_host, _opts, cb) => cb(null, [{ address: "1.1.1.1", family: 4 }]))
    lookupMock.mockImplementation((_host, _opts, cb) => cb(null, [{ address: "127.0.0.1", family: 4 }]))
    try {
      await new Promise<void>((resolve, reject) =>
        publicLookup("rebind.example", { all: true }, (error, address) => {
          if (error) return reject(error)
          expect(address).toEqual([{ address: "1.1.1.1", family: 4 }])
          resolve()
        }),
      )
      await expect(fetchResource(`http://rebind.example:${port}/`)).rejects.toMatchObject({
        name: "PrivateNetworkError",
      })
      expect(requests).toBe(0)
      expect(lookupMock).toHaveBeenCalledTimes(2)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("bounds a DNS lookup that never completes", async () => {
    lookupMock.mockImplementation(() => {})
    await expect(fetchResource("http://slow-dns.example/", { signal: AbortSignal.timeout(30) })).rejects.toMatchObject({
      name: "TimeoutError",
    })
  })

  it("checks redirect destinations and releases the discarded body", async () => {
    const cancel = vi.fn<() => void>()
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    await expect(fetchResource("http://public.example/")).rejects.toMatchObject({ name: "PrivateNetworkError" })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("strips credentials across origins while preserving 307 request bodies", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "https://other.example/" } }))
      .mockResolvedValueOnce(new Response("ok"))
    vi.stubGlobal("fetch", fetchMock)
    const res = await fetchResource("https://public.example/", {
      method: "POST",
      body: "payload",
      headers: { Authorization: "secret", Cookie: "session=secret" },
    })
    expect(await res.text()).toBe("ok")
    const init = fetchMock.mock.calls[1]?.[1]
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe("payload")
    expect(new Headers(init?.headers).has("authorization")).toBe(false)
    expect(new Headers(init?.headers).has("cookie")).toBe(false)
  })

  it("limits decompressed bytes from a real compressed HTTP response", async () => {
    const data = gzipSync("a".repeat(4096))
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip", "content-length": data.length })
      res.end(data)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const res = await fetchResource(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, {
        allowPrivateNetworks: true,
      })
      await expect(readResponseText(res, 512)).rejects.toMatchObject({ name: "InputTooLargeError" })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
