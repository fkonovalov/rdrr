import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { errorResult } from "./errors"
import { cachedParse, type ToolDeps } from "./parse-cached"
import { shapeFetchResult } from "./respond"
import { fetchInputShape, fetchOutputShape } from "./schemas"

const DESCRIPTION =
  "Extract clean markdown content from any URL. Specialized site extractors handle YouTube transcripts " +
  "(with chapters and timestamps), GitHub issues, PRs and discussions (with comments), X/Twitter posts and " +
  "profiles, StackOverflow questions, Wikipedia, MDN, Reddit, Substack, and 15+ other sites. Returns the " +
  "article body plus structured metadata (title, author, type, word count, optional readability quality " +
  "verdict). Prefer this over generic web fetching when you need clean LLM-ready content from articles, " +
  "threads, or specialized sources."

export const registerFetchTool = (server: McpServer, deps: ToolDeps): void => {
  server.registerTool(
    "fetch",
    {
      title: "Fetch URL as clean markdown",
      description: DESCRIPTION,
      inputSchema: fetchInputShape,
      outputSchema: fetchOutputShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args): Promise<CallToolResult> => {
      deps.idle.begin()
      try {
        const result = await cachedParse(deps, args)
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
