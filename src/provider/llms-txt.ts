import { mergeSignals } from "@shared"
import { assertPublicUrl } from "../security/ssrf"

interface LlmsTxtResult {
  llmsTxtUrl?: string
  llmsContent?: string
}

const MAX_SIZE = 500_000

export const detectLlmsTxt = async (url: string, allowPrivateNetworks?: boolean): Promise<LlmsTxtResult | null> => {
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
    candidates.map(async (candidate) => ({ url: candidate, content: await tryFetch(candidate, allowPrivateNetworks) })),
  )
  for (const { url: candidate, content } of results) {
    if (content) return { llmsTxtUrl: candidate, llmsContent: content }
  }

  return null
}

const tryFetch = async (url: string, allowPrivateNetworks?: boolean): Promise<string | null> => {
  try {
    if (!allowPrivateNetworks) await assertPublicUrl(url)
    const res = await fetch(url, {
      headers: { "User-Agent": "rdrr/1.0 (llms-txt-check)" },
      signal: mergeSignals(5000),
      redirect: "follow",
    })
    if (!res.ok) return null

    const contentType = res.headers.get("content-type") ?? ""
    const cl = parseInt(res.headers.get("content-length") ?? "0", 10)
    if (cl > MAX_SIZE) return null

    const text = await res.text()
    if (text.length > MAX_SIZE) return null

    return isValid(text, contentType) ? text : null
  } catch {
    return null
  }
}

const isValid = (text: string, contentType: string): boolean => {
  if (!contentType.includes("text/")) return false
  if (text.length < 100) return false
  return /^#\s+/m.test(text.slice(0, 500))
}
