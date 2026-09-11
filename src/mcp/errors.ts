import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { PrivateNetworkError } from "../security/ssrf"

export interface ToolError {
  kind:
    | "private-network"
    | "aborted"
    | "timeout"
    | "http"
    | "invalid-url"
    | "network"
    | "response-too-large"
    | "input-too-large"
    | "unknown"
  message: string
}

export const classifyError = (error: unknown): ToolError => {
  if (error instanceof PrivateNetworkError) return { kind: "private-network", message: error.message }
  if (!(error instanceof Error)) return { kind: "unknown", message: String(error) }
  if (error.name === "InputTooLargeError") return { kind: "input-too-large", message: error.message }
  if (error.name === "ResponseTooLargeError") return { kind: "response-too-large", message: error.message }
  if (error.name === "AbortError") return { kind: "aborted", message: error.message }
  if (error.name === "TimeoutError" || /timed out/i.test(error.message))
    return { kind: "timeout", message: error.message }
  if (/^Failed to fetch: \d{3}/.test(error.message)) return { kind: "http", message: error.message }
  if (/invalid url/i.test(error.message)) return { kind: "invalid-url", message: error.message }
  if (error instanceof TypeError) return { kind: "network", message: error.message }
  return { kind: "unknown", message: error.message }
}

/** Tool execution failure per MCP spec: an isError result, never a thrown protocol error. */
export const errorResult = (error: unknown): CallToolResult => {
  const classified = classifyError(error)
  const toolError = { ...classified, message: classified.message.slice(0, 4000) }
  return {
    content: [{ type: "text", text: `Failed: ${toolError.message}` }],
    structuredContent: { error: toolError },
    isError: true,
  }
}
