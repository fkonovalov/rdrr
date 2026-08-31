const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"])

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"])

// Paths that look like `/USER` but are actually platform routes, not profiles.
const X_RESERVED_HANDLES = new Set([
  "i",
  "home",
  "explore",
  "notifications",
  "messages",
  "search",
  "compose",
  "settings",
  "login",
  "signup",
  "logout",
  "about",
  "tos",
  "privacy",
  "intent",
  "share",
  "hashtag",
  "jobs",
])

const X_PROFILE_HANDLE = /^\/([A-Za-z0-9_]{1,15})\/?$/
const X_STATUS_BY_HANDLE = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/
const X_STATUS_BY_ID = /^\/i\/status\/(\d+)\/?$/

const GITHUB_ISSUE_PR = /github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+/
const GITHUB_FILE = /github\.com\/[^/]+\/[^/]+\/blob\/.+/
const GITHUB_DISCUSSION = /github\.com\/[^/]+\/[^/]+\/discussions\/\d+/
export type UrlType =
  | "youtube"
  | "github-issue"
  | "github-discussion"
  | "github-file"
  | "stackoverflow"
  | "npm"
  | "x-profile"
  | "x-status"
  | "webpage"

export const detectUrlType = (url: string): UrlType => {
  if (isYouTube(url)) return "youtube"
  if (GITHUB_ISSUE_PR.test(url)) return "github-issue"
  if (GITHUB_DISCUSSION.test(url)) return "github-discussion"
  if (GITHUB_FILE.test(url)) return "github-file"
  if (isStackOverflowQuestion(url)) return "stackoverflow"
  if (isNpmPackage(url)) return "npm"
  if (isXStatus(url)) return "x-status"
  if (isXProfile(url)) return "x-profile"
  return "webpage"
}

interface XStatusRef {
  handle: string | null
  id: string
}

export const extractXStatus = (url: string): XStatusRef | null => {
  try {
    const u = new URL(url)
    if (!X_HOSTS.has(u.hostname)) return null

    const byId = u.pathname.match(X_STATUS_BY_ID)
    if (byId?.[1]) return { handle: null, id: byId[1] }

    const byHandle = u.pathname.match(X_STATUS_BY_HANDLE)
    if (!byHandle?.[2]) return null
    const handle = byHandle[1] ?? ""
    if (X_RESERVED_HANDLES.has(handle.toLowerCase())) return null
    return { handle, id: byHandle[2] }
  } catch {
    return null
  }
}

const isXStatus = (url: string): boolean => extractXStatus(url) !== null

export const extractXHandle = (url: string): string | null => {
  try {
    const u = new URL(url)
    if (!X_HOSTS.has(u.hostname)) return null
    const match = u.pathname.match(X_PROFILE_HANDLE)
    if (!match?.[1]) return null
    const handle = match[1]
    if (X_RESERVED_HANDLES.has(handle.toLowerCase())) return null
    return handle
  } catch {
    return null
  }
}

const isXProfile = (url: string): boolean => extractXHandle(url) !== null

const isYouTube = (url: string): boolean => {
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

const SO_HOSTS = new Set(["stackoverflow.com", "www.stackoverflow.com"])
const SO_QUESTION = /^\/(?:questions|q)\/(\d+)/
const SO_ANSWER = /^\/a\/(\d+)/

export interface StackOverflowRef {
  kind: "question" | "answer"
  id: string
}

export const extractStackOverflowRef = (url: string): StackOverflowRef | null => {
  try {
    const u = new URL(url)
    if (!SO_HOSTS.has(u.hostname)) return null
    const question = u.pathname.match(SO_QUESTION)?.[1]
    if (question) return { kind: "question", id: question }
    const answer = u.pathname.match(SO_ANSWER)?.[1]
    if (answer) return { kind: "answer", id: answer }
    return null
  } catch {
    return null
  }
}

const isStackOverflowQuestion = (url: string): boolean => extractStackOverflowRef(url) !== null

const NPM_HOSTS = new Set(["npmjs.com", "www.npmjs.com", "npmjs.org", "www.npmjs.org"])
// Legacy unscoped names may contain uppercase (JSONStream) and names may
// start with "-" (the package `-` exists); leading "." and "_" are banned by
// npm. Tight enough to reject traversal/encodings before the registry URL.
const NPM_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[A-Za-z0-9~-][A-Za-z0-9._~-]*$/

export interface NpmPackageRef {
  name: string
  version: string | null
}

export const extractNpmPackage = (url: string): NpmPackageRef | null => {
  try {
    const u = new URL(url)
    if (!NPM_HOSTS.has(u.hostname)) return null
    const match = u.pathname.match(/^\/package\/((?:@[^/]+\/)?[^/]+)(?:\/v\/([^/]+))?\/?$/)
    if (!match?.[1]) return null
    const name = decodeURIComponent(match[1])
    if (!NPM_NAME.test(name)) return null
    return { name, version: match[2] ? decodeURIComponent(match[2]) : null }
  } catch {
    return null
  }
}

const isNpmPackage = (url: string): boolean => extractNpmPackage(url) !== null

export const isValidUrl = (url: string): boolean => {
  try {
    const protocol = new URL(url).protocol
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export const normalizeUrl = (url: string): string => {
  try {
    const u = new URL(url)
    u.hash = ""
    if (u.protocol === "http:") u.protocol = "https:"
    const normalized = u.toString()
    // Preserve the canonical trailing slash on the root path (`https://x/`),
    // strip elsewhere (`https://x/foo/` -> `https://x/foo`).
    if (u.pathname === "/") return normalized
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
  } catch {
    return url
  }
}

export const extractVideoId = (url: string): string | null => {
  try {
    const u = new URL(url)

    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null

    const v = u.searchParams.get("v")
    if (v) return v

    const embed = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/)
    if (embed?.[1]) return embed[1]

    const shorts = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/)
    if (shorts?.[1]) return shorts[1]

    return null
  } catch {
    return null
  }
}
