# Changelog

All notable changes to `rdrr` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While `rdrr` is pre-`1.0`, minor version bumps (`0.x.0`) may contain breaking changes.

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

[0.3.0]: https://github.com/fkonovalov/rdrr/releases/tag/v0.3.0
[0.2.2]: https://github.com/fkonovalov/rdrr/releases/tag/v0.2.2
[0.2.1]: https://github.com/fkonovalov/rdrr/releases/tag/v0.2.1
[0.2.0]: https://github.com/fkonovalov/rdrr/releases/tag/v0.2.0
