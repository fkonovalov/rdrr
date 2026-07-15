import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { estimateTokens } from "../cli/budget"
import { classifyError } from "./errors"
import { cachedParse, type ToolDeps } from "./parse-cached"
import { shapeFetchResult } from "./respond"
import { parallelFetchInputShape, parallelFetchOutputShape } from "./schemas"

const DESCRIPTION =
  "Fetch and extract clean markdown from multiple URLs concurrently. Use for research workflows where you " +
  "need to compare sources or gather content from a list. Returns results in submission order; each result " +
  "has the same shape as `fetch`, and a failed URL does not fail the batch. Limited to 10 URLs per call to " +
  "fit the context budget; for larger batches make multiple calls."

// Bodies appear once, in the text block; structuredContent carries metadata
// only. Cap the combined response to stay inside the 25k host limit.
const TOTAL_BUDGET_TOKENS = 20_000

export const registerParallelFetchTool = (server: McpServer, deps: ToolDeps): void => {
  server.registerTool(
    "parallel_fetch",
    {
      title: "Fetch multiple URLs in parallel",
      description: DESCRIPTION,
      inputSchema: parallelFetchInputShape,
      outputSchema: parallelFetchOutputShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args): Promise<CallToolResult> => {
      deps.idle.begin()
      try {
        return await runParallelFetch(deps, args)
      } finally {
        deps.idle.end()
      }
    },
  )
}

interface ParallelFetchArgs {
  urls: string[]
  language?: string
  includeQuality: boolean
  perItemMaxTokens: number
  timeoutMs?: number
  force: boolean
}

const runParallelFetch = async (deps: ToolDeps, args: ParallelFetchArgs): Promise<CallToolResult> => {
  const settled = await Promise.allSettled(args.urls.map((url) => cachedParse(deps, { ...args, url })))

  const results: Array<Record<string, unknown>> = []
  const sections: string[] = []
  let usedTokens = 0
  let truncatedAt: number | undefined

  for (const [index, url] of args.urls.entries()) {
    const outcome = settled[index]
    if (!outcome) continue
    if (outcome.status === "rejected") {
      const error = classifyError(outcome.reason)
      results.push({ url, error })
      sections.push(`## ${url}\n\nFailed: ${error.message}`)
      continue
    }
    const { text, structured } = shapeFetchResult(outcome.value, {
      maxTokens: args.perItemMaxTokens,
      startIndex: 0,
      includeQuality: args.includeQuality,
      source: url,
    })
    const cost = estimateTokens(text) + estimateTokens(JSON.stringify(structured))
    if (results.length > 0 && usedTokens + cost > TOTAL_BUDGET_TOKENS) {
      truncatedAt = index
      break
    }
    usedTokens += cost
    results.push({ url, ...structured })
    sections.push(`## ${url}\n\n${text}`)
  }

  const meta: Record<string, number> = { requested: args.urls.length, returned: results.length }
  if (truncatedAt !== undefined) {
    meta.truncatedAt = truncatedAt
    sections.push(
      `Skipped ${args.urls.length - results.length} of ${args.urls.length} URLs to fit the response ` +
        "token budget. Call parallel_fetch again with the remaining URLs.",
    )
  }

  return {
    content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
    structuredContent: { results, meta },
  }
}
