import { describe, expect, it } from "vitest"
import { assertPublicUrl, PrivateNetworkError } from "../ssrf"

describe("assertPublicUrl", () => {
  it("allows public IPv4", async () => {
    await expect(assertPublicUrl("https://1.1.1.1/")).resolves.toBeUndefined()
    await expect(assertPublicUrl("https://8.8.8.8/")).resolves.toBeUndefined()
  })

  it("allows public IPv6", async () => {
    await expect(assertPublicUrl("https://[2606:4700:4700::1111]/")).resolves.toBeUndefined()
  })

  it("blocks loopback hostnames", async () => {
    await expect(assertPublicUrl("http://localhost/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://LOCALHOST/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://ip6-localhost/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks loopback IPv4", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://127.5.5.5/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks loopback IPv6", async () => {
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://[::]/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks RFC1918 IPv4 ranges", async () => {
    await expect(assertPublicUrl("http://10.0.0.1/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://10.255.255.255/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://172.16.0.1/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://172.31.255.255/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://192.168.1.1/")).rejects.toThrow(PrivateNetworkError)
  })

  it("allows IPs outside RFC1918 172 range", async () => {
    await expect(assertPublicUrl("http://172.15.0.1/")).resolves.toBeUndefined()
    await expect(assertPublicUrl("http://172.32.0.1/")).resolves.toBeUndefined()
  })

  it("blocks link-local and cloud metadata endpoints", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://169.254.0.1/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks 0.0.0.0/8", async () => {
    await expect(assertPublicUrl("http://0.0.0.0/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://0.1.2.3/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks multicast/reserved (>=224)", async () => {
    await expect(assertPublicUrl("http://224.0.0.1/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://255.255.255.255/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks IPv6 ULA", async () => {
    await expect(assertPublicUrl("http://[fc00::1]/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://[fd12:3456:789a::1]/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks IPv6 link-local", async () => {
    await expect(assertPublicUrl("http://[fe80::1]/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks IPv6 multicast", async () => {
    await expect(assertPublicUrl("http://[ff02::1]/")).rejects.toThrow(PrivateNetworkError)
  })

  it("blocks IPv4-mapped IPv6 addresses pointing to private ranges", async () => {
    await expect(assertPublicUrl("http://[::ffff:127.0.0.1]/")).rejects.toThrow(PrivateNetworkError)
    await expect(assertPublicUrl("http://[::ffff:10.0.0.1]/")).rejects.toThrow(PrivateNetworkError)
  })

  it("rejects malformed URLs with generic Error", async () => {
    await expect(assertPublicUrl("not-a-url")).rejects.toThrow(/Invalid URL/)
  })

  it("PrivateNetworkError has the right name", () => {
    const err = new PrivateNetworkError("boom")
    expect(err.name).toBe("PrivateNetworkError")
    expect(err).toBeInstanceOf(Error)
  })
})
