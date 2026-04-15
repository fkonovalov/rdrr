import type { ParseOptions, ParseResult } from "./types"
import { detectUrlType, isValidUrl, normalizeUrl } from "./detect"
import { detectLlmsTxt } from "./provider/llms-txt"

export const parse = async (url: string, options?: ParseOptions): Promise<ParseResult> => {
  if (!url) throw new Error("URL is required")

  const normalized = ensureProtocol(url)
  if (!isValidUrl(normalized)) throw new Error(`Invalid URL: ${url}`)

  const finalUrl = normalizeUrl(normalized)
  const urlType = detectUrlType(finalUrl)

  const result = await route(finalUrl, urlType, options)

  if (options?.includeLlmsTxt) {
    const llms = await detectLlmsTxt(finalUrl)
    if (llms?.llmsContent) {
      result.llmsTxt = llms.llmsContent
      result.content = `${result.content}\n\n---\n\n## llms.txt\n\nSource: ${llms.llmsTxtUrl}\n\n${llms.llmsContent}`
    }
  }

  return result
}

const route = async (
  url: string,
  urlType: ReturnType<typeof detectUrlType>,
  options?: ParseOptions,
): Promise<ParseResult> => {
  switch (urlType) {
    case "youtube": {
      const { parseYouTube } = await import("./provider/youtube")
      return parseYouTube(url, options)
    }
    case "github-issue":
    case "github-file": {
      const { parseGitHub } = await import("./provider/github")
      return parseGitHub(url, options)
    }
    case "pdf": {
      const { parsePdf } = await import("./provider/pdf")
      return parsePdf(url, options)
    }
    case "x-profile": {
      const { parseXProfile } = await import("./provider/x-profile")
      return parseXProfile(url, options)
    }
    case "webpage": {
      const { parseWeb } = await import("./provider/web")
      return parseWeb(url, options)
    }
  }
}

const ensureProtocol = (url: string): string => {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `https://${url}`
}
