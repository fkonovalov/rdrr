import type { ParseResult } from "../types"
import type { AsyncCache } from "./cache"
import type { IdleTimer } from "./guards"
import { parse } from "../rdrr"

export interface ToolDeps {
  cache: AsyncCache<ParseResult>
  /** Brackets every tool call (begin/end) -- drives the idle timeout. */
  idle: IdleTimer
}

export interface CachedParseArgs {
  url: string
  language?: string
  limit?: number
  order?: "newest" | "oldest"
  includeLlmsTxt?: boolean
  timeoutMs?: number
  force?: boolean
}

/** Cache key covers every option that changes the parsed result. */
const cacheKey = (args: CachedParseArgs): string =>
  JSON.stringify([args.url, args.language ?? "", args.limit ?? 0, args.order ?? "", args.includeLlmsTxt ?? false])

// Deliberately no per-request AbortSignal: the in-flight promise is shared by
// every concurrent caller of the same key (single-flight), so one caller's
// cancellation must not reject the others. timeoutMs still bounds the fetch.
export const cachedParse = (deps: ToolDeps, args: CachedParseArgs): Promise<ParseResult> =>
  deps.cache.get(
    cacheKey(args),
    () =>
      parse(args.url, {
        language: args.language,
        limit: args.limit,
        order: args.order,
        includeLlmsTxt: args.includeLlmsTxt,
        timeoutMs: args.timeoutMs,
      }),
    { force: args.force },
  )
