import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { ToolDeps } from "./parse-cached"
import { parseHtml } from "../provider/web"
import { errorResult } from "./errors"
import { shapeFetchResult } from "./respond"
import { extractHtmlInputShape, fetchOutputShape } from "./schemas"

const DESCRIPTION =
  "Run rdrr's extraction pipeline on HTML you already have (e.g. fetched by another tool, loaded from " +
  "cache, rendered by a headless browser). Returns the same clean markdown plus metadata as `fetch` would " +
  "for the same URL. Useful when you need a different fetcher (auth, custom headers, browser rendering) " +
  "but still want rdrr's site extractors and cleanup."

export const registerExtractHtmlTool = (server: McpServer, deps: ToolDeps): void => {
  server.registerTool(
    "extract_html",
    {
      title: "Extract clean markdown from raw HTML",
      description: DESCRIPTION,
      inputSchema: extractHtmlInputShape,
      outputSchema: fetchOutputShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args): Promise<CallToolResult> => {
      deps.idle.begin()
      try {
        const result = await parseHtml(args.html, { url: args.url, language: args.language })
        const { text, structured } = shapeFetchResult(result, {
          maxTokens: args.maxTokens,
          startIndex: args.startIndex,
          includeQuality: args.includeQuality,
          fields: args.fields,
          source: args.url,
        })
        return { content: [{ type: "text", text }], structuredContent: structured }
      } catch (error) {
        return errorResult(error)
      } finally {
        deps.idle.end()
      }
    },
  )
}
