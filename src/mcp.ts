#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createIdleTimer, installProcessGuards } from "./mcp/guards"
import { createServer } from "./mcp/server"
import { MAX_INPUT_BYTES } from "./security/body"

declare const __RDRR_VERSION__: string

// Injected by tsdown at build time; fall back when running from source.
const VERSION = typeof __RDRR_VERSION__ === "string" ? __RDRR_VERSION__ : "0.0.0-dev"

const main = async (): Promise<void> => {
  installProcessGuards(process)

  const shutdown = (): void => {
    void server
      .close()
      .catch(() => {})
      .finally(() => process.exit(0))
  }

  const idle = createIdleTimer(Number(process.env["MCP_IDLE_TIMEOUT_MS"] ?? ""), shutdown)
  const server = createServer({ version: VERSION, idle })

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await server.connect(
    new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: MAX_INPUT_BYTES + 4 * 1024 * 1024 }),
  )
  console.error(`rdrr-mcp ${VERSION} listening on stdio`)
}

main().catch((error: unknown) => {
  console.error("[rdrr-mcp] fatal:", error instanceof Error ? error.message : error)
  process.exit(1)
})
