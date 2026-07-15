#!/usr/bin/env bash
# Smoke test for the MCP server: pipes JSON-RPC frames into dist/mcp.mjs and
# asserts on initialize, tools/list, extract_html (offline), and fetch (live).
# Usage: scripts/smoke-mcp.sh [path-to-mcp]  (defaults to dist/mcp.mjs)
# Set SMOKE_SKIP_NETWORK=1 to skip the live fetch assertion.
set -u

MCP="${1:-dist/mcp.mjs}"
cd "$(dirname "$0")/.."

if [ ! -f "$MCP" ]; then
  echo "missing $MCP -- run 'pnpm build' first" >&2
  exit 1
fi

SKIP_NETWORK="${SMOKE_SKIP_NETWORK:-0}"

FRAMES='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"extract_html","arguments":{"html":"<html><head><title>Smoke</title></head><body><article><h1>Smoke</h1><p>Hello from the rdrr MCP smoke test. This paragraph carries enough content to extract.</p></article></body></html>","url":"https://example.com/smoke"}}}'

if [ "$SKIP_NETWORK" != "1" ]; then
  FRAMES="$FRAMES
{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"fetch\",\"arguments\":{\"url\":\"https://example.com\"}}}"
fi

OUT=$(printf '%s\n' "$FRAMES" | timeout 60 node "$MCP" 2>/dev/null)

printf '%s\n' "$OUT" | SKIP_NETWORK="$SKIP_NETWORK" node --input-type=module -e '
import { text } from "node:stream/consumers"

const fail = (message) => {
  console.error(`FAIL  ${message}`)
  process.exitCode = 1
}
const pass = (message) => console.log(`PASS  ${message}`)

const raw = (await text(process.stdin)).trim()
if (!raw) {
  fail("no output from server")
  process.exit(1)
}
const byId = new Map(
  raw
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((message) => "id" in message)
    .map((message) => [message.id, message]),
)

const init = byId.get(1)?.result
init?.serverInfo?.name === "rdrr" ? pass(`initialize (rdrr ${init.serverInfo.version})`) : fail("initialize")

const tools = byId.get(2)?.result?.tools?.map((tool) => tool.name).sort() ?? []
const expected = ["check", "extract_html", "fetch", "parallel_fetch"]
JSON.stringify(tools) === JSON.stringify(expected) ? pass(`tools/list [${tools}]`) : fail(`tools/list [${tools}]`)

// The markdown body lives only in the text block; structuredContent is metadata.
const extract = byId.get(3)?.result
const extractOk =
  extract?.isError !== true &&
  extract?.structuredContent?.type === "webpage" &&
  extract?.structuredContent?.content === undefined &&
  extract?.content?.[0]?.text?.includes("Hello from the rdrr MCP smoke test")
extractOk ? pass("tools/call extract_html") : fail(`tools/call extract_html: ${JSON.stringify(extract)?.slice(0, 300)}`)

if (process.env.SKIP_NETWORK !== "1") {
  const fetched = byId.get(4)?.result
  const fetchOk =
    fetched?.isError !== true &&
    fetched?.structuredContent?.domain === "example.com" &&
    fetched?.structuredContent?.content === undefined &&
    fetched?.content?.[0]?.text?.includes("domain")
  fetchOk ? pass("tools/call fetch https://example.com") : fail(`tools/call fetch: ${JSON.stringify(fetched)?.slice(0, 300)}`)
}
'
