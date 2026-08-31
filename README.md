# rdrr

[![npm version](https://img.shields.io/npm/v/rdrr.svg)](https://www.npmjs.com/package/rdrr)
[![license](https://img.shields.io/npm/l/rdrr.svg)](./LICENSE)
[![min](https://badgen.net/bundlephobia/minzip/rdrr)](https://bundlephobia.com/package/rdrr)

Convert any URL to clean markdown for AI agents.

```sh
npx rdrr https://react.dev/learn
```

## Features

- **Fast**: no headless browser, lightweight
- **Smart**: 20+ site-specific extractors (Wiki, Reddit, X, MDN, Claude, Substack ...)
- **LLM-ready**: strips ads, navigation, footers; keeps code blocks, tables, math
- **Versatile**: webpages, GitHub issues/PRs/discussions, Stack Overflow, npm packages, X profiles, YouTube transcripts

## Install

```sh
# Global CLI (recommended for daily use)
npm install -g rdrr

# Or zero-install, runs from the npx cache
npx -y rdrr https://react.dev/learn

# As a library dependency
npm install rdrr
```

## Quick start

### CLI

```sh
# Webpage
rdrr https://react.dev/learn

# YouTube transcript
rdrr https://www.youtube.com/watch?v=dQw4w9WgXcQ

# GitHub issue with comments (also PRs and discussions)
rdrr https://github.com/mozilla/readability/issues/1

# Stack Overflow question with top answers
rdrr https://stackoverflow.com/questions/11227809

# npm package README (bypasses the npmjs.com bot wall via the registry API)
rdrr https://www.npmjs.com/package/hash-wasm

# X timeline
rdrr https://x.com/discotune -n 10

# Single X post (direct API, bypasses login walls)
rdrr https://x.com/discotune/status/2045444995768078376

# Save to file
rdrr https://example.com -o article.md

# Copy to clipboard
rdrr https://example.com --clip

# Fit a 2k-token budget for LLM context
rdrr https://some.article.example/long-read --budget 2000

# LLM-friendly XML with quality score
rdrr https://react.dev/learn --format xml --quality

# List recent fetches
rdrr history --limit 10
```

## For AI agents

`rdrr` is built to feed web content to LLMs with minimal tokens.

### MCP server (recommended)

The package ships an MCP server binary, `rdrr-mcp`. Agents get typed tools
instead of a shell dependency: no PATH issues, no install steps, responses
always fit the 25k-token MCP limit, and errors come back structured.

```sh
# Claude Code
claude mcp add rdrr -- npx -y --package=rdrr rdrr-mcp
```

For other MCP clients (Cursor, Claude Desktop):

```json
{
  "mcpServers": {
    "rdrr": {
      "command": "npx",
      "args": ["-y", "--package=rdrr", "rdrr-mcp"]
    }
  }
}
```

| Tool             | What it does                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch`          | URL to clean markdown + structured metadata. Token budget (default 10k), pagination via `startIndex`/`nextStartIndex`, optional `fields` filter and quality score |
| `parallel_fetch` | Several URLs in one call, partial failures reported per-URL                                                                                                       |
| `check`          | Cheap pre-flight: is this URL readable, and what type is it                                                                                                       |
| `extract_html`   | Run the extraction engine on HTML you already have                                                                                                                |

Results are cached for 5 minutes (single-flight, `force: true` bypasses).
Failed extraction is flagged as `extractionEmpty: true` in the structured
content instead of silently returning an empty page.

### CLI fallback

If you prefer plain shell, put this in your `CLAUDE.md` or agent instructions:

```markdown
When you need to read a web page, use `rdrr "{url}" --budget 8000` via
shell instead of generic fetching. If `rdrr` is not installed, use
`npx -y rdrr "{url}" --budget 8000`. Never install rdrr (no `npm i -g`).
If it fails with a bot-wall error or `extraction: empty`, fall back to
a browser-based tool.
```

Agent-relevant behavior:

- `--budget <tokens>` truncates at a paragraph boundary; without it, pages like
  long forum threads can exceed 100k tokens.
- A failed extraction (JS-only SPA, bot wall) prints `extraction: "empty"` in
  the frontmatter, a warning on stderr, and exits `0`. Pass `--strict` to get
  exit code `3` instead.
- Set `$GITHUB_TOKEN` (or `--github-token`) to raise the GitHub API limit from
  60 to 5000 requests/hour; long agent sessions exhaust 60 quickly.
- `rdrr history --failures` shows recent failed fetches with error messages.
- `--check` probes readability without a full parse (exit 0/1).

### Exit codes

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| `0`  | Success (including empty extraction without `--strict`)            |
| `1`  | Fetch/parse error, `--check` says not readable, property not found |
| `2`  | Invalid usage (`--check` on non-URL, bad `--since` date)           |
| `3`  | Empty extraction with `--strict`                                   |
| `5`  | Clipboard copy failed                                              |

### Known limitations

- No JavaScript execution: client-side-rendered SPAs yield `extraction: "empty"`.
- Reddit and Cloudflare-protected sites block non-browser clients
  (TLS fingerprinting); rdrr degrades gracefully but cannot bypass this.
  npmjs.com package pages are served via the open registry API instead.
- PDF parsing was removed in v0.5.0; use a dedicated PDF tool.

### Library

```ts
import { parse } from "rdrr"

const result = await parse("https://en.wikipedia.org/wiki/TypeScript")

result.title // "TypeScript"
result.content // clean markdown
result.wordCount // 2847
result.siteName // "Wikipedia"
```

## CLI flags

| Flag                     | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| `-o, --output <file>`    | Save to file instead of stdout                              |
| `-c, --clip`             | Copy output to the system clipboard (suppresses stdout)     |
| `-j, --json`             | Full JSON with metadata (alias for `--format json`)         |
| `--format <fmt>`         | Output format: `md` (default), `json`, `jsonl`, or `xml`    |
| `-p, --property <name>`  | Extract a single field (`title`, `content`, ...)            |
| `-l, --language <code>`  | Preferred language (BCP 47)                                 |
| `-n, --limit <n>`        | Max items for aggregate URLs (default: `10`)                |
| `--order <order>`        | `newest` (default) or `oldest`                              |
| `--budget <tokens>`      | Truncate body at a paragraph boundary to fit a token budget |
| `--quality`              | Attach a readability score (0-100) + signals to JSON output |
| `--check`                | Probe if URL is readable (exit 0/1)                         |
| `--strict`               | Exit with code 3 when no content could be extracted         |
| `--llms`                 | Append site's `/llms.txt`                                   |
| `--timeout <ms>`         | Per-request timeout (default 25000)                         |
| `--github-token <token>` | GitHub API token (falls back to `$GITHUB_TOKEN`)            |
| `--user-agent <ua>`      | Override the outbound User-Agent header                     |
| `--no-history`           | Skip logging this call to history                           |
| `--debug`                | Pipeline diagnostics to stderr                              |

### Subcommands

```sh
rdrr history [--limit 20] [--search react] [--since 2026-04-01] [--failures] [--json]
rdrr last [--json]
```

History lives at `$XDG_STATE_HOME/rdrr/history.jsonl` (falls back to `~/.local/state/rdrr/history.jsonl`), auto-rotates at 1000 entries, and strips basic-auth credentials before writing. Disable globally with `RDRR_NO_HISTORY=1`.

## API

### `parse(url, options?)`

```ts
import { parse } from "rdrr"

const result = await parse(url, {
  language: "en",
  includeLlmsTxt: true,
})
```

Returns a `ParseResult` with `type`, `title`, `author`, `content`, `description`, `domain`, `siteName`, `published`, `wordCount`, `readTime`, and more. The result is narrowed by `type`: `"webpage"`, `"youtube"`, `"github"`, `"stackoverflow"`, `"x-profile"`, or `"x-status"`.

### `parseHtml(html, options?)`

Run the extraction engine on raw HTML: useful for saved pages or pipelines where you already have the bytes.

```ts
import { parseHtml } from "rdrr"

const result = await parseHtml(html, {
  url: "https://example.com/article",
})
```

### `isProbablyReaderable(input)`

Lightweight pre-check: will this URL yield a meaningful article? Useful for routing in AI agents.

```ts
import { isProbablyReaderable } from "rdrr"

await isProbablyReaderable("https://example.com") // true | false
```

Also available as direct imports: `parseWeb`, `parseYouTube`, `parseGitHub`, `parseStackOverflow`, `parseNpm`, `detectUrlType`, `extractVideoId`, `normalizeUrl`.

## Supported sources

| Type               | What it handles                                            |
| ------------------ | ---------------------------------------------------------- |
| **Webpages**       | Any HTML page with 20+ site-specific extractors            |
| **YouTube**        | Transcripts with chapters, speakers, timestamps            |
| **GitHub**         | Issues, PRs, discussions (with comments), raw files        |
| **Stack Overflow** | Questions with top-voted answers via the StackExchange API |
| **X/Twitter**      | Single posts and full profile timelines                    |
| **llms.txt**       | Appended on demand via `--llms` or `includeLlmsTxt`        |

## Community

- Discussion, questions, site-extractor requests: [GitHub Discussions](https://github.com/fkonovalov/rdrr/discussions)
- Bugs: [GitHub Issues](https://github.com/fkonovalov/rdrr/issues)
- Security: see [SECURITY.md](./SECURITY.md)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

Want to add a site extractor? Check out `src/extract/sites/`: each one is a self-contained file.

## License

MIT
