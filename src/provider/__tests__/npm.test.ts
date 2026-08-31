import { afterEach, describe, expect, it, vi } from "vitest"
import { parseNpm } from "../npm"

const REGISTRY_DOC = {
  "name": "demo-pkg",
  "description": "Demo package",
  "readme":
    "# demo-pkg\n\nDoes demo things. See [docs](./docs/api.md) and ![logo](assets/logo.png), or [site](https://demo.example) and [anchor](#usage).",
  "license": "MIT",
  "homepage": "https://demo.example",
  "repository": { url: "git+https://github.com/demo/demo-pkg.git" },
  "dist-tags": { latest: "2.1.0" },
  "time": { "2.1.0": "2026-05-01T12:00:00.000Z", "1.0.0": "2025-01-01T00:00:00.000Z" },
  "versions": {
    "2.1.0": { description: "Demo package" },
    "1.0.0": { description: "Old demo" },
  },
}

const stubRegistry = (impl: (url: string) => Response | Promise<Response>): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => impl(typeof input === "string" ? input : input.toString())),
  )
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("parseNpm", () => {
  it("builds markdown from the registry document", async () => {
    stubRegistry(() => jsonResponse(REGISTRY_DOC))

    const result = await parseNpm("https://www.npmjs.com/package/demo-pkg")

    expect(result.type).toBe("webpage")
    expect(result.title).toBe("demo-pkg")
    expect(result.siteName).toBe("npm")
    expect(result.published).toBe("2026-05-01T12:00:00.000Z")
    expect(result.content).toContain("# demo-pkg")
    expect(result.content).toContain("- Version: 2.1.0")
    expect(result.content).toContain("- License: MIT")
    expect(result.content).toContain("- Repository: https://github.com/demo/demo-pkg")
    expect(result.content).toContain("- Install: `npm install demo-pkg`")
    expect(result.content).toContain("Does demo things.")
  })

  it("resolves relative README links against the GitHub repo", async () => {
    stubRegistry(() => jsonResponse(REGISTRY_DOC))

    const { content } = await parseNpm("https://www.npmjs.com/package/demo-pkg")

    expect(content).toContain("[docs](https://github.com/demo/demo-pkg/blob/HEAD/docs/api.md)")
    expect(content).toContain("![logo](https://github.com/demo/demo-pkg/raw/HEAD/assets/logo.png)")
    expect(content).toContain("[site](https://demo.example)")
    expect(content).toContain("[anchor](#usage)")
  })

  it("leaves markdown examples inside code blocks untouched", async () => {
    stubRegistry(() =>
      jsonResponse({
        ...REGISTRY_DOC,
        readme:
          "Usage:\n\n```md\n[example](./inside-fence.md)\n```\n\nUse `[inline](./in-code.md)` and [real](./real.md).",
      }),
    )

    const { content } = await parseNpm("https://www.npmjs.com/package/demo-pkg")

    expect(content).toContain("[example](./inside-fence.md)")
    expect(content).toContain("`[inline](./in-code.md)`")
    expect(content).toContain("[real](https://github.com/demo/demo-pkg/blob/HEAD/real.md)")
  })

  it("rewrites reference definitions and html src/href", async () => {
    stubRegistry(() =>
      jsonResponse({
        ...REGISTRY_DOC,
        readme: 'See [docs][d].\n\n[d]: ./guide.md\n\n<img src="./shot.png"> <a href="docs/x.md">x</a>',
      }),
    )

    const { content } = await parseNpm("https://www.npmjs.com/package/demo-pkg")

    expect(content).toContain("[d]: https://github.com/demo/demo-pkg/blob/HEAD/guide.md")
    expect(content).toContain('src="https://github.com/demo/demo-pkg/raw/HEAD/shot.png"')
    expect(content).toContain('href="https://github.com/demo/demo-pkg/blob/HEAD/docs/x.md"')
  })

  it("skips indented code and everything after an unclosed fence", async () => {
    stubRegistry(() =>
      jsonResponse({
        ...REGISTRY_DOC,
        readme: "[real](./real.md)\n\n    [indented](./code.md)\n\nbroken:\n```\n[after-fence](./after.md)",
      }),
    )

    const { content } = await parseNpm("https://www.npmjs.com/package/demo-pkg")

    expect(content).toContain("[real](https://github.com/demo/demo-pkg/blob/HEAD/real.md)")
    expect(content).toContain("    [indented](./code.md)")
    expect(content).toContain("[after-fence](./after.md)")
  })

  it("falls back to the version endpoint when the packument exceeds the size cap", async () => {
    const calls: string[] = []
    stubRegistry((url) => {
      calls.push(url)
      if (url.endsWith("/latest")) {
        return jsonResponse({ name: "big-pkg", version: "3.0.0", description: "Huge history", license: "MIT" })
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "content-length": String(50 * 1024 * 1024) },
      })
    })

    const result = await parseNpm("https://www.npmjs.com/package/big-pkg")

    expect(calls).toEqual(["https://registry.npmjs.org/big-pkg", "https://registry.npmjs.org/big-pkg/latest"])
    expect(result.title).toBe("big-pkg")
    expect(result.published).toBeNull()
    expect(result.content).toContain("- Version: 3.0.0")
    expect(result.content).toContain("README omitted: the package's registry metadata exceeds the 10 MB fetch cap")
  })

  it("labels the README when a pinned version has none of its own", async () => {
    stubRegistry(() => jsonResponse(REGISTRY_DOC))

    const { content } = await parseNpm("https://www.npmjs.com/package/demo-pkg/v/1.0.0")

    expect(content).toContain("README below is from the latest version (2.1.0)")
    expect(content).toContain("the registry keeps no README for 1.0.0")
  })

  it("uses the pinned version's own README when present", async () => {
    stubRegistry(() =>
      jsonResponse({
        ...REGISTRY_DOC,
        versions: {
          ...REGISTRY_DOC.versions,
          "1.0.0": { description: "Old demo", readme: "# old readme" },
        },
      }),
    )

    const { content } = await parseNpm("https://www.npmjs.com/package/demo-pkg/v/1.0.0")

    expect(content).toContain("# old readme")
    expect(content).not.toContain("README below is from the latest version")
  })

  it("resolves pinned versions and encodes scoped names", async () => {
    let requested = ""
    stubRegistry((url) => {
      requested = url
      return jsonResponse({ ...REGISTRY_DOC, name: "@scope/demo" })
    })

    const result = await parseNpm("https://www.npmjs.com/package/@scope/demo/v/1.0.0")

    expect(requested).toBe("https://registry.npmjs.org/@scope%2Fdemo")
    expect(result.title).toBe("@scope/demo@1.0.0")
    expect(result.published).toBe("2025-01-01T00:00:00.000Z")
    expect(result.content).toContain("- Version: 1.0.0")
  })

  it("throws a clear error for missing packages", async () => {
    stubRegistry(() => jsonResponse({ error: "Not found" }, 404))

    await expect(parseNpm("https://www.npmjs.com/package/definitely-missing")).rejects.toThrow(
      'npm package "definitely-missing" not found',
    )
  })

  it("resolves dist-tags in the version slot", async () => {
    stubRegistry(() => jsonResponse({ ...REGISTRY_DOC, "dist-tags": { latest: "2.1.0", canary: "1.0.0" } }))

    const result = await parseNpm("https://www.npmjs.com/package/demo-pkg/v/canary")

    expect(result.title).toBe("demo-pkg@1.0.0")
    expect(result.content).toContain("- Version: 1.0.0")
  })

  it("anchors README links to repository.directory for monorepo packages", async () => {
    stubRegistry(() =>
      jsonResponse({
        ...REGISTRY_DOC,
        repository: { url: "git+https://github.com/demo/monorepo.git", directory: "packages/demo-pkg" },
      }),
    )

    const { content } = await parseNpm("https://www.npmjs.com/package/demo-pkg")

    expect(content).toContain("- Repository: https://github.com/demo/monorepo/tree/HEAD/packages/demo-pkg")
    expect(content).toContain("[docs](https://github.com/demo/monorepo/blob/HEAD/packages/demo-pkg/docs/api.md)")
  })

  it("throws for unknown pinned versions", async () => {
    stubRegistry(() => jsonResponse(REGISTRY_DOC))

    await expect(parseNpm("https://www.npmjs.com/package/demo-pkg/v/9.9.9")).rejects.toThrow(
      'Version 9.9.9 of "demo-pkg" not found (latest: 2.1.0)',
    )
  })

  it("honours the user-agent override on registry requests", async () => {
    const agents: Array<string | null> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        agents.push(new Headers(init?.headers).get("user-agent"))
        return jsonResponse(REGISTRY_DOC)
      }),
    )

    await parseNpm("https://www.npmjs.com/package/demo-pkg", { userAgent: "custom-agent/1.0" })

    expect(agents).toEqual(["custom-agent/1.0"])
  })

  it("rejects non-package urls", async () => {
    await expect(parseNpm("https://www.npmjs.com/search?q=x")).rejects.toThrow("Not an npm package URL")
  })
})
