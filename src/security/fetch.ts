import { Agent } from "undici"
import { mergeSignals } from "../shared"
import { assertPublicUrl, PrivateNetworkError, publicLookup } from "./ssrf"

const PUBLIC_AGENT = new Agent({ connect: { lookup: publicLookup }, autoSelectFamily: true })

interface FetchOptions extends RequestInit {
  allowPrivateNetworks?: boolean
}

export const fetchResource = async (input: string, options: FetchOptions = {}): Promise<Response> => {
  let url = new URL(input)
  const headers = new Headers(options.headers)
  const init: FetchOptions & { signal: AbortSignal } = { ...options, signal: options.signal ?? mergeSignals(25000) }
  for (let redirects = 0; redirects <= 10; redirects++) {
    init.signal.throwIfAborted()
    if (!options.allowPrivateNetworks) await assertPublicUrl(url.href)
    init.signal.throwIfAborted()
    const request = {
      ...init,
      redirect: "manual" as const,
      dispatcher: options.allowPrivateNetworks ? undefined : PUBLIC_AGENT,
    }
    let response: Response
    try {
      response = await globalThis.fetch(url.href, request)
    } catch (error) {
      if (error instanceof Error && error.cause instanceof PrivateNetworkError) throw error.cause
      throw error
    }
    if (options.redirect === "manual" || ![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get("location")
    if (!location) return response
    await response.body?.cancel()
    if (options.redirect === "error") throw new TypeError("Redirect not allowed")
    const next = new URL(location, url)
    if (url.protocol === "https:" && next.protocol === "http:") throw new Error("Refusing https -> http redirect")
    if (url.origin !== next.origin) {
      for (const name of ["authorization", "cookie", "proxy-authorization"]) headers.delete(name)
    }
    if (
      (response.status === 303 && init.method !== "HEAD") ||
      ([301, 302].includes(response.status) && init.method === "POST")
    ) {
      init.method = "GET"
      init.body = undefined
      for (const name of ["content-type", "content-length", "content-encoding", "content-language", "content-location"])
        headers.delete(name)
    }
    init.headers = headers
    url = next
  }
  throw new Error("Too many redirects")
}
