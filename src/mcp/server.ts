import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ParseResult } from "../types"
import type { IdleTimer } from "./guards"
import type { ToolDeps } from "./parse-cached"
import { createAsyncCache } from "./cache"
import { registerCheckTool } from "./tool-check"
import { registerExtractHtmlTool } from "./tool-extract-html"
import { registerFetchTool } from "./tool-fetch"
import { registerParallelFetchTool } from "./tool-parallel"

export interface CreateServerOptions {
  version?: string
  /** Brackets every tools/call -- drives the idle-timeout timer. */
  idle?: IdleTimer
}

export const createServer = (options: CreateServerOptions = {}): McpServer => {
  const server = new McpServer({ name: "rdrr", version: options.version ?? "0.0.0" })
  const deps: ToolDeps = {
    cache: createAsyncCache<ParseResult>(),
    idle: options.idle ?? { begin: (): void => {}, end: (): void => {} },
  }
  registerFetchTool(server, deps)
  registerParallelFetchTool(server, deps)
  registerCheckTool(server, deps)
  registerExtractHtmlTool(server, deps)
  return server
}
