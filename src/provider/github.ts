import { countWords, estimateReadTime, mergeSignals } from "@shared"
import type { GitHubResult, ParseOptions } from "../types"

const DEFAULT_TIMEOUT_MS = 15000

const ISSUE_PR_RE = /github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/
const FILE_RE = /github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)/

interface Issue {
  title: string
  number: number
  state: string
  user: { login: string } | null
  created_at: string
  body: string | null
  labels: { name: string }[]
  pull_request?: { html_url: string }
}
interface Comment {
  user: { login: string } | null
  created_at: string
  body: string
  author_association: string
}

export const parseGitHub = async (url: string, options?: ParseOptions): Promise<GitHubResult> => {
  if (ISSUE_PR_RE.test(url)) return parseIssue(url, options)
  if (FILE_RE.test(url)) return parseFile(url, options)
  throw new Error(`Not a GitHub issue/PR/file URL: ${url}`)
}

const parseIssue = async (url: string, options?: ParseOptions): Promise<GitHubResult> => {
  const match = url.match(ISSUE_PR_RE)!
  const [, owner, repo, type, number] = match
  const api = `https://api.github.com/repos/${owner}/${repo}`
  const headers = ghHeaders(options?.githubToken)
  const signal = mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal)

  const [issueRes, comments] = await Promise.all([
    fetch(`${api}/issues/${number}`, { headers, signal }),
    fetchAllComments(`${api}/issues/${number}/comments`, headers, options),
  ])

  if (!issueRes.ok) {
    if (issueRes.status === 404) throw new Error("Issue/PR not found")
    if (issueRes.status === 403) throw new Error("GitHub API rate limit exceeded")
    throw new Error(`GitHub API error: ${issueRes.status}`)
  }

  const issue = (await issueRes.json()) as Issue

  const isPR = !!issue.pull_request || type === "pull"
  const kind = isPR ? "PR" : "Issue"
  const author = issue.user?.login ?? "unknown"
  const labels = issue.labels.map((l) => l.name)

  const lines: string[] = [
    `# ${issue.title} #${issue.number}`,
    "",
    [
      `**${kind}** by **${author}**`,
      `**Created:** ${issue.created_at.split("T")[0]}`,
      `**State:** ${issue.state}`,
      ...(labels.length > 0 ? [`**Labels:** ${labels.join(", ")}`] : []),
    ].join(" · "),
    "",
    "---",
    "",
  ]

  if (issue.body) {
    lines.push(issue.body.trim(), "")
  }

  if (comments.length > 0) {
    lines.push("---", "", `## Comments (${comments.length})`, "")
    for (const c of comments) {
      const badge = ROLE_BADGES[c.author_association] ?? ""
      lines.push(`### ${c.user?.login ?? "unknown"}${badge} · ${c.created_at.split("T")[0]}`, "")
      if (c.body) lines.push(c.body.trim(), "")
    }
  }

  const content = lines.join("\n")
  const wc = countWords(content)

  return {
    type: "github",
    title: `${issue.title} #${issue.number}`,
    author,
    content,
    description: (issue.body ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
    domain: "github.com",
    siteName: `GitHub - ${owner}/${repo}`,
    published: issue.created_at,
    wordCount: wc,
    readTime: estimateReadTime(wc, options?.wordsPerMinute),
  }
}

const parseFile = async (url: string, options?: ParseOptions): Promise<GitHubResult> => {
  const match = url.match(FILE_RE)!
  const [, owner, repo, rest] = match
  const slashIdx = rest!.indexOf("/")
  const ref = slashIdx !== -1 ? rest!.slice(0, slashIdx) : rest!
  const filePath = slashIdx !== -1 ? rest!.slice(slashIdx + 1) : ""
  const filename = filePath.split("/").pop() ?? filePath ?? "file"

  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`
  const res = await fetch(rawUrl, {
    headers: ghHeaders(options?.githubToken),
    signal: mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal),
  })

  if (!res.ok) {
    if (res.status === 404) throw new Error(`File not found: ${filePath}`)
    throw new Error(`GitHub raw fetch error: ${res.status}`)
  }

  const contentType = res.headers.get("content-type") ?? ""
  if (
    !contentType.includes("text/") &&
    !contentType.includes("application/json") &&
    !contentType.includes("application/xml")
  ) {
    return fileResult(owner!, repo!, filename, `Binary file: ${filename} (${contentType})`, 0, options?.wordsPerMinute)
  }

  const text = await res.text()
  const lang = detectLang(filename)
  const noFence = lang === "markdown" || lang === "md" || (lang === "" && filename.endsWith(".txt"))
  const content = noFence ? text : "```" + lang + "\n" + text + "\n```"

  return fileResult(owner!, repo!, filename, content, countWords(text), options?.wordsPerMinute)
}

const fileResult = (
  owner: string,
  repo: string,
  filename: string,
  content: string,
  wc: number,
  wpm?: number,
): GitHubResult => ({
  type: "github",
  title: `${filename} - ${owner}/${repo}`,
  author: "",
  content,
  description: content.replace(/\s+/g, " ").trim().slice(0, 140),
  domain: "github.com",
  siteName: `GitHub - ${owner}/${repo}`,
  published: null,
  wordCount: wc,
  readTime: estimateReadTime(wc, wpm),
})

const ROLE_BADGES: Record<string, string> = {
  OWNER: " (Owner)",
  MEMBER: " (Member)",
  COLLABORATOR: " (Collaborator)",
  CONTRIBUTOR: " (Contributor)",
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  dart: "dart",
  lua: "lua",
  zig: "zig",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  dockerfile: "dockerfile",
  makefile: "makefile",
}

const detectLang = (filename: string): string => {
  const lower = filename.toLowerCase()
  if (lower === "dockerfile" || lower === "makefile") return lower
  const ext = lower.match(/\.(\w+)$/)?.[1] ?? ""
  return LANG_MAP[ext] ?? ext
}

// GitHub paginates comments at 100/page via `Link: rel="next"`.
// We cap pages to avoid runaway loops on issues with thousands of comments.
const MAX_COMMENT_PAGES = 10

const fetchAllComments = async (
  baseUrl: string,
  headers: Record<string, string>,
  options?: ParseOptions,
): Promise<Comment[]> => {
  const collected: Comment[] = []
  let nextUrl: string | null = `${baseUrl}?per_page=100`
  let pages = 0

  while (nextUrl && pages < MAX_COMMENT_PAGES) {
    const res: Response = await fetch(nextUrl, {
      headers,
      signal: mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal),
    })
    if (!res.ok) break
    const page = (await res.json()) as Comment[]
    collected.push(...page)
    pages++
    nextUrl = parseNextLink(res.headers.get("link"))
  }

  return collected
}

const parseNextLink = (link: string | null): string | null => {
  if (!link) return null
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (match) return match[1] ?? null
  }
  return null
}

const ghHeaders = (overrideToken?: string): Record<string, string> => {
  const headers: Record<string, string> = { "Accept": "application/vnd.github.v3+json", "User-Agent": "rdrr/1.0" }
  const token = overrideToken ?? process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}
