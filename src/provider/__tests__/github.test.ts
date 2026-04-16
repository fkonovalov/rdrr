import { afterEach, describe, expect, it, vi } from "vitest"
import { parseGitHub } from "../github"

type FetchCall = { input: string; init?: RequestInit }

const makeFetch = (responders: Record<string, () => Response>): { calls: FetchCall[] } => {
  const calls: FetchCall[] = []
  // Prefer longer (more specific) patterns so "/issues/42/comments" wins over "/issues/42".
  const patterns = Object.keys(responders).sort((a, b) => b.length - a.length)
  const spy = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ input: url, init })
    const match = patterns.find((pattern) => url.includes(pattern))
    if (!match) throw new Error(`unexpected fetch: ${url}`)
    return responders[match]!()
  })
  vi.stubGlobal("fetch", spy)
  return { calls }
}

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("parseGitHub issue/PR", () => {
  it("renders issue title, body, and first-page comments", async () => {
    makeFetch({
      "/issues/42": () =>
        jsonResponse({
          title: "Fix foo",
          number: 42,
          state: "open",
          user: { login: "alice" },
          created_at: "2025-01-15T10:00:00Z",
          body: "Repro steps here.",
          labels: [{ name: "bug" }, { name: "good-first-issue" }],
        }),
      "/issues/42/comments": () =>
        new Response(
          JSON.stringify([
            { user: { login: "bob" }, created_at: "2025-01-16T09:00:00Z", body: "Thanks!", author_association: "MEMBER" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    })

    const result = await parseGitHub("https://github.com/acme/widget/issues/42")
    expect(result.type).toBe("github")
    expect(result.title).toBe("Fix foo #42")
    expect(result.author).toBe("alice")
    expect(result.content).toContain("# Fix foo #42")
    expect(result.content).toContain("**Issue** by **alice**")
    expect(result.content).toContain("**Labels:** bug, good-first-issue")
    expect(result.content).toContain("Repro steps here.")
    expect(result.content).toContain("bob (Member)")
    expect(result.content).toContain("Thanks!")
    expect(result.siteName).toBe("GitHub - acme/widget")
    expect(result.domain).toBe("github.com")
  })

  it("follows Link: rel=\"next\" for paginated comments", async () => {
    const firstPageLink = '<https://api.github.com/repos/acme/widget/issues/7/comments?page=2>; rel="next"'
    const responders = {
      "/issues/7": () =>
        jsonResponse({
          title: "Big thread",
          number: 7,
          state: "open",
          user: { login: "alice" },
          created_at: "2025-01-01T00:00:00Z",
          body: "",
          labels: [],
        }),
      "/comments?per_page=100": () =>
        new Response(
          JSON.stringify([{ user: { login: "u1" }, created_at: "2025-01-02T00:00:00Z", body: "a", author_association: "NONE" }]),
          { status: 200, headers: { "content-type": "application/json", link: firstPageLink } },
        ),
      "/comments?page=2": () =>
        new Response(
          JSON.stringify([{ user: { login: "u2" }, created_at: "2025-01-03T00:00:00Z", body: "b", author_association: "NONE" }]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    }
    const { calls } = makeFetch(responders)

    const result = await parseGitHub("https://github.com/acme/widget/issues/7")
    expect(result.content).toMatch(/Comments \(2\)/)
    expect(result.content).toContain("u1")
    expect(result.content).toContain("u2")
    expect(calls.filter((c) => c.input.includes("/comments"))).toHaveLength(2)
  })

  it("throws descriptive error on 404", async () => {
    makeFetch({
      "/issues/99": () => new Response("", { status: 404 }),
      "/comments": () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    })
    await expect(parseGitHub("https://github.com/acme/widget/issues/99")).rejects.toThrow(/not found/i)
  })

  it("throws rate-limit error on 403", async () => {
    makeFetch({
      "/issues/1": () => new Response("", { status: 403 }),
      "/comments": () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    })
    await expect(parseGitHub("https://github.com/acme/widget/issues/1")).rejects.toThrow(/rate limit/i)
  })

  it("uses override github token over env", async () => {
    const { calls } = makeFetch({
      "/issues/1/comments": () =>
        new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      "/issues/1": () =>
        jsonResponse({
          title: "t",
          number: 1,
          state: "open",
          user: { login: "a" },
          created_at: "2025-01-01T00:00:00Z",
          body: null,
          labels: [],
        }),
    })

    await parseGitHub("https://github.com/acme/widget/issues/1", { githubToken: "ghp_abc123" })
    const authorized = calls.find((c) => (c.init?.headers as Record<string, string>)?.Authorization?.includes("ghp_abc123"))
    expect(authorized).toBeDefined()
  })
})

describe("parseGitHub file", () => {
  it("fetches raw content and fences it with detected language", async () => {
    makeFetch({
      "raw.githubusercontent.com": () =>
        new Response("const x = 1\n", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    })

    const result = await parseGitHub("https://github.com/acme/widget/blob/main/src/index.ts")
    expect(result.title).toBe("index.ts - acme/widget")
    expect(result.content).toBe("```typescript\nconst x = 1\n\n```")
  })

  it("leaves markdown files unfenced", async () => {
    makeFetch({
      "raw.githubusercontent.com": () =>
        new Response("# Hello\n\nworld", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    })
    const result = await parseGitHub("https://github.com/acme/widget/blob/main/README.md")
    expect(result.content).not.toContain("```")
    expect(result.content).toContain("# Hello")
  })

  it("reports binary files without body", async () => {
    makeFetch({
      "raw.githubusercontent.com": () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    })
    const result = await parseGitHub("https://github.com/acme/widget/blob/main/assets/logo.bin")
    expect(result.content).toContain("Binary file: logo.bin")
    expect(result.wordCount).toBe(0)
  })

  it("throws descriptive error on 404", async () => {
    makeFetch({
      "raw.githubusercontent.com": () => new Response("", { status: 404 }),
    })
    await expect(parseGitHub("https://github.com/acme/widget/blob/main/missing.ts")).rejects.toThrow(/File not found/)
  })
})

describe("parseGitHub routing", () => {
  it("throws for unsupported github paths", async () => {
    await expect(parseGitHub("https://github.com/acme/widget")).rejects.toThrow(/Not a GitHub issue\/PR\/file/)
  })
})
