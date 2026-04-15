import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parseXProfile } from ".."

const FIXTURES = resolve(__dirname, "fixtures")

const loadFixture = (name: string): unknown => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf-8"))

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

interface MockCall {
  url: string
}

const mockFetch = (
  handlers: Array<(url: string) => Response | Promise<Response> | null>,
): { fetch: typeof fetch; calls: MockCall[] } => {
  const calls: MockCall[] = []
  const fn = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url })
    for (const h of handlers) {
      const res = await h(url)
      if (res) return res
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
  return { fetch: fn, calls }
}

describe("parseXProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns the most recent posts in newest-first order by default", async () => {
    const profile = loadFixture("profile-kykypy3a_b.json")
    const page1 = loadFixture("statuses-page1.json")

    const { fetch, calls } = mockFetch([
      (url) => (url.endsWith("/KYKYPY3A_B") ? jsonResponse(profile) : null),
      (url) => (url.includes("/2/profile/KYKYPY3A_B/statuses") ? jsonResponse(page1) : null),
    ])
    vi.stubGlobal("fetch", fetch)

    const result = await parseXProfile("https://x.com/KYKYPY3A_B", { limit: 5 })

    expect(result.type).toBe("x-profile")
    expect(result.handle).toBe("KYKYPY3A_B")
    expect(result.postCount).toBe(5)
    expect(result.author).toBe("@KYKYPY3A_B")
    expect(result.title).toContain("@KYKYPY3A_B")

    // Extract dates from each rendered tweet heading and confirm DESC order.
    const dates = [...result.content.matchAll(/^## \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC)\]/gm)].map((m) => m[1]!)
    expect(dates).toHaveLength(5)
    const sortedDesc = [...dates].sort().reverse()
    expect(dates).toEqual(sortedDesc)

    // One call to profile, one call to statuses — no unnecessary pagination for limit=5.
    expect(calls.filter((c) => c.url.includes("/2/profile/"))).toHaveLength(1)
  })

  it("sorts oldest-first when order=oldest", async () => {
    const profile = loadFixture("profile-kykypy3a_b.json")
    const page1 = loadFixture("statuses-page1.json")
    const { fetch } = mockFetch([
      (url) => (url.endsWith("/KYKYPY3A_B") ? jsonResponse(profile) : null),
      (url) => (url.includes("/2/profile/") ? jsonResponse(page1) : null),
    ])
    vi.stubGlobal("fetch", fetch)

    const result = await parseXProfile("https://x.com/KYKYPY3A_B", { limit: 5, order: "oldest" })

    const dates = [...result.content.matchAll(/^## \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC)\]/gm)].map((m) => m[1]!)
    expect(dates).toHaveLength(5)
    const sortedAsc = [...dates].sort()
    expect(dates).toEqual(sortedAsc)
  })

  it("paginates via cursor.bottom to satisfy limit > one-page", async () => {
    const profile = loadFixture("profile-kykypy3a_b.json")
    const page1 = loadFixture("statuses-page1.json")
    const page2 = loadFixture("statuses-page2.json")

    const { fetch, calls } = mockFetch([
      (url) => (url.endsWith("/KYKYPY3A_B") ? jsonResponse(profile) : null),
      (url) => {
        if (!url.includes("/2/profile/KYKYPY3A_B/statuses")) return null
        return url.includes("cursor=") ? jsonResponse(page2) : jsonResponse(page1)
      },
    ])
    vi.stubGlobal("fetch", fetch)

    const result = await parseXProfile("https://x.com/KYKYPY3A_B", { limit: 30 })

    expect(result.postCount).toBe(30)
    // At least 2 calls to the statuses endpoint (first without cursor, then with).
    const statusCalls = calls.filter((c) => c.url.includes("/2/profile/"))
    expect(statusCalls.length).toBeGreaterThanOrEqual(2)
    expect(statusCalls[0]!.url).not.toContain("cursor=")
    expect(statusCalls[1]!.url).toContain("cursor=")
  })

  it("works without profile metadata when /{handle} endpoint is down", async () => {
    const page1 = loadFixture("statuses-page1.json")
    const { fetch } = mockFetch([
      (url) => (url.endsWith("/KYKYPY3A_B") && !url.includes("/2/") ? jsonResponse({ code: 500 }, 500) : null),
      (url) => (url.includes("/2/profile/") ? jsonResponse(page1) : null),
    ])
    vi.stubGlobal("fetch", fetch)

    const result = await parseXProfile("https://x.com/KYKYPY3A_B", { limit: 3 })

    expect(result.postCount).toBe(3)
    // Header falls back to the bare handle since profile metadata is missing.
    // (Underscore is markdown-escaped by sanitizeInlineText.)
    expect(result.content).toMatch(/^# @KYKYPY3A\\?_B$/m)
    expect(result.description).toBe("")
  })

  it("throws a user-friendly error when the user does not exist", async () => {
    const { fetch } = mockFetch([
      () => jsonResponse({ code: 404, results: [], cursor: { top: null, bottom: null } }, 404),
    ])
    vi.stubGlobal("fetch", fetch)

    await expect(parseXProfile("https://x.com/nosuchuser_42", { limit: 5 })).rejects.toThrow(
      /X user @nosuchuser_42 not found/,
    )
  })

  it("throws when the account has no public posts", async () => {
    const profile = loadFixture("profile-kykypy3a_b.json")
    const { fetch } = mockFetch([
      (url) => (url.endsWith("/KYKYPY3A_B") ? jsonResponse(profile) : null),
      (url) => (url.includes("/2/profile/") ? jsonResponse({ code: 200, results: [], cursor: null }) : null),
    ])
    vi.stubGlobal("fetch", fetch)

    await expect(parseXProfile("https://x.com/KYKYPY3A_B", { limit: 5 })).rejects.toThrow(/No public posts/)
  })

  describe("security hardening", () => {
    const buildProfile = (overrides: Record<string, unknown>) => ({
      code: 200,
      message: "OK",
      user: {
        screen_name: "attacker",
        name: "Attacker",
        followers: 10,
        statuses: 5,
        description: "",
        ...overrides,
      },
    })

    const buildStatuses = (overrides: Record<string, unknown>) => ({
      code: 200,
      results: [
        {
          id: "1",
          url: "https://x.com/attacker/status/1",
          text: "hello",
          raw_text: { text: "hello", display_text_range: [0, 5], facets: [] },
          author: { screen_name: "attacker", name: "Attacker" },
          created_at: "Wed Apr 01 12:00:00 +0000 2026",
          created_timestamp: 1775404800,
          media: { all: [] },
          replying_to: null,
          reposted_by: null,
          ...overrides,
        },
      ],
      cursor: { top: null, bottom: null },
    })

    const stubProfileAndStatuses = (profile: unknown, statuses: unknown): void => {
      const { fetch } = mockFetch([
        (url) => (url.endsWith("/attacker") && !url.includes("/2/") ? jsonResponse(profile) : null),
        (url) => (url.includes("/2/profile/") ? jsonResponse(statuses) : null),
      ])
      vi.stubGlobal("fetch", fetch)
    }

    it("strips newlines and block markers from display name in the heading", async () => {
      const profile = buildProfile({
        name: "Pwned\n\n# Fake heading\n\n[click](javascript:alert(1))",
      })
      stubProfileAndStatuses(profile, buildStatuses({}))

      const result = await parseXProfile("https://x.com/attacker", { limit: 1 })

      // The attacker cannot open a new heading: there must be exactly one top-level `# ` line.
      const headingLines = result.content.split("\n").filter((l) => l.startsWith("# "))
      expect(headingLines).toHaveLength(1)
      // No line may BEGIN with `# Fake heading` — that would be a forged heading.
      expect(result.content).not.toMatch(/^# Fake heading/m)
      // No active markdown link (unescaped brackets) with `javascript:` scheme may exist.
      expect(result.content).not.toMatch(/(?<!\\)\[[^\]]*\]\(javascript:/)
    })

    it("escapes markdown-significant chars in display name so they render as literals", async () => {
      const profile = buildProfile({ name: "[Alice](https://evil.example) _fake_" })
      stubProfileAndStatuses(profile, buildStatuses({}))

      const result = await parseXProfile("https://x.com/attacker", { limit: 1 })

      expect(result.content).not.toContain("[Alice](https://evil.example)")
      expect(result.content).toMatch(/\\\[Alice\\\]/)
    })

    it("escapes markdown in profile description so links cannot be forged", async () => {
      const profile = buildProfile({
        description: "Check [here](javascript:alert(1)) and _this_",
      })
      stubProfileAndStatuses(profile, buildStatuses({}))

      const result = await parseXProfile("https://x.com/attacker", { limit: 1 })

      // No active markdown link (unescaped brackets) anywhere — the description's
      // `[here](javascript:...)` must render as literal text only.
      expect(result.content).not.toMatch(/(?<!\\)\[here\]\(/)
      expect(result.content).not.toMatch(/(?<!\\)\[[^\]]*\]\(javascript:/)
      // Brackets and underscores from the bio should appear explicitly escaped.
      expect(result.content).toContain("\\[here\\]")
      expect(result.content).toContain("\\_this\\_")
    })

    it("drops url facets whose href is not http(s)", async () => {
      const profile = buildProfile({})
      const statuses = buildStatuses({
        text: "click here",
        raw_text: {
          text: "click here",
          display_text_range: [0, 10],
          facets: [
            {
              type: "url",
              indices: [0, 5],
              original: "javascript:alert(1)",
              replacement: "javascript:alert(1)",
              display: "click",
            },
          ],
        },
      })
      stubProfileAndStatuses(profile, statuses)

      const result = await parseXProfile("https://x.com/attacker", { limit: 1 })

      expect(result.content).not.toContain("javascript:")
      // The label survives as plain text (escaped).
      expect(result.content).toContain("click")
    })

    it("percent-encodes closing parens in legitimate URLs so links cannot break out", async () => {
      // Wikipedia-style URL with a parenthesis — this is a real-world case that
      // would otherwise terminate the markdown link early and leak bytes after it.
      const profile = buildProfile({})
      const statuses = buildStatuses({
        text: "see article",
        raw_text: {
          text: "see article",
          display_text_range: [0, 11],
          facets: [
            {
              type: "url",
              indices: [4, 11],
              original: "https://en.wikipedia.org/wiki/Foo_(bar)",
              replacement: "https://en.wikipedia.org/wiki/Foo_(bar)",
              display: "article",
            },
          ],
        },
      })
      stubProfileAndStatuses(profile, statuses)

      const result = await parseXProfile("https://x.com/attacker", { limit: 1 })

      expect(result.content).toContain("%29")
      expect(result.content).not.toContain("wiki/Foo_(bar)")
    })

    it("drops media items with non-http(s) URLs", async () => {
      const profile = buildProfile({})
      const statuses = buildStatuses({
        media: {
          all: [
            { type: "photo", url: "javascript:alert(1)" },
            { type: "photo", url: "https://pbs.twimg.com/media/ok.jpg" },
          ],
        },
      })
      stubProfileAndStatuses(profile, statuses)

      const result = await parseXProfile("https://x.com/attacker", { limit: 1 })

      expect(result.content).not.toContain("javascript:")
      expect(result.content).toContain("https://pbs.twimg.com/media/ok.jpg")
    })

    it("sanitizes display name in frontmatter title so quoting and brackets are neutralized", async () => {
      const profile = buildProfile({
        name: 'Evil" [x](javascript:1) \n# heading',
      })
      stubProfileAndStatuses(profile, buildStatuses({}))

      const result = await parseXProfile("https://x.com/attacker", { limit: 1 })

      // Title should not contain markdown link syntax or newlines.
      expect(result.title).not.toContain("[x]")
      expect(result.title).not.toContain("\n")
      expect(result.title).not.toMatch(/[[\]`]/)
    })
  })

  it("annotates retweets with the 🔁 marker", async () => {
    // Page 1 fixture is captured from the real account and is known to contain at least one retweet.
    const profile = loadFixture("profile-kykypy3a_b.json")
    const page1 = loadFixture("statuses-page1.json") as { results: Array<{ reposted_by?: unknown }> }
    expect(page1.results.some((s) => s.reposted_by)).toBe(true)

    const { fetch } = mockFetch([
      (url) => (url.endsWith("/KYKYPY3A_B") ? jsonResponse(profile) : null),
      (url) => (url.includes("/2/profile/") ? jsonResponse(page1) : null),
    ])
    vi.stubGlobal("fetch", fetch)

    const result = await parseXProfile("https://x.com/KYKYPY3A_B", { limit: 18 })

    expect(result.content).toContain("🔁 Reposted @")
  })
})
