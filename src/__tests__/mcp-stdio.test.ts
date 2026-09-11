import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { MAX_INPUT_BYTES } from "../security/body"

const MCP = resolve(__dirname, "../../dist/mcp.mjs")

describe.skipIf(!existsSync(MCP))("MCP stdio input limits", () => {
  it("returns a tool error for oversized HTML and keeps the connection usable", async () => {
    const client = new Client({ name: "stdio-test", version: "1" })
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [MCP], stderr: "pipe" }))
      const result = await client.callTool({
        name: "extract_html",
        arguments: { html: "x".repeat(MAX_INPUT_BYTES + 1) },
      })
      expect(result.isError).toBe(true)
      expect(result.structuredContent).toMatchObject({ error: { kind: "input-too-large" } })
      const next = await client.callTool({ name: "check", arguments: { url: "https://www.npmjs.com/package/rdrr" } })
      expect(next.isError).toBeFalsy()
      expect(next.structuredContent).toMatchObject({ type: "npm", readable: true })
    } finally {
      await client.close()
    }
  }, 15000)
})
