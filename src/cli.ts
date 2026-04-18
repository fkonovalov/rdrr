#!/usr/bin/env node

import { ensureProtocol } from "@shared"
import { Command, InvalidArgumentError } from "commander"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { text as readStdinText } from "node:stream/consumers"
import { pathToFileURL } from "node:url"
import type { ParseResult } from "./types"
import { estimateTokens, truncateToBudget } from "./cli/budget"
import { copyToClipboard } from "./cli/clipboard"
import { parseFormat, renderJsonl, renderXml, type EnrichedResult, type OutputFormat } from "./cli/format"
import { filterHistory, readHistory, recordHistory, sanitiseArgs, sanitiseUrl } from "./cli/history"
import { computeQuality } from "./cli/quality"
import { detectUrlType } from "./detect"
import { isProbablyReaderable } from "./extract/readerable"
import { parseHtml } from "./provider/web"
import { parse } from "./rdrr"

declare const __RDRR_VERSION__: string

type InputKind = "url" | "file" | "stdin"

interface ResolvedInput {
  kind: InputKind
  /** Present for url/file; absent for stdin. */
  url?: string
  /** Present for file/stdin; absent for url. */
  html?: string
  /** Original user-provided input, for error messages. */
  raw: string
}

const looksLikeUrl = (input: string): boolean =>
  /^https?:\/\//i.test(input) || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(input)

const resolveInput = async (input: string): Promise<ResolvedInput> => {
  if (input === "-") {
    const html = await readStdinText(process.stdin)
    return { kind: "stdin", html, raw: input }
  }

  if (!looksLikeUrl(input) && existsSync(input)) {
    const absolute = resolvePath(input)
    const html = readFileSync(absolute, "utf-8")
    return { kind: "file", html, url: pathToFileURL(absolute).href, raw: input }
  }

  return { kind: "url", url: ensureProtocol(input), raw: input }
}

// YAML double-quoted strings accept the JSON string grammar, so JSON.stringify
// produces a valid-and-readable value and correctly escapes backslashes, quotes,
// and control characters that the previous hand-rolled escaper missed.
const yamlString = (value: string): string => JSON.stringify(value.replace(/\n/g, " "))

const buildFrontmatter = (result: ParseResult, source: string): string => {
  const fields: Array<[string, unknown]> = [
    ["title", result.title],
    ["author", result.author],
    ["site", result.siteName],
    ["published", result.published],
    ["source", source],
    ["domain", result.domain],
    ["language", result.language],
    ["dir", result.dir],
    ["description", result.description],
    ["word_count", result.wordCount],
  ]

  const lines = fields
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "string" ? yamlString(value) : value}`)

  return lines.length > 0 ? `---\n${lines.join("\n")}\n---\n\n` : ""
}

const createDebug =
  (enabled: boolean) =>
  (label: string, data?: Record<string, unknown>): void => {
    if (!enabled) return
    const payload = data ? ` ${JSON.stringify(data)}` : ""
    process.stderr.write(`[rdrr:debug] ${label}${payload}\n`)
  }

const parseLimitArg = (value: string): number => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be a positive integer")
  }
  return parsed
}

const parseOrderArg = (value: string): "newest" | "oldest" => {
  if (value !== "newest" && value !== "oldest") {
    throw new InvalidArgumentError("must be 'newest' or 'oldest'")
  }
  return value
}

const parseFormatArg = (value: string): OutputFormat => {
  try {
    return parseFormat(value)
  } catch {
    throw new InvalidArgumentError("must be one of md | json | jsonl | xml")
  }
}

const program = new Command()

program
  .name("rdrr")
  .description("Any URL, file, or HTML stream to clean markdown. 10x fewer tokens for AI agents.")
  .version(__RDRR_VERSION__)
  .argument("<input>", "URL, local .html file, or - to read HTML from stdin")
  .option("-o, --output <file>", "save to file instead of stdout")
  .option("-c, --clip", "copy output to the system clipboard (suppresses stdout)")
  .option("-j, --json", "output full JSON with metadata (alias for --format json)")
  .option("--format <fmt>", "output format: md | json | jsonl | xml", parseFormatArg)
  .option("-p, --property <name>", "extract specific field (title, author, etc.)")
  .option("-l, --language <code>", "preferred language (BCP 47)")
  .option("-n, --limit <n>", "for aggregate URLs (e.g. x.com profiles): max items to fetch", parseLimitArg)
  .option("--order <order>", "for aggregate URLs: newest|oldest", parseOrderArg, "newest")
  .option("--check", "check if URL is probably readerable (exit 0/1 without parsing)")
  .option("--llms", "append the site's /llms.txt to the output if available")
  .option("--timeout <ms>", "per-request timeout in milliseconds (default 15000)", parseLimitArg)
  .option("--user-agent <ua>", "override the outbound User-Agent header")
  .option("--github-token <token>", "GitHub API token (falls back to $GITHUB_TOKEN)")
  .option("--wpm <n>", "words-per-minute used for readTime estimation (default 200)", parseLimitArg)
  .option("--budget <tokens>", "truncate output to fit a token budget", parseLimitArg)
  .option("--quality", "include a quality/readability report (score 0-100) in JSON output")
  .option("--no-history", "skip logging this call to ~/.local/state/rdrr/history.jsonl")
  .option("--allow-private-networks", "allow fetches against RFC1918/loopback/link-local (SSRF-unsafe)")
  .option("--debug", "print pipeline diagnostics to stderr")
  .action(
    async (
      input: string,
      opts: {
        output?: string
        clip?: boolean
        json?: boolean
        format?: OutputFormat
        property?: string
        language?: string
        limit?: number
        order?: "newest" | "oldest"
        check?: boolean
        llms?: boolean
        timeout?: number
        userAgent?: string
        githubToken?: string
        wpm?: number
        budget?: number
        quality?: boolean
        history?: boolean
        allowPrivateNetworks?: boolean
        debug?: boolean
      },
    ) => {
      const debug = createDebug(Boolean(opts.debug))
      const started = Date.now()

      try {
        if (opts.check) {
          if (input === "-" || (!looksLikeUrl(input) && existsSync(input))) {
            process.stderr.write("--check is only supported for URLs\n")
            process.exit(2)
          }
          const url = ensureProtocol(input)
          debug("check", { url })
          const readable = await isProbablyReaderable(url)
          process.stdout.write(readable ? "readable\n" : "not readable\n")
          process.exit(readable ? 0 : 1)
        }

        const resolved = await resolveInput(input)
        debug("input", { kind: resolved.kind, url: resolved.url, bytes: resolved.html?.length })

        const result = await runPipeline(resolved, opts, debug)
        const source = resolved.url ?? resolved.raw

        debug("parsed", {
          type: result.type,
          title: result.title,
          wordCount: result.wordCount,
          contentChars: result.content.length,
        })

        const budgeted: EnrichedResult = opts.budget ? applyBudget(result, opts.budget) : result
        if (opts.budget) debug("budget", { budget: opts.budget, contentChars: budgeted.content.length })

        const scored: EnrichedResult = opts.quality ? { ...budgeted, quality: computeQuality(budgeted) } : budgeted
        if (scored.quality) debug("quality", scored.quality)

        const output = formatOutput(scored, source, opts)

        if (opts.output) {
          writeFileSync(opts.output, output, "utf-8")
          process.stderr.write(`Saved to ${opts.output}\n`)
        }
        if (opts.clip) {
          try {
            const backend = await copyToClipboard(output)
            process.stderr.write(`Copied ${output.length} chars to clipboard (${backend})\n`)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            process.stderr.write(`Clipboard copy failed: ${message}\n`)
            process.exit(5)
          }
        }
        if (!opts.output && !opts.clip) {
          process.stdout.write(output)
        }

        const durationMs = Date.now() - started
        if (resolved.kind === "url" && opts.history !== false) {
          const cleanArgs = sanitiseArgs(process.argv.slice(2).filter((a) => a !== resolved.raw))
          recordHistory({
            ts: new Date().toISOString(),
            url: sanitiseUrl(resolved.url!),
            title: scored.title,
            tokens: estimateTokens(output),
            ...(scored.quality ? { quality: scored.quality.score } : {}),
            durationMs,
            args: cleanArgs,
          })
        }

        debug("done", { ms: durationMs })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`Error: ${message}\n`)
        process.exit(1)
      }
    },
  )

interface PipelineOpts {
  language?: string
  llms?: boolean
  limit?: number
  order?: "newest" | "oldest"
  timeout?: number
  userAgent?: string
  githubToken?: string
  wpm?: number
  allowPrivateNetworks?: boolean
}

const runPipeline = async (
  resolved: ResolvedInput,
  opts: PipelineOpts,
  debug: ReturnType<typeof createDebug>,
): Promise<ParseResult> => {
  if (resolved.kind === "url") {
    const url = resolved.url!
    debug("route", { urlType: detectUrlType(url) })
    return parse(url, {
      language: opts.language,
      includeLlmsTxt: opts.llms,
      limit: opts.limit,
      order: opts.order,
      timeoutMs: opts.timeout,
      userAgent: opts.userAgent,
      githubToken: opts.githubToken,
      wordsPerMinute: opts.wpm,
      allowPrivateNetworks: opts.allowPrivateNetworks,
    })
  }

  if (opts.llms) {
    process.stderr.write("Warning: --llms is ignored when parsing local HTML or stdin\n")
  }
  debug("route", { urlType: "webpage", source: resolved.kind })
  return parseHtml(resolved.html!, { url: resolved.url, language: opts.language, wordsPerMinute: opts.wpm })
}

const applyBudget = (result: ParseResult, budget: number): EnrichedResult => {
  const { content, info } = truncateToBudget(result.content, budget)
  if (!info) return result
  // Attach `truncated` as an extra field so JSON output carries it; frontmatter/
  // markdown modes get the inline `[truncated ...]` marker that `content` already includes.
  return { ...result, content, truncated: info }
}

const pickProperty = (result: ParseResult, property: string): unknown => {
  // `ParseResult` variants (YouTube, PDF, GitHub, XProfile) each add their own
  // fields. Route through a discriminated index instead of a blanket cast so
  // future additions surface via the type system.
  const record: Record<string, unknown> = { ...result }
  return Object.hasOwn(record, property) ? record[property] : undefined
}

const formatOutput = (
  result: EnrichedResult,
  source: string,
  opts: { json?: boolean; format?: OutputFormat; property?: string },
): string => {
  if (opts.property) {
    const value = pickProperty(result, opts.property)
    if (value === undefined) {
      process.stderr.write(`Property "${opts.property}" not found\n`)
      process.exit(1)
    }
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
  }

  const format = resolveFormat(opts)
  switch (format) {
    case "json":
      return JSON.stringify(result, null, 2)
    case "jsonl":
      return renderJsonl(result)
    case "xml":
      return renderXml(result, { source, fetchedAt: new Date().toISOString() })
    case "md":
    default:
      return buildFrontmatter(result, source) + result.content
  }
}

const resolveFormat = (opts: { json?: boolean; format?: OutputFormat }): OutputFormat => {
  // `-j`/`--json` and `--format` together are ambiguous. Warn so scripted
  // callers see the collision, then fall back to `--format` (explicit beats
  // legacy) — keeps modern usage predictable without breaking `-j`-only
  // scripts.
  if (opts.json && opts.format && opts.format !== "json") {
    process.stderr.write(
      `Warning: both --json and --format ${opts.format} given; using --format ${opts.format}\n`,
    )
    return opts.format
  }
  if (opts.json) return "json"
  return opts.format ?? "md"
}

// commander 14 leaks parent-defined flag names into subcommand action's opts
// object (they're accessible via `optsWithGlobals()` only). We standardise on
// `optsWithGlobals()` here so subcommand flags that collide with parent flags
// (like `--json`) still work.
interface CommandSelf {
  optsWithGlobals: () => Record<string, unknown>
}

program
  .command("history")
  .description("list recent rdrr fetches")
  .option("--json", "emit raw JSONL")
  .option("--limit <n>", "max entries to show (default 20)", parseLimitArg)
  .option("--search <q>", "substring match on title/url")
  .option("--since <date>", "only entries at or after this ISO date")
  .action(function (this: CommandSelf) {
    const opts = this.optsWithGlobals() as { json?: boolean; limit?: number; search?: string; since?: string }
    const since = opts.since ? new Date(opts.since) : undefined
    if (since && Number.isNaN(since.getTime())) {
      process.stderr.write(`Invalid --since date: ${opts.since}\n`)
      process.exit(2)
    }
    const entries = filterHistory(readHistory(), { limit: opts.limit ?? 20, search: opts.search, since })
    if (entries.length === 0) {
      process.stderr.write("no history yet\n")
      return
    }
    if (opts.json) {
      for (const e of entries) process.stdout.write(JSON.stringify(e) + "\n")
      return
    }
    for (const e of entries) {
      const ts = e.ts.replace("T", " ").slice(0, 19)
      const tokens = String(e.tokens).padStart(6)
      process.stdout.write(`${ts}  ${tokens}t  ${e.title || "(untitled)"} — ${e.url}\n`)
    }
  })

program
  .command("last")
  .description("print the most recent rdrr fetch")
  .option("-j, --json", "full last-entry JSON")
  .action(function (this: CommandSelf) {
    const opts = this.optsWithGlobals() as { json?: boolean }
    const entries = readHistory()
    const latest = entries[entries.length - 1]
    if (!latest) {
      process.stderr.write("no history yet\n")
      process.exit(1)
    }
    if (opts.json) process.stdout.write(JSON.stringify(latest, null, 2) + "\n")
    else process.stdout.write(latest.url + "\n")
  })

program.parse()
