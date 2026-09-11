# rdrr reference

Everything the [README](../README.md) leaves out. CLI flags, exit codes, history, MCP tools, the library API, and known limits.

## CLI

```sh
rdrr <input> [options]
```

`<input>` is a URL, a local `.html` file, or `-` to read HTML from stdin. A URL without a scheme gets `https://`.

| Flag                       | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| `-o, --output <file>`      | Save to file instead of stdout                                           |
| `-c, --clip`               | Copy to the system clipboard, suppresses stdout                          |
| `-j, --json`               | Full JSON with metadata (alias for `--format json`)                      |
| `--format <fmt>`           | `md` (default), `json`, `jsonl`, or `xml`                                |
| `-p, --property <name>`    | Print a single field (`title`, `content`, ...)                           |
| `-l, --language <code>`    | Preferred language (BCP 47)                                              |
| `-n, --limit <n>`          | Max items for aggregate URLs such as X profiles (default 10)             |
| `--order <order>`          | `newest` (default) or `oldest`                                           |
| `--budget <tokens>`        | Shorten the body toward an estimated token budget; may exceed it         |
| `--quality`                | Attach a readability score (0-100) and signals to JSON output            |
| `--check`                  | Probe readability without parsing, exit 0/1                              |
| `--strict`                 | Exit 3 when nothing could be extracted                                   |
| `--llms`                   | Append the site's `/llms.txt`                                            |
| `--timeout <ms>`           | Request timeout (default 25000; Reddit 120000 including rate-limit wait) |
| `--github-token <token>`   | GitHub API token (falls back to `$GITHUB_TOKEN`)                         |
| `--user-agent <ua>`        | Override the outbound User-Agent header                                  |
| `--wpm <n>`                | Words per minute used for `readTime` (default 200)                       |
| `--allow-private-networks` | Allow RFC1918, loopback and link-local targets (SSRF-unsafe)             |
| `--no-history`             | Skip logging this call to history                                        |
| `--debug`                  | Pipeline diagnostics to stderr                                           |

### Subcommands

```sh
rdrr history [--limit 20] [--search react] [--since 2026-04-01] [--failures] [--json]
rdrr last [--json]
```

History lives at `$XDG_STATE_HOME/rdrr/history.jsonl` (falls back to `~/.local/state/rdrr/history.jsonl`), rotates at 1000 entries, and strips credentials from URLs and sensitive flag values before writing. Disable globally with `RDRR_NO_HISTORY=1`.

### Exit codes

| Code | Meaning                                                                     |
| ---- | --------------------------------------------------------------------------- |
| `0`  | Success, including an empty extraction without `--strict`                   |
| `1`  | Fetch/parse error, invalid numeric option, unreadable URL, missing property |
| `2`  | Invalid usage (`--check` on a non-URL, bad `--since` date)                  |
| `3`  | Empty extraction with `--strict`                                            |
| `5`  | Clipboard copy failed                                                       |

### Output formats

- `md` (default): YAML frontmatter (`title`, `author`, `site`, `published`, `source`, `domain`, `language`, `dir`, `description`, `word_count`) followed by the markdown body. A failed extraction adds `extraction: "empty"`.
- `json`: the full result object, plus `extractionEmpty: true` for an empty body, `truncated` when `--budget` cut the body and `quality` when `--quality` is set.
- `jsonl`: one JSON object per line with the same fields as `json`, for batch pipelines.
- `xml`: `<?xml?>` document with a CDATA-safe body; empty extraction adds `<extractionEmpty>true</extractionEmpty>` to the metadata.

## Agents

- `--budget <tokens>` estimates tokens as `ceil(text.length / 4)` and shortens the body at paragraph boundaries while preserving fenced code blocks. The first paragraph and complete code blocks can exceed the budget; frontmatter and the truncation marker add overhead. This is not a tokenizer-specific hard limit.
- An empty extracted body prints `extraction: "empty"` in Markdown frontmatter, or `extractionEmpty: true` in CLI JSON/JSONL, with a warning on stderr, and exits `0`. Pass `--strict` to get exit code `3`. Partial content is not necessarily flagged; HTTP or network failures exit `1`.
- `--check` recognizes supported provider URLs without fetching them, and probes generic HTML pages for readability (exit 0/1). It does not verify that a video, package, issue, or profile exists.
- Set `$GITHUB_TOKEN` (or `--github-token`) to raise the GitHub API limit from 60 to 5000 requests an hour. Long agent sessions exhaust 60 quickly.
- `rdrr history --failures` shows recent failed fetches with their error messages.

Full shell instructions for `CLAUDE.md` or `AGENTS.md`:

```markdown
When you need to read a web page, use `rdrr "{url}" --budget 8000` via
shell instead of generic fetching. If `rdrr` is not installed, use
`npx -y rdrr "{url}" --budget 8000`. Never install rdrr (no `npm i -g`).
If it fails with a bot-wall error or `extraction: "empty"`, fall back to
a browser-based tool.
If content is truncated and you need the rest, rerun without `--budget`.
```

## MCP server

The package ships `rdrr-mcp`, an MCP server over stdio. Register it with `claude mcp add rdrr -- npx -y --package=rdrr rdrr-mcp`, or add it to any MCP client config:

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

| Tool             | What it does                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch`          | URL to clean markdown plus structured metadata. Token budget (`maxTokens`, default 10k, max 20k), pagination via `startIndex` and `nextStartIndex`, optional `fields` filter and quality score |
| `parallel_fetch` | Up to 10 URLs in one call, `perItemMaxTokens` (default 4k), partial failures reported per URL                                                                                                  |
| `check`          | Cheap pre-flight: detected URL type and whether the page is likely readable                                                                                                                    |
| `extract_html`   | Run the extraction engine on HTML you already have                                                                                                                                             |

Results are cached in memory for 5 minutes with single-flight dedup; requests with different `timeoutMs` values use separate entries. `force: true` bypasses the cache. An empty extracted body is flagged as `extractionEmpty: true` in structured content. Budgets use the same four-characters-per-token estimate as the CLI, so actual tokenizer counts vary. To continue a long result, pass `truncated.nextStartIndex` back as `startIndex`.

The complete serialized MCP response, including metadata, is limited to an estimated 24,000 tokens. Oversized responses return `isError: true` with `error.kind: "response-too-large"`. Retry `fetch` or `extract_html` with `fields: ["content"]` or a smaller `maxTokens`; split large batches. This estimate is not a guarantee for a particular model tokenizer.

## Library

### `parse(url, options?)`

```ts
import { parse } from "rdrr"

const result = await parse("https://en.wikipedia.org/wiki/TypeScript", { language: "en" })
```

| Option                 | Type                   | Default | Description                                                  |
| ---------------------- | ---------------------- | ------- | ------------------------------------------------------------ |
| `language`             | `string`               |         | Preferred content language (BCP 47)                          |
| `includeLlmsTxt`       | `boolean`              | `false` | Append the site's `/llms.txt` when present                   |
| `limit`                | `number`               | `10`    | Max items for aggregate URLs such as X profiles              |
| `order`                | `"newest" \| "oldest"` | newest  | Order for aggregate URLs                                     |
| `timeoutMs`            | `number`               | `25000` | Per-request timeout                                          |
| `signal`               | `AbortSignal`          |         | Forwarded to every underlying fetch                          |
| `userAgent`            | `string`               |         | Override the outbound User-Agent header                      |
| `githubToken`          | `string`               |         | GitHub API token, falls back to `process.env.GITHUB_TOKEN`   |
| `wordsPerMinute`       | `number`               | `200`   | Used for `readTime`                                          |
| `allowPrivateNetworks` | `boolean`              | `false` | Allow private, loopback and link-local targets (SSRF-unsafe) |

An explicit `timeoutMs` generally applies to each request. For Reddit it bounds the whole operation, including a rate-limit wait, and defaults to 120 seconds. Without an override, other web/API requests generally use 25 seconds; YouTube player/caption/chapter requests use 4 seconds, X requests 10 seconds, and optional llms.txt probes 5 seconds. Redirects, retries and pagination can increase total elapsed time. URL normalization preserves explicit HTTP, trailing path slashes and query values, and removes fragments.

Every result carries `type`, `title`, `author`, `content`, `description`, `domain`, `siteName`, `published`, `wordCount`, `readTime`, and optionally `language`, `dir`, `llmsTxt`. Metadata fields can be empty when unavailable. Zero words yield `readTime: "0 min"`. `parse()` returns the `ParsedResult` union. Check `result.type` to access source-specific fields such as `transcript` or `postCount`. The common `ParseResult` interface remains available for code that only needs shared fields:

| `type`          | Extra fields                                                   |
| --------------- | -------------------------------------------------------------- |
| `webpage`       | none (also used for npm packages)                              |
| `youtube`       | `videoId`, `thumbnailUrl`, `chapters`, `transcript`, `isLyric` |
| `github`        | none                                                           |
| `stackoverflow` | `questionId`, `score`, `isAnswered`                            |
| `x-profile`     | `handle`, `postCount`                                          |
| `x-status`      | `handle`, `statusId`, `source`                                 |

### `parseHtml(html, options?)`

Run the extraction engine on raw HTML: saved pages, or pipelines that already have the bytes. Options: `url` (resolves relative links and picks site extractors), `language`, `wordsPerMinute`, `signal`, `timeoutMs`, and `userAgent`. Some site extractors request public APIs even when the HTML was supplied locally.

```ts
import { parseHtml } from "rdrr"

const result = await parseHtml(html, { url: "https://example.com/article" })
```

### `isProbablyReaderable(url, options?)`

Lightweight pre-check: will this URL yield a meaningful article? Returns `Promise<boolean>`. Fetch options include `timeoutMs`, `signal`, `userAgent`, `language`, and `allowPrivateNetworks`. This HTML heuristic does not use the provider shortcuts offered by CLI/MCP `check`.

### Other exports

Per-source parsers `parseWeb`, `parseYouTube`, `parseGitHub`, `parseStackOverflow`, `parseNpm`, `parseReddit`, `parseXProfile`; URL helpers `detectUrlType`, `extractVideoId`, `normalizeUrl`; token helpers `estimateTokens`, `truncateToBudget`; `computeQuality` for the readability report; `PrivateNetworkError`. The extraction engine alone is available from `rdrr/extract`.

## Site extractors

Generic pages go through the readability engine. Dedicated extractors in `src/extract/sites/` handle Reddit, Hacker News, Substack (posts and notes), GitHub pages, X articles and posts, ChatGPT, Claude, Gemini and Grok conversation HTML, and the c2.com wiki. Extractor support requires matching page markup; it does not guarantee that a public share URL serves that markup without JavaScript or authentication.

Hacker News `item?id=...` URLs preserve the post link or text, comment authors, dates, permalinks, and nested replies present in the fetched HTML. When the fetched HTML links to another comment page, `nextPageUrl` contains that URL, Markdown includes a continuation link, and CLI frontmatter includes `next_page`. Fetch that URL to read the next upstream page. MCP `truncated.nextStartIndex` only paginates the document already in memory. The extractor does not fetch additional comment pages or the linked article automatically.

## Reddit posts

Post URLs on `reddit.com`, its subdomains, and `redd.it` route directly to Reddit's public Atom/RSS feed. `detectUrlType()` returns `reddit`; `parse()` and `parseReddit()` return a `webpage` result. No login cookies, API credentials, or browser installation are needed for accessible public feeds.

The output includes the post body, author, publication date, links, available media thumbnails, and all comments supplied by the feed. rdrr does not add a comment limit. Reddit still controls the size of its feed, which may omit part of a thread. Feeds do not include scores or reply nesting, and a media link does not imply that rdrr downloaded the original image or video. Comment permalinks and the URL parameters `sort`, `context`, `depth`, `limit`, and `comment` are preserved. A focused comment must appear in the feed or rdrr returns an error.

Reddit can rate-limit feeds per IP, even when HTML pages are blocked separately. rdrr makes at most three attempts within a shared 120-second deadline. It retries transient connection/body failures, incomplete feeds, and HTTP 408, 429, 500, 502, 503, and 504. It honors `Retry-After` and `X-Ratelimit-Reset`; a 429 without a usable delay waits 61 seconds. Other transient failures wait briefly before retrying. Explicit cancellation, permanent HTTP errors, and safety/size rejections are not retried. `--timeout` and `signal` can shorten the deadline. Persistent errors are returned instead of a fabricated successful extraction. Malformed XML and missing content fields are rejected; an explicitly empty body can still represent a valid title-only post.

Run `pnpm test:reddit:live` to check 20 pinned post URLs against expected titles, authors, and content snippets or media links. It saves each live feed, Markdown output, and a JSON result report. For a custom output directory, run `node scripts/test-reddit-live.mjs <directory>` after building. Allow about 20 minutes when Reddit admits one request per minute. These live checks are separate from `pnpm test`.

## Token measurements

The README compares each downloaded HTML response with the complete Markdown body extracted from that same response by rdrr 0.7.0 on September 11, 2026. No `--budget`, metadata frontmatter, or LLM summarization is involved. Counts use `estimateTokens(text)`, which is `Math.ceil(text.length / 4)`, not a model tokenizer. Ratios compare those estimates; results change with page content and markup.

To repeat a measurement after installing `rdrr`, save the source HTML and run this in an ESM script:

```sh
curl -fsSL "https://react.dev/learn" -o page.html
```

```js
import { readFile } from "node:fs/promises"
import { estimateTokens, parseHtml } from "rdrr"

const html = await readFile("page.html", "utf8")
const page = await parseHtml(html, { url: "https://react.dev/learn" })
const raw = estimateTokens(html)
const markdown = estimateTokens(page.content)

console.log({ raw, markdown, reduction: `${(raw / markdown).toFixed(1)}x` })
```

## Input limits and network protection

HTTP response bodies, local HTML files, stdin, and `parseHtml()` input are limited to **20 MiB (20,971,520 bytes)**. Streaming reads stop at the limit, including chunked and decompressed responses. Raw HTML is checked in UTF-8 bytes before DOM parsing. Oversized input throws `InputTooLargeError`, exits `1` in the CLI, or returns MCP `error.kind: "input-too-large"`. Split large documents before parsing. This is a per-input limit, not a total process memory limit. MCP stdio additionally limits the serialized JSON input buffer to 24 MiB. A frame exceeding that transport limit closes the connection; JSON escaping counts toward it, so heavily escaped HTML may need to be split earlier.

npm packuments retain their smaller 10 MiB cap and facts-only version fallback. Optional llms.txt reads retain their 500,000-byte cap and may be omitted.

Connections use a bundled Undici dispatcher that validates the addresses returned by DNS at connection time. Every redirect is checked, HTTPS downgrades are rejected, and credentials are removed when a redirect changes origin. No global dispatcher is changed. `allowPrivateNetworks: true` enables private targets for the webpage fetch path. rdrr's protected requests use direct connections; host applications' custom global proxy dispatchers are not inherited.

## Development checks

`pnpm build && pnpm test` runs deterministic tests, including the built CLI and public API type checks. `pnpm test:coverage` measures this suite. Live snapshot generation is separate: `pnpm snapshots:update` fetches public URLs and rewrites `src/__tests__/snapshot/`. Set `RDRR_SNAPSHOT_DIR` to write those artifacts elsewhere.

## Limitations

- No JavaScript execution. Client-rendered apps can yield partial or empty content. Only empty bodies receive the `extraction: "empty"` marker in Markdown output or `extractionEmpty: true` in CLI JSON/JSONL and MCP.
- Login pages, paywalls, and bot challenges can prevent extraction. rdrr does not bypass them. npmjs.com and stackoverflow.com package and question URLs use their APIs instead.
- YouTube results depend on available captions and upstream endpoints. When captions are unavailable, the result keeps video metadata but has an empty `transcript` array and Markdown body. `--strict` exits `3`; CLI JSON/JSONL and MCP set `extractionEmpty: true`. Timeouts remain errors.
- Spoken YouTube transcripts retain each caption cue with its source start and end times. Their Markdown can be longer than merged paragraphs; use `--budget` or MCP pagination as needed. Lyric transcripts retain stanza grouping.
- X posts use FxTwitter with a syndication fallback; profiles use FxTwitter. Availability and returned post counts depend on those upstream services.
- No PDF parsing (removed in v0.5.0). Use a dedicated PDF tool.
- Anonymous API quotas: GitHub 60 requests an hour without a token, StackExchange 300 requests a day per IP.
