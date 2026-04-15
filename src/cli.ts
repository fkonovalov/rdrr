#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { text as readStdinText } from "node:stream/consumers"
import { pathToFileURL } from "node:url"
import type { ParseResult } from "./types"
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

const ensureProtocol = (url: string): string =>
  url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`

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

const esc = (s: string): string => s.replace(/"/g, '\\"').replace(/\n/g, " ")

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
    .map(([key, value]) => `${key}: ${typeof value === "string" ? `"${esc(String(value))}"` : value}`)

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

const program = new Command()

program
  .name("rdrr")
  .description("Any URL, file, or HTML stream to clean markdown. 10x fewer tokens for AI agents.")
  .version(__RDRR_VERSION__)
  .argument("<input>", "URL, local .html file, or - to read HTML from stdin")
  .option("-o, --output <file>", "save to file instead of stdout")
  .option("-j, --json", "output full JSON with metadata")
  .option("-p, --property <name>", "extract specific field (title, author, etc.)")
  .option("-l, --language <code>", "preferred language (BCP 47)")
  .option("-n, --limit <n>", "for aggregate URLs (e.g. x.com profiles): max items to fetch", parseLimitArg)
  .option("--order <order>", "for aggregate URLs: newest|oldest", parseOrderArg, "newest")
  .option("--check", "check if URL is probably readerable (exit 0/1 without parsing)")
  .option("--llms", "append the site's /llms.txt to the output if available")
  .option("--debug", "print pipeline diagnostics to stderr")
  .action(
    async (
      input: string,
      opts: {
        output?: string
        json?: boolean
        property?: string
        language?: string
        limit?: number
        order?: "newest" | "oldest"
        check?: boolean
        llms?: boolean
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

        const output = formatOutput(result, source, opts)

        if (opts.output) {
          writeFileSync(opts.output, output, "utf-8")
          process.stderr.write(`Saved to ${opts.output}\n`)
        } else {
          process.stdout.write(output)
        }

        debug("done", { ms: Date.now() - started })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`Error: ${message}\n`)
        process.exit(1)
      }
    },
  )

const runPipeline = async (
  resolved: ResolvedInput,
  opts: { language?: string; llms?: boolean; limit?: number; order?: "newest" | "oldest" },
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
    })
  }

  if (opts.llms) {
    process.stderr.write("Warning: --llms is ignored when parsing local HTML or stdin\n")
  }
  debug("route", { urlType: "webpage", source: resolved.kind })
  return parseHtml(resolved.html!, { url: resolved.url, language: opts.language })
}

const formatOutput = (result: ParseResult, source: string, opts: { json?: boolean; property?: string }): string => {
  if (opts.json) return JSON.stringify(result, null, 2)

  if (opts.property) {
    const value = (result as unknown as Record<string, unknown>)[opts.property]
    if (value === undefined) {
      process.stderr.write(`Property "${opts.property}" not found\n`)
      process.exit(1)
    }
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
  }

  return buildFrontmatter(result, source) + result.content
}

program.parse()
