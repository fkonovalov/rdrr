import { promises as dns } from "node:dns"
import { isIP } from "node:net"

// Hostnames that should never resolve against the host's loopback/network stack.
// Listed explicitly because they bypass URL-level IP literal checks.
const PRIVATE_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"])

export class PrivateNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PrivateNetworkError"
  }
}

/**
 * Reject URLs that would cause the process to fetch from private/internal networks.
 *
 * Covers:
 *   - Loopback (127.0.0.0/8, ::1)
 *   - Link-local incl. cloud metadata endpoints (169.254.0.0/16, fe80::/10)
 *   - Private IPv4 ranges (10/8, 172.16/12, 192.168/16, 0.0.0.0/8)
 *   - IPv6 ULA (fc00::/7), multicast, IPv4-mapped private addresses
 *   - Hostnames that resolve to any of the above
 *
 * Bypass with { allowPrivateNetworks: true } on ParseOptions.
 */
export const assertPublicUrl = async (url: string): Promise<void> => {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "")
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }

  if (PRIVATE_HOSTNAMES.has(hostname)) {
    throw new PrivateNetworkError(`Refusing to fetch private host: ${hostname}`)
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new PrivateNetworkError(`Refusing to fetch private IP: ${hostname}`)
    }
    return
  }

  try {
    const results = await dns.lookup(hostname, { all: true })
    for (const { address } of results) {
      if (isPrivateIp(address)) {
        throw new PrivateNetworkError(`Refusing to fetch ${hostname}: resolves to private IP ${address}`)
      }
    }
  } catch (err) {
    if (err instanceof PrivateNetworkError) throw err
    // DNS resolution failure -- let fetch() surface the network error later.
  }
}

const isPrivateIp = (ip: string): boolean => {
  const version = isIP(ip)
  if (version === 4) return isPrivateV4(ip)
  if (version === 6) return isPrivateV6(ip)
  return false
}

const isPrivateV4 = (ip: string): boolean => {
  const parts = ip.split(".").map(Number)
  const a = parts[0]
  const b = parts[1]
  if (a === undefined || b === undefined) return false
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 0) return true
  if (a >= 224) return true
  return false
}

const isPrivateV6 = (ip: string): boolean => {
  const lower = ip.toLowerCase()
  if (lower === "::" || lower === "::1") return true
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true
  if (lower.startsWith("fe80")) return true
  if (lower.startsWith("ff")) return true
  // IPv4-mapped in dotted form: ::ffff:127.0.0.1
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped?.[1]) return isPrivateV4(mapped[1])
  // IPv4-mapped in hex-compressed form: Node normalises ::ffff:127.0.0.1 to ::ffff:7f00:1
  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hexMapped?.[1] && hexMapped[2]) {
    const high = parseInt(hexMapped[1], 16)
    const low = parseInt(hexMapped[2], 16)
    const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
    return isPrivateV4(ipv4)
  }
  return false
}
