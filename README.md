# rdrr

[![npm version](https://img.shields.io/npm/v/rdrr.svg)](https://www.npmjs.com/package/rdrr)
[![CI](https://github.com/fkonovalov/rdrr/actions/workflows/ci.yml/badge.svg)](https://github.com/fkonovalov/rdrr/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/rdrr.svg)](./LICENSE)

**Web content to clean Markdown for AI agents.**

Give your agent the article, the discussion, or the transcript. rdrr removes navigation, ads, and page clutter while preserving code blocks, tables, links, and conversation structure.

Read documentation, Hacker News threads, YouTube videos, GitHub issues, and more with one command. Available as a **CLI, TypeScript library, and MCP server**. Runs locally, with no headless browser or API key to get started.

## Try it

Requires **Node.js 22.12+**. Run without a global install:

```sh
npx -y rdrr "https://react.dev/learn"
```

You get Markdown with source metadata. Excerpt, with some metadata and body text omitted:

```md
---
title: "Quick Start"
site: "React"
source: "https://react.dev/learn"
word_count: 1944
---

### You will learn

- How to create and nest components
- How to add markup and styles
- How to display data
```

Or [try it in your browser](https://rdrr.app/react.dev/learn), without Node.js:

```sh
curl "https://rdrr.app/react.dev/learn"
```

The [hosted service](https://rdrr.app) includes 1,000 free requests per month per IP. The local CLI has no rdrr quota; upstream sites still apply their own limits.

## Less page, more context

rdrr extracts source content without an LLM summarization step.

Example sizes, measured with rdrr 0.7.0 on September 11, 2026:

| Page                                                                           | Raw HTML | Markdown body | Reduction |
| ------------------------------------------------------------------------------ | -------: | ------------: | --------: |
| [React quick start](https://react.dev/learn)                                   |   66,256 |         3,785 |     17.5x |
| [TypeScript on Wikipedia](https://en.wikipedia.org/wiki/TypeScript)            |  107,137 |        10,171 |     10.5x |
| [Dropbox discussion on Hacker News](https://news.ycombinator.com/item?id=8863) |   25,250 |         7,967 |      3.2x |

Counts are **estimated tokens**, using `ceil(text.length / 4)`, with no truncation. Savings depend on the page and tokenizer. [Measurement method](./docs/reference.md#token-measurements).

## Read more than articles

Install the CLI for repeated use:

```sh
npm install -g rdrr
```

Start with [the original Dropbox pitch on Hacker News](https://news.ycombinator.com/item?id=8863). Read the feedback and the founder's replies in one Markdown document:

```sh
rdrr "https://news.ycombinator.com/item?id=8863" --budget 8000
```

The Hacker News extractor keeps the post link, comment authors, dates, permalinks, and nested replies from the fetched page. Use the article's own URL when you want the linked article too.

Try another source with the same command:

| Source                     | Example                                                  | What you get                                                                    |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Documentation and articles | `rdrr "https://react.dev/learn"`                         | Main content, code blocks, tables, links, and metadata                          |
| YouTube                    | `rdrr "https://www.youtube.com/watch?v=dQw4w9WgXcQ"`     | Available transcript with timestamps; chapter metadata in JSON                  |
| GitHub                     | `rdrr "https://github.com/mozilla/readability/issues/1"` | Issue body and comments; also supports PR conversations, discussions, and files |
| Stack Overflow             | `rdrr "https://stackoverflow.com/questions/11227809"`    | Question and up to 10 top-voted answers                                         |
| npm                        | `rdrr "https://www.npmjs.com/package/rdrr"`              | Package facts and README from the registry                                      |
| X / Twitter                | `rdrr "https://x.com/discotune" -n 10`                   | Recent public posts; single post URLs work too                                  |
| Local HTML                 | `rdrr page.html` or `cat page.html \| rdrr -`            | Markdown from a saved file or HTML stream                                       |

Dedicated HTML extractors also cover Reddit, Substack, X articles, the c2.com wiki, and ChatGPT, Claude, Gemini, and Grok conversations when their content is present in the supplied HTML. [Source details and limits](./docs/reference.md#site-extractors).

## Use with AI agents

### MCP server

Add rdrr to Claude Code:

```sh
claude mcp add rdrr -- npx -y --package=rdrr rdrr-mcp
```

For Cursor or Claude Desktop, add this entry to your MCP configuration:

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

Then ask your agent:

> Use rdrr to read https://news.ycombinator.com/item?id=8863. Summarize the main objections to Dropbox and how the founder responded. Link to the comments you cite.

| Tool             | Use it to                                                  |
| ---------------- | ---------------------------------------------------------- |
| `fetch`          | Read a URL with metadata and an estimated token budget     |
| `parallel_fetch` | Read up to 10 URLs at once, with failures reported per URL |
| `check`          | Check the URL type and likely readability                  |
| `extract_html`   | Convert HTML your agent already has                        |

Long results paginate: pass `truncated.nextStartIndex` back as `startIndex` to continue reading. [MCP options](./docs/reference.md#mcp-server).

### Shell-based agents

Add this to your `AGENTS.md` or `CLAUDE.md`:

```markdown
To read a web page, run `rdrr "{url}" --budget 8000`.
If rdrr is not installed, use `npx -y rdrr "{url}" --budget 8000`.
If output contains `extraction: "empty"` or a bot-wall error, use a browser tool.
If content is truncated and you need the rest, rerun without `--budget`.
```

## Save, pipe, and inspect

| Task                             | Command                                                  |
| -------------------------------- | -------------------------------------------------------- |
| Save an article                  | `rdrr "https://react.dev/learn" -o react.md`             |
| Copy to clipboard                | `rdrr "https://react.dev/learn" --clip`                  |
| Request a smaller body           | `rdrr "https://react.dev/learn" --budget 2000`           |
| Get metadata and a quality score | `rdrr "https://react.dev/learn" --format json --quality` |
| Print only the Markdown body     | `rdrr "https://react.dev/learn" --property content`      |
| Append the site's llms.txt       | `rdrr "https://svelte.dev/docs/svelte/overview" --llms`  |
| Inspect recent failures          | `rdrr history --failures`                                |

Output formats: Markdown with YAML frontmatter (default), JSON, JSONL, and XML. `--budget` uses an estimate of four characters per token and preserves paragraphs and fenced code blocks, so it can exceed the requested size. Metadata is extra.

URL fetches are recorded in local history. Use `--no-history` for one call or `RDRR_NO_HISTORY=1` to disable it. Run `rdrr --help` for all flags, or see the [CLI reference](./docs/reference.md#cli).

## Use in TypeScript

```sh
npm install rdrr
```

```ts
import { parse } from "rdrr"

const page = await parse("https://news.ycombinator.com/item?id=8863")

console.log(page.title)
console.log(page.content)
console.log(page.wordCount)
```

Every result includes Markdown content, a source type, title, author, and word count. Source-specific parsers such as `parseYouTube` expose typed fields including `transcript` and `chapters`.

Already have the HTML? Supply the original URL to resolve relative links and select the site's extractor:

```ts
import { readFile } from "node:fs/promises"
import { parseHtml } from "rdrr"

const html = await readFile("page.html", "utf8")
const page = await parseHtml(html, { url: "https://react.dev/learn" })

console.log(page.content)
```

The package uses ESM and bundles its runtime dependencies. [Library options and exports](./docs/reference.md#library).

## Know the limits

- **JavaScript and access walls:** rdrr does not execute JavaScript or bypass login, paywall, or bot challenges. Some pages return partial or empty content; HTTP failures return errors. If you can obtain rendered HTML with a browser, pass it to `parseHtml`.
- **Empty output:** Markdown marks an empty body with `extraction: "empty"`; CLI JSON, JSONL and MCP use `extractionEmpty: true`. XML includes `<extractionEmpty>true</extractionEmpty>`. Add `--strict` to exit with code `3` in that case. Fetch errors exit with code `1`.
- **Input size:** Each response or HTML input is limited to 20 MiB. [Limits and network protection](./docs/reference.md#input-limits-and-network-protection).
- **Upstream availability:** YouTube transcripts depend on available captions. X uses external endpoints, including FxTwitter. GitHub API requests can use `GITHUB_TOKEN` for higher limits.
- **PDFs:** PDF parsing is not supported.

[Full reference](./docs/reference.md) · [Changelog](./CHANGELOG.md)

## Help and contribute

Found a page that extracts badly? [Report it with the URL and expected content](https://github.com/fkonovalov/rdrr/issues/new?template=site_request.yml). For questions and ideas, use [Discussions](https://github.com/fkonovalov/rdrr/discussions).

To add an extractor or work on the project, see [CONTRIBUTING.md](./CONTRIBUTING.md). Report vulnerabilities using [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
