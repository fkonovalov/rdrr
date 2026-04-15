interface LlmsTxtResult {
  llmsTxtUrl?: string
  llmsContent?: string
}

const MAX_SIZE = 500_000

export const detectLlmsTxt = async (url: string): Promise<LlmsTxtResult | null> => {
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return null
  }

  const llmsUrl = `${origin}/llms.txt`
  const content = await tryFetch(llmsUrl)
  if (content) return { llmsTxtUrl: llmsUrl, llmsContent: content }

  return null
}

const tryFetch = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "rdrr/1.0 (llms-txt-check)" },
      signal: AbortSignal.timeout(5000),
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
