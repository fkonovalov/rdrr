# rdrr

[![npm version](https://img.shields.io/npm/v/rdrr.svg)](https://www.npmjs.com/package/rdrr)
[![license](https://img.shields.io/npm/l/rdrr.svg)](./LICENSE)
[![install size](https://packagephobia.com/badge?p=rdrr)](https://packagephobia.com/result?p=rdrr)

Convert any URL to clean markdown for AI agents.

```sh
npx rdrr https://react.dev/learn
```

## Features

- **Fast**: no headless browser, lightweight
- **Smart**: 20+ site-specific extractors (Wikipedia, Reddit, X, Hacker News, GitHub, ChatGPT, Claude, Substack, ...)
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

# Save to file
rdrr https://example.com -o article.md

# JSON with metadata
rdrr https://example.com --json
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
| `-j, --json` | Full JSON with metadata |
| `-p, --property <name>` | Extract a single field (`title`, `content`, ...) |
| `-l, --language <code>` | Preferred language (BCP 47) |
| `-n, --limit <n>` | Max items for aggregate URLs (default: `10`) |
| `--order <order>` | `newest` (default) or `oldest` |
| `--check` | Probe if URL is readable (exit 0/1) |
| `--llms` | Append site's `/llms.txt` |
| `--debug` | Pipeline diagnostics to stderr |

## API

### `parse(url, options?)`

```ts
import { parse } from "rdrr"

const result = await parse(url, {
  language: "en",
  includeLlmsTxt: true,
})
```

Returns a `ParseResult` with `type`, `title`, `author`, `content`, `description`, `domain`, `siteName`, `published`, `wordCount`, `readTime`, and more. The result is narrowed by `type`: `"webpage"`, `"youtube"`, `"github"`, `"pdf"`, or `"x-profile"`.

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

| Type | What it handles |
| --- | --- |
| **Webpages** | Any HTML page with 20+ site-specific extractors |
| **YouTube** | Transcripts with chapters, speakers, timestamps |
| **GitHub** | Issues, PRs (with comments), raw files |
| **PDFs** | Any public `.pdf` (requires optional `pdfjs-dist`) |
| **X/Twitter** | Single posts and full profile timelines |
| **llms.txt** | Appended on demand via `--llms` or `includeLlmsTxt` |

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

Want to add a site extractor? Check out `src/extract/sites/`: each one is a self-contained file.

## License

MIT
