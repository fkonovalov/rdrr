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
- **Versatile**: webpages, GitHub issues/PRs, PDFs, X profiles, YouTube transcripts

## Install

```sh
npm install rdrr
```

## Quick start

### CLI

```sh
# Webpage
rdrr https://react.dev/learn

# YouTube transcript
rdrr https://www.youtube.com/watch?v=dQw4w9WgXcQ

# GitHub issue with comments
rdrr https://github.com/mozilla/readability/issues/1

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

### Library

```ts
import { parse } from "rdrr"

const result = await parse("https://en.wikipedia.org/wiki/TypeScript")

result.title       // "TypeScript"
result.content     // clean markdown
result.wordCount   // 2847
result.siteName    // "Wikipedia"
```

## CLI flags

| Flag | Description |
| --- | --- |
| `-o, --output <file>` | Save to file instead of stdout |
| `-c, --clip` | Copy output to the system clipboard (suppresses stdout) |
| `-j, --json` | Full JSON with metadata (alias for `--format json`) |
| `--format <fmt>` | Output format: `md` (default), `json`, `jsonl`, or `xml` |
| `-p, --property <name>` | Extract a single field (`title`, `content`, ...) |
| `-l, --language <code>` | Preferred language (BCP 47) |
| `-n, --limit <n>` | Max items for aggregate URLs (default: `10`) |
| `--order <order>` | `newest` (default) or `oldest` |
| `--budget <tokens>` | Truncate body at a paragraph boundary to fit a token budget |
| `--quality` | Attach a readability score (0-100) + signals to JSON output |
| `--check` | Probe if URL is readable (exit 0/1) |
| `--llms` | Append site's `/llms.txt` |
| `--no-history` | Skip logging this call to history |
| `--debug` | Pipeline diagnostics to stderr |

### Subcommands

```sh
rdrr history [--limit 20] [--search react] [--since 2026-04-01] [--json]
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

Returns a `ParseResult` with `type`, `title`, `author`, `content`, `description`, `domain`, `siteName`, `published`, `wordCount`, `readTime`, and more. The result is narrowed by `type`: `"webpage"`, `"youtube"`, `"github"`, `"pdf"`, `"x-profile"`, or `"x-status"`.

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

Also available as direct imports: `parseWeb`, `parseYouTube`, `parseGitHub`, `parsePdf`, `detectUrlType`, `extractVideoId`, `normalizeUrl`.

## Supported sources

| Type | What it handles                                     |
| --- |-----------------------------------------------------|
| **Webpages** | Any HTML page with 20+ site-specific extractors     |
| **YouTube** | Transcripts with chapters, speakers, timestamps     |
| **GitHub** | Issues, PRs (with comments), raw files              |
| **PDFs** | Any public `.pdf` (requires optional `unpdf`)       |
| **X/Twitter** | Single posts and full profile timelines             |
| **llms.txt** | Appended on demand via `--llms` or `includeLlmsTxt` |

## Community

- Discussion, questions, site-extractor requests: [GitHub Discussions](https://github.com/fkonovalov/rdrr/discussions)
- Bugs: [GitHub Issues](https://github.com/fkonovalov/rdrr/issues)
- Security: see [SECURITY.md](./SECURITY.md)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

Want to add a site extractor? Check out `src/extract/sites/`: each one is a self-contained file.

## License

MIT
