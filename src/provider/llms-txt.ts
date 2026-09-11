import type { ParseOptions } from "../types"
import { readResponseText } from "../security/body"
import { fetchWithRedirects } from "./web"

interface LlmsTxtResult {
  llmsTxtUrl?: string
  llmsContent?: string
}

const MAX_SIZE = 500_000

export const detectLlmsTxt = async (url: string, options?: ParseOptions): Promise<LlmsTxtResult | null> => {
  options?.signal?.throwIfAborted()
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return null
  }

  // The spec has drifted between /llms.txt and /.well-known/llms.txt;
  // race both so we pay at most one round-trip regardless of which a site adopts.
  const candidates = [`${origin}/llms.txt`, `${origin}/.well-known/llms.txt`]
  const results = await Promise.all(
    candidates.map(async (candidate) => ({ url: candidate, content: await tryFetch(candidate, options) })),
  )
  for (const { url: candidate, content } of results) {
    if (content) return { llmsTxtUrl: candidate, llmsContent: content }
  }

  return null
}

const tryFetch = async (url: string, options?: ParseOptions): Promise<string | null> => {
  try {
    const res = await fetchWithRedirects(url, {
      ...options,
      userAgent: options?.userAgent ?? "rdrr/1.0 (llms-txt-check)",
      timeoutMs: options?.timeoutMs ?? 5000,
    })
    if (!res.ok) return null

    const contentType = res.headers.get("content-type") ?? ""
    const cl = parseInt(res.headers.get("content-length") ?? "0", 10)
    if (cl > MAX_SIZE) return null

    const text = await readResponseText(res, MAX_SIZE)
    if (text.length > MAX_SIZE) return null

    return isValid(text, contentType) ? text : null
  } catch {
    options?.signal?.throwIfAborted()
    return null
  }
}

const isValid = (text: string, contentType: string): boolean => {
  if (!contentType.includes("text/")) return false
  if (text.length < 100) return false
  return /^#\s+/m.test(text.slice(0, 500))
}
