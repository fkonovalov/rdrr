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

const GITHUB_ISSUE_PR = /github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+/
const GITHUB_FILE = /github\.com\/[^/]+\/[^/]+\/blob\/.+/
export type UrlType = "youtube" | "github-issue" | "github-file" | "pdf" | "x-profile" | "webpage"

export const detectUrlType = (url: string): UrlType => {
  if (isYouTube(url)) return "youtube"
  if (GITHUB_ISSUE_PR.test(url)) return "github-issue"
  if (GITHUB_FILE.test(url)) return "github-file"
  if (isPdf(url)) return "pdf"
  if (isXProfile(url)) return "x-profile"
  return "webpage"
}

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

const isPdf = (url: string): boolean => {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf")
  } catch {
    return false
  }
}

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
    let normalized = u.toString()
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1)
    return normalized
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
