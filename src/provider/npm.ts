import { countWords, estimateReadTime, mergeSignals } from "@shared"
import type { ParseOptions, WebpageResult } from "../types"
import { extractNpmPackage } from "../detect"

const DEFAULT_TIMEOUT_MS = 25000
const REGISTRY = "https://registry.npmjs.org"

interface RegistryManifest {
  description?: string
  license?: string | { type?: string }
  homepage?: string
  repository?: string | { url?: string; directory?: string }
  readme?: string
}

interface RegistryDoc extends RegistryManifest {
  "name"?: string
  "readme"?: string
  "dist-tags"?: Record<string, string>
  "time"?: Record<string, string>
  "versions"?: Record<string, RegistryManifest>
}

// The README lives only in the full packument (version endpoints don't carry
// it), and packuments of long-lived packages reach tens of megabytes — so the
// download is capped, with a facts-only fallback via the version endpoint.
const MAX_PACKUMENT_BYTES = 10 * 1024 * 1024

// www.npmjs.com serves 403 to non-browser clients; the registry API is open
// and carries the same README, so package pages route through it instead.
export const parseNpm = async (url: string, options?: ParseOptions): Promise<WebpageResult> => {
  const ref = extractNpmPackage(url)
  if (!ref) throw new Error(`Not an npm package URL: ${url}`)

  const signal = mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal)
  const encoded = ref.name.replace("/", "%2F")
  const res = await fetch(`${REGISTRY}/${encoded}`, { headers: registryHeaders(options), signal })

  if (res.status === 404) throw new Error(`npm package "${ref.name}" not found in the registry`)
  if (!res.ok) throw new Error(`Failed to fetch npm registry: ${res.status} ${res.statusText}`)

  const body = await readBodyCapped(res, MAX_PACKUMENT_BYTES)
  if (body === null) return parseFromVersionEndpoint(ref.name, ref.version, encoded, options)

  const doc = JSON.parse(body) as RegistryDoc
  // /v/<x> may carry a dist-tag (canary, beta) rather than a semver version.
  const version = ref.version ? (doc["dist-tags"]?.[ref.version] ?? ref.version) : (doc["dist-tags"]?.latest ?? "")
  const manifest = version ? doc.versions?.[version] : undefined
  if (ref.version && !manifest) {
    throw new Error(`Version ${ref.version} of "${ref.name}" not found (latest: ${doc["dist-tags"]?.latest ?? "?"})`)
  }

  const description = manifest?.description ?? doc.description ?? ""
  const content = buildContent(ref.name, version, description, manifest ?? doc, doc)
  return buildResult(ref, version, description, content, doc.time?.[version] ?? null, options)
}

const registryHeaders = (options: ParseOptions | undefined): Record<string, string> => ({
  Accept: "application/json",
  ...(options?.userAgent ? { "User-Agent": options.userAgent } : {}),
})

const readBodyCapped = async (res: Response, cap: number): Promise<string | null> => {
  const declared = Number(res.headers.get("content-length") ?? 0)
  if (declared > cap) {
    await res.body?.cancel()
    return null
  }
  const reader = res.body?.getReader()
  if (!reader) {
    const text = await res.text()
    return text.length > cap ? null : text
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > cap) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

// The version endpoint resolves dist-tags itself and stays tiny, but carries
// no README and no publish time.
const parseFromVersionEndpoint = async (
  name: string,
  pinned: string | null,
  encoded: string,
  options: ParseOptions | undefined,
): Promise<WebpageResult> => {
  // Fresh timeout: the aborted packument download may have consumed most of
  // the previous signal's budget.
  const signal = mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal)
  const res = await fetch(`${REGISTRY}/${encoded}/${encodeURIComponent(pinned ?? "latest")}`, {
    headers: registryHeaders(options),
    signal,
  })
  if (res.status === 404) throw new Error(`Version ${pinned ?? "latest"} of "${name}" not found in the registry`)
  if (!res.ok) throw new Error(`Failed to fetch npm registry: ${res.status} ${res.statusText}`)

  const manifest = (await res.json()) as RegistryManifest & { version?: string }
  const version = manifest.version ?? pinned ?? ""
  const description = manifest.description ?? ""
  const content =
    buildContent(name, version, description, manifest, {}) +
    `\n\n> README omitted: the package's registry metadata exceeds the ${MAX_PACKUMENT_BYTES / 1024 / 1024} MB fetch cap.`
  return buildResult({ name, version: pinned }, version, description, content, null, options)
}

const buildResult = (
  ref: { name: string; version: string | null },
  version: string,
  description: string,
  content: string,
  published: string | null,
  options: ParseOptions | undefined,
): WebpageResult => {
  const wordCount = countWords(content)
  return {
    type: "webpage",
    title: ref.version ? `${ref.name}@${version}` : ref.name,
    author: "",
    content,
    description,
    domain: "www.npmjs.com",
    siteName: "npm",
    published,
    wordCount,
    readTime: estimateReadTime(wordCount, options?.wordsPerMinute),
  }
}

const buildContent = (
  name: string,
  version: string,
  description: string,
  manifest: RegistryManifest,
  doc: RegistryDoc,
): string => {
  const lines = [`# ${name}`]
  if (description) lines.push("", description)

  const facts: string[] = []
  if (version) facts.push(`- Version: ${version}`)
  const license = formatLicense(manifest.license ?? doc.license)
  if (license) facts.push(`- License: ${license}`)
  const published = version ? doc.time?.[version] : undefined
  if (published) facts.push(`- Published: ${published.slice(0, 10)}`)
  const homepage = manifest.homepage ?? doc.homepage
  if (homepage) facts.push(`- Homepage: ${homepage}`)
  const { url: repoUrl, directory: repoDir } = parseRepository(manifest.repository ?? doc.repository)
  if (repoUrl) facts.push(`- Repository: ${repoDir ? `${repoUrl}/tree/HEAD/${repoDir}` : repoUrl}`)
  facts.push(`- Install: \`npm install ${name}\``)
  lines.push("", ...facts)

  // The registry only stores the README of the last publish; per-version
  // manifests rarely carry one. Label the mismatch instead of pretending.
  const versionReadme = (manifest.readme ?? "").trim()
  const latest = doc["dist-tags"]?.latest ?? ""
  const readme = versionReadme || (doc.readme ?? "").trim()
  if (readme) {
    lines.push("", "---", "")
    if (!versionReadme && version && latest && version !== latest) {
      lines.push(
        `> README below is from the latest version (${latest}); the registry keeps no README for ${version}.`,
        "",
      )
    }
    lines.push(resolveReadmeLinks(readme, repoUrl, repoDir))
  }
  return lines.join("\n")
}

const GITHUB_REPO = /^https:\/\/github\.com\/[^/]+\/[^/]+$/

// Code detection is heuristic (fences of any length, 1-2 backtick inline
// spans, indented lines, unclosed fences). It errs toward over-matching: a
// link mistaken for code merely stays relative, while the reverse would
// corrupt code samples.
const CODE_SEGMENT = /(?:`{3,}|~{3,})[\s\S]*?(?:`{3,}|~{3,})|`{1,2}[^`\n]+?`{1,2}/g
const OPEN_FENCE = /^[ \t]*(?:`{3,}|~{3,})/m
const INDENTED_LINE = /^(?: {4}|\t)/

// Registry READMEs link relative to the package directory (./docs/api.md);
// outside npm's renderer those destinations are dead, so anchor them to
// GitHub, honouring repository.directory for monorepo packages.
const resolveReadmeLinks = (readme: string, repoUrl: string, repoDir: string): string => {
  if (!GITHUB_REPO.test(repoUrl)) return readme

  let out = ""
  let last = 0
  for (const match of readme.matchAll(CODE_SEGMENT)) {
    out += rewriteRelativeLinks(readme.slice(last, match.index), repoUrl, repoDir)
    out += match[0]
    last = match.index + match[0].length
  }

  const tail = readme.slice(last)
  const unclosed = tail.match(OPEN_FENCE)
  if (unclosed?.index !== undefined) {
    out += rewriteRelativeLinks(tail.slice(0, unclosed.index), repoUrl, repoDir) + tail.slice(unclosed.index)
  } else {
    out += rewriteRelativeLinks(tail, repoUrl, repoDir)
  }
  return out
}

const rewriteRelativeLinks = (segment: string, repoUrl: string, repoDir: string): string => {
  const base = repoDir ? `${repoDir}/` : ""
  const target = (dest: string, kind: "blob" | "raw"): string =>
    `${repoUrl}/${kind}/HEAD/${base}${dest.replace(/^\.\//, "").replace(/^\//, "")}`

  return segment
    .split("\n")
    .map((line) => {
      if (INDENTED_LINE.test(line)) return line
      return line
        .replace(
          /(!?\[[^\]]*\]\()(?![a-z][a-z0-9+.-]*:|\/\/|#)([^)\s]+)(\))/gi,
          (_m, prefix: string, dest: string, close: string) =>
            `${prefix}${target(dest, prefix.startsWith("!") ? "raw" : "blob")}${close}`,
        )
        .replace(
          /(^\s{0,3}\[[^\]]+\]:\s*)(?![a-z][a-z0-9+.-]*:|\/\/|#)(\S+)/i,
          (_m, prefix: string, dest: string) => `${prefix}${target(dest, "blob")}`,
        )
        .replace(
          /((?:src|href)=")(?![a-z][a-z0-9+.-]*:|\/\/|#)([^"]+)(")/gi,
          (_m, prefix: string, dest: string, close: string) =>
            `${prefix}${target(dest, prefix.toLowerCase().startsWith("src") ? "raw" : "blob")}${close}`,
        )
    })
    .join("\n")
}

const formatLicense = (license: RegistryManifest["license"]): string =>
  typeof license === "string" ? license : (license?.type ?? "")

const parseRepository = (repository: RegistryManifest["repository"]): { url: string; directory: string } => {
  const raw = typeof repository === "string" ? repository : (repository?.url ?? "")
  const directory = (typeof repository === "object" ? (repository?.directory ?? "") : "").replace(/^\/+|\/+$/g, "")
  const url = raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/\.git$/, "")
  return { url, directory }
}
