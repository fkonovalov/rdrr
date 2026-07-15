import { countWords, estimateReadTime, mergeSignals } from "@shared"
import type { GitHubResult, ParseOptions } from "../types"

const DEFAULT_TIMEOUT_MS = 15000

const ISSUE_PR_RE = /github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/
const FILE_RE = /github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)/
const DISCUSSION_RE = /github\.com\/([^/]+)\/([^/]+)\/discussions\/(\d+)/

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
  /** Absent on discussion comments. */
  author_association?: string
}

export const parseGitHub = async (url: string, options?: ParseOptions): Promise<GitHubResult> => {
  if (ISSUE_PR_RE.test(url)) return parseIssue(url, options)
  if (DISCUSSION_RE.test(url)) return parseDiscussion(url, options)
  if (FILE_RE.test(url)) return parseFile(url, options)
  throw new Error(`Not a GitHub issue/PR/discussion/file URL: ${url}`)
}

/**
 * Convert a non-ok GitHub API response into an actionable error. A 403 is only
 * a rate limit when the quota is actually exhausted; otherwise it means the
 * resource is private or the token lacks access.
 */
const ghApiError = (res: Response, what: string): Error => {
  if (res.status === 404) return new Error(`${what} not found`)
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset"))
      const resetsAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null
      return new Error(
        `GitHub API rate limit exceeded${resetsAt ? ` (resets at ${resetsAt})` : ""}. ` +
          "Set $GITHUB_TOKEN or pass --github-token to raise the limit from 60 to 5000 requests/hour.",
      )
    }
    // 429 and retry-after signal GitHub's secondary (abuse) rate limit, which
    // does not zero out x-ratelimit-remaining.
    const retryAfter = res.headers.get("retry-after")
    if (res.status === 429 || retryAfter) {
      return new Error(
        `GitHub API secondary rate limit (${res.status}). ` +
          `Retry ${retryAfter ? `after ${retryAfter}s` : "later"}, or set $GITHUB_TOKEN to raise the limits.`,
      )
    }
    return new Error(
      `GitHub API access forbidden (403) for ${what}: private repository, blocked token, or rate limiting`,
    )
  }
  return new Error(`GitHub API error: ${res.status}`)
}

const parseIssue = async (url: string, options?: ParseOptions): Promise<GitHubResult> => {
  const match = url.match(ISSUE_PR_RE)!
  const [, owner, repo, type, number] = match
  const api = `https://api.github.com/repos/${owner}/${repo}`
  const headers = ghHeaders(options?.githubToken)
  const signal = mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal)

  const [issueRes, { comments, truncated }] = await Promise.all([
    fetch(`${api}/issues/${number}`, { headers, signal }),
    fetchAllComments(`${api}/issues/${number}/comments`, headers, options),
  ])

  if (!issueRes.ok) throw ghApiError(issueRes, "Issue/PR")

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

  appendComments(lines, comments, truncated)

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

const appendComments = (lines: string[], comments: Comment[], truncated: boolean): void => {
  if (comments.length === 0 && !truncated) return
  lines.push("---", "", `## Comments (${comments.length}${truncated ? "+, truncated" : ""})`, "")
  for (const c of comments) {
    const badge = ROLE_BADGES[c.author_association ?? ""] ?? ""
    lines.push(`### ${c.user?.login ?? "unknown"}${badge} · ${c.created_at.split("T")[0]}`, "")
    if (c.body) lines.push(c.body.trim(), "")
  }
  if (truncated) {
    lines.push("_Note: comments could not be fetched completely; the list above is incomplete or missing._", "")
  }
}

interface Discussion {
  title: string
  number: number
  state: string
  user: { login: string } | null
  created_at: string
  body: string | null
  category?: { name: string } | null
}

const parseDiscussion = async (url: string, options?: ParseOptions): Promise<GitHubResult> => {
  const match = url.match(DISCUSSION_RE)!
  const [, owner, repo, number] = match
  const api = `https://api.github.com/repos/${owner}/${repo}/discussions/${number}`
  const headers = ghHeaders(options?.githubToken)
  const signal = mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal)

  const [discussionRes, { comments, truncated }] = await Promise.all([
    fetch(api, { headers, signal }),
    fetchAllComments(`${api}/comments`, headers, options),
  ])

  if (!discussionRes.ok) throw ghApiError(discussionRes, "Discussion")

  const discussion = (await discussionRes.json()) as Discussion
  const author = discussion.user?.login ?? "unknown"

  const lines: string[] = [
    `# ${discussion.title} #${discussion.number}`,
    "",
    [
      `**Discussion** by **${author}**`,
      `**Created:** ${discussion.created_at.split("T")[0]}`,
      `**State:** ${discussion.state}`,
      ...(discussion.category?.name ? [`**Category:** ${discussion.category.name}`] : []),
    ].join(" · "),
    "",
    "---",
    "",
  ]

  if (discussion.body) {
    lines.push(discussion.body.trim(), "")
  }

  appendComments(lines, comments, truncated)

  const content = lines.join("\n")
  const wc = countWords(content)

  return {
    type: "github",
    title: `${discussion.title} #${discussion.number}`,
    author,
    content,
    description: (discussion.body ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
    domain: "github.com",
    siteName: `GitHub - ${owner}/${repo}`,
    published: discussion.created_at,
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
    throw ghApiError(res, `File ${filePath}`)
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

interface CommentsPage {
  comments: Comment[]
  /** True when a page failed to load or the page cap was hit: the list is incomplete. */
  truncated: boolean
}

const fetchAllComments = async (
  baseUrl: string,
  headers: Record<string, string>,
  options?: ParseOptions,
): Promise<CommentsPage> => {
  const collected: Comment[] = []
  let nextUrl: string | null = `${baseUrl}?per_page=100`
  let pages = 0

  while (nextUrl && pages < MAX_COMMENT_PAGES) {
    const res: Response = await fetch(nextUrl, {
      headers,
      signal: mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal),
    })
    if (!res.ok) return { comments: collected, truncated: true }
    const page = (await res.json()) as Comment[]
    collected.push(...page)
    pages++
    nextUrl = parseNextLink(res.headers.get("link"))
  }

  return { comments: collected, truncated: nextUrl !== null }
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
