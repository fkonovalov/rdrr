import { ensureProtocol } from "@shared"
import type { ParseOptions, ParseResult } from "./types"
import { detectUrlType, isValidUrl, normalizeUrl } from "./detect"
import { detectLlmsTxt } from "./provider/llms-txt"
import { parseWeb } from "./provider/web"

export const parse = async (url: string, options?: ParseOptions): Promise<ParseResult> => {
  if (!url) throw new Error("URL is required")

  const normalized = ensureProtocol(url)
  if (!isValidUrl(normalized)) throw new Error(`Invalid URL: ${url}`)

  const finalUrl = normalizeUrl(normalized)
  const urlType = detectUrlType(finalUrl)

  const result = await route(finalUrl, urlType, options)

  if (options?.includeLlmsTxt) {
    const llms = await detectLlmsTxt(finalUrl, options?.allowPrivateNetworks)
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
    case "github-discussion":
    case "github-file": {
      const { parseGitHub } = await import("./provider/github")
      return parseGitHub(url, options)
    }
    case "stackoverflow": {
      const { parseStackOverflow } = await import("./provider/stackoverflow")
      return parseStackOverflow(url, options)
    }
    case "npm": {
      const { parseNpm } = await import("./provider/npm")
      return parseNpm(url, options)
    }
    case "x-profile": {
      const { parseXProfile } = await import("./provider/x-profile")
      return parseXProfile(url, options)
    }
    case "x-status": {
      const { parseXStatus } = await import("./provider/x-status")
      return parseXStatus(url, options)
    }
    case "webpage": {
      return parseWeb(url, options)
    }
  }
}
