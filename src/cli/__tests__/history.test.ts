import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { filterHistory, historyPath, readHistory, recordHistory, sanitiseArgs, sanitiseUrl } from "../history"

describe("sanitiseUrl", () => {
  it("strips basic-auth credentials", () => {
    expect(sanitiseUrl("https://user:pass@example.com/path")).toBe("https://example.com/path")
  })

  it("redacts values of common secret-bearing query parameters", () => {
    const out = sanitiseUrl("https://api.example.com/items?api_key=secret123&q=hello")
    expect(out).toContain("api_key=REDACTED")
    expect(out).toContain("q=hello")
    expect(out).not.toContain("secret123")
  })

  it("redacts case-insensitively (Authorization, TOKEN)", () => {
    const out = sanitiseUrl("https://x/?Authorization=bearer+xxx&TOKEN=abc")
    expect(out).toContain("Authorization=REDACTED")
    expect(out).toContain("TOKEN=REDACTED")
  })

  it("returns non-URL input unchanged", () => {
    expect(sanitiseUrl("not a url")).toBe("not a url")
  })
})

describe("sanitiseArgs", () => {
  it("redacts the value after --github-token", () => {
    expect(sanitiseArgs(["--github-token", "ghp_XXXXXXXX", "--json"])).toEqual([
      "--github-token",
      "REDACTED",
      "--json",
    ])
  })

  it("redacts --flag=value form", () => {
    expect(sanitiseArgs(["--github-token=ghp_abc", "--json"])).toEqual(["--github-token=REDACTED", "--json"])
  })

  it("leaves non-sensitive flags alone", () => {
    expect(sanitiseArgs(["--budget", "2000", "--quality"])).toEqual(["--budget", "2000", "--quality"])
  })

  it("does not redact language (not a secret, and needed to replay calls)", () => {
    expect(sanitiseArgs(["-l", "fr", "--quality"])).toEqual(["-l", "fr", "--quality"])
    expect(sanitiseArgs(["--language", "de"])).toEqual(["--language", "de"])
  })
})

describe("history store", () => {
  let dir: string
  let originalHome: string | undefined
  let originalXdg: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rdrr-hist-"))
    originalHome = process.env["HOME"]
    originalXdg = process.env["XDG_STATE_HOME"]
    process.env["XDG_STATE_HOME"] = dir
  })

  afterEach(() => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome
    if (originalXdg !== undefined) process.env["XDG_STATE_HOME"] = originalXdg
    else delete process.env["XDG_STATE_HOME"]
    rmSync(dir, { recursive: true, force: true })
  })

  it("writes and reads back entries", () => {
    recordHistory({
      ts: "2026-04-18T00:00:00Z",
      url: "https://a/",
      title: "A",
      tokens: 10,
      durationMs: 12,
      args: [],
    })
    recordHistory({
      ts: "2026-04-18T00:01:00Z",
      url: "https://b/",
      title: "B",
      tokens: 20,
      durationMs: 22,
      args: [],
    })

    const entries = readHistory()
    expect(entries).toHaveLength(2)
    expect(entries[1]!.url).toBe("https://b/")

    const raw = readFileSync(historyPath(), "utf-8")
    expect(raw.split("\n").filter(Boolean)).toHaveLength(2)
  })

  it("rotates the log when it exceeds the 1000-entry cap", () => {
    for (let i = 0; i < 1005; i++) {
      recordHistory({
        ts: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        url: `https://example.com/${i}`,
        title: `Entry ${i}`,
        tokens: 1,
        durationMs: 1,
        args: [],
      })
    }
    const entries = readHistory()
    // The cap is 1000; once we cross it the oldest entries are dropped.
    expect(entries.length).toBeLessThanOrEqual(1000)
    expect(entries[entries.length - 1]!.url).toBe("https://example.com/1004")
    expect(entries[0]!.url).not.toBe("https://example.com/0")
  })

  it("filters by search/since and applies limit", () => {
    const now = Date.now()
    const entries = [
      { ts: new Date(now - 60_000).toISOString(), url: "https://react.dev", title: "React", tokens: 1, durationMs: 1, args: [] },
      { ts: new Date(now - 30_000).toISOString(), url: "https://vue.dev", title: "Vue", tokens: 1, durationMs: 1, args: [] },
      { ts: new Date(now).toISOString(), url: "https://react.dev/learn", title: "React Learn", tokens: 1, durationMs: 1, args: [] },
    ]
    const filtered = filterHistory(entries, { search: "react", limit: 1 })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.url).toBe("https://react.dev/learn")
    const since = filterHistory(entries, { since: new Date(now - 45_000) })
    expect(since).toHaveLength(2)
  })
})
