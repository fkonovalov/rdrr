import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

interface HistoryEntry {
  ts: string
  url: string
  title: string
  tokens: number
  quality?: number
  durationMs: number
  args: string[]
}

const MAX_ENTRIES = 1000

/**
 * XDG-style path that also works on macOS. macOS has no canonical XDG dir, so
 * the issue asks us to reuse `~/.local/state/rdrr/history.jsonl`. Windows reads
 * $LOCALAPPDATA when XDG_STATE_HOME is unset, so that path can be set by the
 * user if needed; otherwise we fall back to the same dotpath.
 */
export const historyPath = (): string => {
  const base = process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state")
  return resolve(base, "rdrr", "history.jsonl")
}

const isHistoryDisabled = (): boolean => process.env["RDRR_NO_HISTORY"] === "1"

export const recordHistory = (entry: HistoryEntry): void => {
  if (isHistoryDisabled()) return
  const path = historyPath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, JSON.stringify(entry) + "\n", "utf-8")
    rotate(path)
  } catch (err) {
    // History is best-effort: logging must never break the primary request.
    // Surface the reason when the user opts in via RDRR_DEBUG so silent
    // failures (permissions, full disk) are still diagnosable.
    if (process.env["RDRR_DEBUG"] === "1") {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[rdrr:history] ${msg}\n`)
    }
  }
}

export const readHistory = (): HistoryEntry[] => {
  const path = historyPath()
  if (!existsSync(path)) return []
  const raw = readFileSync(path, "utf-8")
  const entries: HistoryEntry[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      entries.push(JSON.parse(trimmed) as HistoryEntry)
    } catch {
      // Skip malformed lines rather than aborting the whole read; a single bad
      // write shouldn't make `rdrr history` stop working for the user.
    }
  }
  return entries
}

/**
 * Query params whose values are dropped when writing to history. Keeps the
 * parameter *name* so the URL still round-trips to something recognisable,
 * while keeping tokens out of the log.
 */
const SENSITIVE_QUERY_KEYS = new Set([
  "api_key",
  "apikey",
  "access_token",
  "auth",
  "authorization",
  "key",
  "password",
  "secret",
  "token",
])

/**
 * Strip basic-auth credentials and redact values of common secret-bearing
 * query parameters before logging so history files can't leak tokens that
 * happened to be in the URL the user typed.
 */
export const sanitiseUrl = (url: string): string => {
  try {
    const u = new URL(url)
    u.username = ""
    u.password = ""
    // Snapshot keys before mutating — `set` while iterating `keys()` is
    // implementation-defined on URLSearchParams.
    const keys: string[] = []
    for (const key of u.searchParams.keys()) keys.push(key)
    for (const key of keys) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) u.searchParams.set(key, "REDACTED")
    }
    return u.toString()
  } catch {
    return url
  }
}

/**
 * CLI flags that take a secret/identifying value. When recording history we
 * keep the flag name (so the shape of the call is visible) but drop its value.
 *
 * `-l`/`--language` is *not* in this list — a language code is a user setting,
 * not a secret, and redacting it would make `--args` unreproducible for
 * `rdrr last --fetch`-style workflows.
 */
const SENSITIVE_FLAGS = new Set(["--github-token", "--user-agent"])

/**
 * Redact values of sensitive flags in a raw argv slice. Assumes the input is
 * the argv that was actually passed to `rdrr` (positional URL already stripped
 * by the caller).
 */
export const sanitiseArgs = (args: string[]): string[] => {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    out.push(a)
    if (SENSITIVE_FLAGS.has(a) && i + 1 < args.length) {
      out.push("REDACTED")
      i++
    } else if (a.includes("=")) {
      const eq = a.indexOf("=")
      const flag = a.slice(0, eq)
      if (SENSITIVE_FLAGS.has(flag)) out[out.length - 1] = `${flag}=REDACTED`
    }
  }
  return out
}

interface HistoryFilter {
  limit?: number
  search?: string
  since?: Date
}

export const filterHistory = (entries: HistoryEntry[], filter: HistoryFilter = {}): HistoryEntry[] => {
  let out = entries
  if (filter.since) out = out.filter((e) => new Date(e.ts) >= filter.since!)
  if (filter.search) {
    const q = filter.search.toLowerCase()
    out = out.filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
  }
  out = [...out].reverse()
  if (filter.limit !== undefined) out = out.slice(0, filter.limit)
  return out
}

const rotate = (path: string): void => {
  const raw = readFileSync(path, "utf-8")
  const lines = raw.split(/\r?\n/).filter(Boolean)
  if (lines.length <= MAX_ENTRIES) return
  const trimmed = lines.slice(-MAX_ENTRIES).join("\n") + "\n"
  writeFileSync(path, trimmed, "utf-8")
}
