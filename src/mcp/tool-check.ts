import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { ensureProtocol } from "@shared"
import type { ToolDeps } from "./parse-cached"
import { detectUrlType, normalizeUrl } from "../detect"
import { isProbablyReaderable } from "../extract/readerable"
import { errorResult } from "./errors"
import { checkInputShape, checkOutputShape } from "./schemas"

const DESCRIPTION =
  "Cheap pre-flight check. Returns the detected URL type (webpage/youtube/github-issue/github-discussion/" +
  "github-file/stackoverflow/x-status/x-profile) plus whether the URL is likely to yield meaningful article " +
  "content. Use before `fetch` to route on URL type or skip URLs unlikely to extract well. Does NOT extract " +
  "the content."

export const registerCheckTool = (server: McpServer, deps: ToolDeps): void => {
  server.registerTool(
    "check",
    {
      title: "Probe URL readability",
      description: DESCRIPTION,
      inputSchema: checkInputShape,
      outputSchema: checkOutputShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ url }): Promise<CallToolResult> => {
      deps.idle.begin()
      try {
        const normalizedUrl = normalizeUrl(ensureProtocol(url))
        const type = detectUrlType(normalizedUrl)
        // The readerable heuristic only means something for generic webpages;
        // typed URLs (youtube, github, ...) have dedicated extractors.
        const readable = type === "webpage" ? await isProbablyReaderable(normalizedUrl) : true
        const structured = { url, normalizedUrl, type, readable }
        const text = `${type} URL, ${readable ? "likely readable" : "unlikely to extract well"}: ${normalizedUrl}`
        return { content: [{ type: "text", text }], structuredContent: structured }
      } catch (error) {
        return errorResult(error)
      } finally {
        deps.idle.end()
      }
    },
  )
}
