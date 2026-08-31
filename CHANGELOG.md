# Changelog

All notable changes to `rdrr` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While `rdrr` is pre-`1.0`, minor version bumps (`0.x.0`) may contain breaking changes.

## [0.6.0] - 2026-09-01

The "sharpened by its own usage logs" release: a year of agent sessions mined for real failures, plus upstream defuddle fixes ported.

### Added

- **npm packages.** `rdrr https://www.npmjs.com/package/<name>[/v/<version|tag>]` goes through the open registry API (npmjs.com serves 403 to non-browser clients): package facts plus README as markdown, relative README links anchored to the repository, 10 MB packument cap with a facts-only fallback for huge histories.

### Changed

- **Node >=22.12 required.** BREAKING. Node 20 is EOL since April 2026; CI now tests 22/24. Toolchain: TypeScript 7 (native tsc), commander 15, pnpm 11.
- **~20% faster extraction.** Quadratic per-element subtree scans replaced with precomputed ancestor sets, filters scoped to the main-content subtree, one combined entry-point scan, Turndown singleton.
- **Clearer network errors.** Bare `fetch failed` now names the errno with a hint (DNS, connection, TLS); 404 says the URL itself is likely wrong; default timeout 15s → 25s.

### Fixed

- Markdown: ragged and nested tables, links with whitespace in the destination, `<tag>`-like text escaping, `<ol start>` numbering.
- X/Twitter: emoji no longer shift facet and display-range boundaries (code-point → UTF-16 index mapping in fxtwitter and syndication paths).
- Extraction: delimiter-less ids match whole patterns only (no more `#theroleofthings` false removals), heading links carrying `#anchors` survive, weekday names no longer count as dates, paywalled `aria-hidden` content is kept.

### Security

- `blob:` and non-image `data:` URLs are stripped from output (no `data:` iframe src at all), SVG SMIL elements removed, sanitization runs unconditionally on the main output path, schema.org fallback text is sanitized.

## [0.5.0] - 2026-07-15

The "agents can trust what rdrr tells them" release.

### Added

- **MCP server.** New `rdrr-mcp` binary (STDIO transport) with four tools: `fetch` (budget, pagination via `startIndex`, `fields` filter, quality score), `parallel_fetch`, `check`, and `extract_html`. Responses carry a markdown text block plus `structuredContent` validated by an output schema; results are cached for 5 minutes with single-flight dedup; known errors return `isError: true` instead of crashing the server. Register with `claude mcp add rdrr -- npx -y --package=rdrr rdrr-mcp`.
- **GitHub Discussions.** `rdrr https://github.com/…/discussions/123` now uses the REST API (title, body, category, comments) instead of scraping the SPA shell, which used to produce "Uh oh! There was an error while loading" garbage.
- **Stack Overflow.** Question pages go through the StackExchange API (anonymous quota: 300 req/day per IP) with top-voted answers. stackoverflow.com blocks plain HTTP clients with 403, so this is the only reliable path.
- **Empty-extraction signal.** When nothing could be extracted (JS-only SPA, bot wall) the frontmatter now carries `extraction: "empty"` and a warning is printed to stderr. New `--strict` flag turns that into exit code 3.
- **Failure history.** Failed fetches are now logged to history with their error message. New `rdrr history --failures` filter shows them.
- **Actionable errors.** 403/429 from bot-walled sites now say so and suggest a browser-based fallback; timeouts name the timeout and suggest `--timeout`; GitHub 403 distinguishes real rate limiting (with reset time and a `$GITHUB_TOKEN` hint) from private/forbidden repositories.

### Changed

- **Package size: 505 kB → 147 kB tarball (1.9 MB → 437 kB unpacked).** Sourcemaps are no longer published.
- **GitHub issue/PR comments truncation is now visible.** When pagination fails or the page cap is hit, the output says so instead of silently dropping comments.
- **Reddit degrades gracefully.** Reddit blocks non-browser TLS fingerprints on all endpoints (old.reddit, JSON API, embed). When the old.reddit comment fetch fails, rdrr now falls back to whatever the main page carried instead of failing the whole parse.

### Removed

- **PDF parsing.** BREAKING. `parsePdf`, the `pdf` URL type, and the optional `unpdf` dependency (2 MB) are gone. PDF URLs now fail with a clear error. Use a dedicated PDF tool.

## [0.4.1] - 2026-04-19

### Fixed

- **YouTube metadata for embed-restricted videos.** oembed endpoint returns 401 for some videos (age-gated, embedding disabled). Added fallback to the innertube Android player endpoint, which still returns title, author, and thumbnails.

## [0.4.0] — 2026-04-18

The "make rdrr a first-class tool for AI agents" release.

### Added

- **Single X posts.** `rdrr https://x.com/…/status/…` now goes straight to fxtwitter, with a twimg-syndication fallback if that's down. No more login walls, no HTML fetch at all.
- **`--budget <tokens>`.** Fit the output into a token budget. Cuts at paragraph boundaries, never inside a fenced code block, always keeps the head so truncation never leaves an empty page.
- **`--quality`.** A readability score (0–100) with signals — links, paragraphs, boilerplate, paywall markers in five languages. Lets agents route low-confidence pages to a fallback instead of handing an LLM garbage.
- **`--format md|json|jsonl|xml`.** JSONL for batch pipelines, XML with a real `<?xml?>` declaration and CDATA-safe body for LLMs that parse XML better than markdown. `-j` still works.
- **`-c, --clip`.** Cross-platform clipboard: pbcopy, wl-copy, xclip, xsel, clip.exe.
- **`rdrr history` and `rdrr last`.** A local JSONL log of every fetch, auto-rotated at 1000 entries. `--no-history` or `RDRR_NO_HISTORY=1` to opt out.

### Fixed

- **The bundled CLI was quietly missing every site extractor** (reddit, hackernews, substack, x-oembed, chatgpt, claude, grok, gemini, github, …). A `sideEffects` whitelist in `package.json` was tree-shaking the registration calls out of the published build, leaving only generic readability. Restored.
- **`extract` / `extractAsync` now respect `options.markdown: true`.** Browser-extension callers were getting raw HTML back on Wikipedia "no article" pages.

### Security

- URLs logged to `history.jsonl` are stripped of basic-auth credentials **and** of any `api_key` / `token` / `authorization` / `secret` query parameters.
- CLI arg-value logging redacts sensitive flags (`--github-token`, `--user-agent`, `-l`).
- XML CDATA wrapping splits any stray `]]>` in article content so a single tweet can't prematurely close the block.

### Internal

- fxtwitter normalisation (facets, media, quotes) lives in one shared module instead of three forks.

## [0.3.0] — 2026-04-17

### Added

- New `ParseOptions`: `githubToken`, `signal`, `timeoutMs`, `userAgent`, `wordsPerMinute`, `allowPrivateNetworks`.
- CLI flags: `--timeout`, `--user-agent`, `--github-token`, `--wpm`, `--allow-private-networks`.
- Exports: `parseXProfile`, `XProfileResult`, `PrivateNetworkError`.
- GitHub comments now paginate (up to 10 pages).
- YouTube caption tracks honour `options.language`; `.well-known/llms.txt` probed alongside `/llms.txt`.

### Changed

- Private-network requests blocked by default — opt in with `allowPrivateNetworks: true` or `--allow-private-networks`.
- `parseWeb` returns `Promise<WebpageResult | PdfResult>` — handle `"pdf"` in your `switch`.
- `ParseHtmlOptions` no longer extends `ParseOptions`; `ParseOptions.noCache` removed.
- `https://` → `http://` redirects refused.
- SSRF and TLS-downgrade protection on every request.
- YouTube InnerTube Android+Web contexts raced in parallel; `fetchChapters` gets a timeout.
- Sourcemaps shipped with the bundle.
- `parsePdf` split into focused modules.

### Infrastructure

- Release via npm OIDC trusted publishing with provenance.
- `prepublishOnly` runs `lint && test && build`.
- Windows in CI matrix; coverage and bundle-size guard added.
- `SECURITY.md`, `.github/dependabot.yml`, `packageManager: pnpm@9.15.1`.

## [0.2.2] — 2026-04-16

### Fixed

- Fix CI: sync lockfile after removing `@types/turndown`.

### Added

- Auto-create GitHub Release from CHANGELOG when a version tag is pushed.

## [0.2.1] — 2026-04-16

### Changed

- Bundle all runtime dependencies (turndown, linkedom, commander) into dist -- zero production dependencies.
- Replace `@mixmark-io/domino` with a lightweight linkedom-based shim.
- Enable full minification.
- Install size reduced

## [0.2.0] — 2026-04-14

First public release.

### Added

- **`parse(url, options?)`** -- single entry point that detects URL type and routes to the right provider.
- **`parseHtml(html, options?)`** -- extraction directly on an HTML string, bypassing the network. Accepts an optional `url` so site-specific extractors and relative-link resolution still work.
- **CLI accepts local files and stdin** -- `rdrr ./page.html` reads from disk and `rdrr -` streams HTML from stdin (`curl ... | rdrr -`).
- **`--debug` flag** -- prints pipeline diagnostics (input kind, detected type, title, word count, elapsed ms) to stderr without affecting stdout.
- **URL detection** -- `detectUrlType`, `normalizeUrl`, `extractVideoId` helpers.
- **`isProbablyReaderable`** -- lightweight readability pre-check ported from Mozilla Readability, works on URLs and parsed documents.
- **Webpage extraction** -- generic HTML-to-markdown engine with scoring, pattern filters, hidden-content removal, code/math/image/footnote processors.
- **20+ site-specific extractors** -- Reddit, Hacker News, X/Twitter, Claude (chat + share), ChatGPT, Gemini, Grok, GitHub, Substack, Wikipedia, arXiv (with LaTeX), Lean docs, Svelte, BBCode forums, C2 Wiki, and more.
- **YouTube provider** -- transcript, chapters, speakers, thumbnails, lyric detection.
- **GitHub provider** -- issues, PRs (with comments), raw files rendered as fenced code blocks.
- **PDF provider** -- optional, powered by `unpdf` (lightweight alternative to `pdfjs-dist`).
- **X/Twitter profile provider** -- full timeline extraction with `-n/--limit`, `--order`, cursor pagination.
- **llms.txt support** -- opt-in via `--llms` CLI flag or `includeLlmsTxt` option.
- **CLI** -- `rdrr <url>` with flags `-o/--output`, `-j/--json`, `-p/--property`, `-l/--language`, `-n/--limit`, `--order`, `--check`, `--llms`, `--debug`.
- **Security** -- `safeUrl`, `sanitizeInlineText`, `escapeMarkdown` on all API-sourced strings.
- **Subpath export** -- `rdrr/extract` for advanced users who need the raw extraction engine.

### Notes

- ESM-only package.
- Requires Node.js >=20.17.0.
- API is considered experimental until `1.0.0`; breaking changes may land in `0.x.0` releases.

[0.6.0]: https://github.com/fkonovalov/rdrr/releases/tag/v0.6.0
[0.5.0]: https://github.com/fkonovalov/rdrr/releases/tag/v0.5.0
[0.4.0]: https://github.com/fkonovalov/rdrr/releases/tag/v0.4.0
[0.3.0]: https://github.com/fkonovalov/rdrr/releases/tag/v0.3.0
[0.2.2]: https://github.com/fkonovalov/rdrr/releases/tag/v0.2.2
[0.2.1]: https://github.com/fkonovalov/rdrr/releases/tag/v0.2.1
[0.2.0]: https://github.com/fkonovalov/rdrr/releases/tag/v0.2.0
