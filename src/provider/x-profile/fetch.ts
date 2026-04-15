import type { FxProfileResponse, FxStatusesResponse } from "./types"

const BASE = "https://api.fxtwitter.com"
const USER_AGENT = "Mozilla/5.0 (compatible; rdrr/1.0; +https://rdrr.app)"
const REQUEST_TIMEOUT_MS = 10_000

export const fetchProfile = async (handle: string): Promise<FxProfileResponse | null> => {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(handle)}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const json = (await res.json()) as FxProfileResponse
    if (json.code !== 200 || !json.user) return null
    return json
  } catch {
    return null
  }
}

interface FetchStatusesResult {
  statuses: FxStatusesResponse["results"]
  pagesFetched: number
}

export const fetchStatuses = async (
  handle: string,
  targetCount: number,
  maxPages: number,
): Promise<FetchStatusesResult> => {
  const encoded = encodeURIComponent(handle)
  let cursor: string | undefined
  const accumulated: FxStatusesResponse["results"] = []
  let pages = 0

  while (accumulated.length < targetCount && pages < maxPages) {
    const url = cursor
      ? `${BASE}/2/profile/${encoded}/statuses?cursor=${encodeURIComponent(cursor)}`
      : `${BASE}/2/profile/${encoded}/statuses`

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      if (pages === 0) {
        if (res.status === 404) throw new Error(`X user @${handle} not found or timeline unavailable`)
        throw new Error(`FxTwitter API error: ${res.status} ${res.statusText}`)
      }
      break
    }

    const json = (await res.json()) as FxStatusesResponse
    pages++

    if (!Array.isArray(json.results) || json.results.length === 0) break

    accumulated.push(...json.results)

    const nextCursor = json.cursor?.bottom
    if (!nextCursor) break
    cursor = nextCursor
  }

  if (accumulated.length === 0) throw new Error(`No public posts available for @${handle}`)

  return { statuses: accumulated, pagesFetched: pages }
}
