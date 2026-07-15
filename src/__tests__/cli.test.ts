import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const CLI = resolve(__dirname, "../../dist/cli.mjs")

const run = (args: string[], stdin?: string): { status: number | null; stdout: string; stderr: string } => {
  const res = spawnSync("node", [CLI, ...args], {
    input: stdin,
    encoding: "utf-8",
    env: { ...process.env, RDRR_NO_HISTORY: "1" },
    timeout: 30_000,
  })
  return { status: res.status, stdout: res.stdout, stderr: res.stderr }
}

const ARTICLE_HTML = `<!doctype html><html><head><title>CLI Test Article</title></head><body><main><h1>CLI Test Article</h1>${"<p>Meaningful paragraph with enough words to pass extraction thresholds and be kept.</p>".repeat(12)}</main></body></html>`

const EMPTY_HTML = '<!doctype html><html><head><title>Shell</title></head><body><div id="root"></div></body></html>'

// These tests exercise the built CLI binary; they are skipped when dist/ has
// not been built yet (run `pnpm build` first).
describe.skipIf(!existsSync(CLI))("cli (built dist)", () => {
  it("parses HTML from stdin and prints frontmatter + markdown, exit 0", () => {
    const { status, stdout } = run(["-"], ARTICLE_HTML)
    expect(status).toBe(0)
    expect(stdout).toContain("---")
    expect(stdout).toContain('title: "CLI Test Article"')
    expect(stdout).toContain("Meaningful paragraph")
    expect(stdout).not.toContain("extraction:")
  })

  it("marks empty extraction in frontmatter, warns on stderr, exit 0", () => {
    const { status, stdout, stderr } = run(["-"], EMPTY_HTML)
    expect(status).toBe(0)
    expect(stdout).toContain('extraction: "empty"')
    expect(stderr).toContain("no content extracted")
  })

  it("exits 3 on empty extraction with --strict", () => {
    const { status } = run(["-", "--strict"], EMPTY_HTML)
    expect(status).toBe(3)
  })

  it("extracts a single property with -p", () => {
    const { status, stdout } = run(["-", "-p", "title"], ARTICLE_HTML)
    expect(status).toBe(0)
    expect(stdout.trim()).toBe("CLI Test Article")
  })

  it("exits 1 and writes Error to stderr for an unknown property", () => {
    const { status, stderr } = run(["-", "-p", "nonexistent"], ARTICLE_HTML)
    expect(status).toBe(1)
    expect(stderr).toContain('Property "nonexistent" not found')
  })

  it("exits 2 when --check is used on stdin", () => {
    const { status, stderr } = run(["-", "--check"], EMPTY_HTML)
    expect(status).toBe(2)
    expect(stderr).toContain("--check is only supported for URLs")
  })

  it("prints version", () => {
    const out = execFileSync("node", [CLI, "--version"], { encoding: "utf-8" })
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
