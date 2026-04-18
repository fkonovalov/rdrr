import { fetchFromFxtwitter } from "./fetch-fxtwitter"
import { fetchFromSyndication } from "./fetch-syndication"
import type { FetchOutcome } from "./types"

interface FetchStatusOptions {
  signal?: AbortSignal
  timeoutMs?: number
  userAgent?: string
}

/**
 * Resolve a single tweet via an ordered list of strategies; first success wins.
 *
 * Strategy ordering rationale:
 *   1. fxtwitter — richer payload (article mode, raw facets, full quotes) and
 *      survives Twitter rate limits via a separate infrastructure.
 *   2. syndication — Twitter's own `cdn.syndication.twimg.com` endpoint used by
 *      the embed widget. Thinner data but almost always reachable, so it's the
 *      safety net when fxtwitter is down or rate-limited.
 */
export const fetchStatus = async (
  handle: string | null,
  id: string,
  opts: FetchStatusOptions = {},
): Promise<FetchOutcome> => {
  const errors: string[] = []

  try {
    const status = await fetchFromFxtwitter(handle, id, opts)
    return { status, source: "fxtwitter" }
  } catch (err) {
    errors.push(`fxtwitter: ${(err as Error).message}`)
  }

  try {
    const status = await fetchFromSyndication(id, opts)
    return { status, source: "syndication" }
  } catch (err) {
    errors.push(`syndication: ${(err as Error).message}`)
  }

  throw new Error(`Could not fetch tweet ${id} — ${errors.join("; ")}`)
}
