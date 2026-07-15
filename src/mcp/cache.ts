interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface CacheOptions {
  /** Max stored entries before least-recently-used eviction. Default 100. */
  maxEntries?: number
  /** Entry lifetime in milliseconds. Default 5 minutes. */
  ttlMs?: number
  /** Clock override for tests. */
  now?: () => number
}

export interface AsyncCache<T> {
  /** Return the cached value for `key`, or run `compute` (single-flight) and cache its result. */
  get: (key: string, compute: () => Promise<T>, options?: { force?: boolean }) => Promise<T>
  size: () => number
}

const DEFAULT_MAX_ENTRIES = 100
const DEFAULT_TTL_MS = 5 * 60 * 1000

/**
 * In-memory async cache: LRU eviction, TTL expiry, and single-flight
 * deduplication (concurrent calls for the same key share one compute).
 * Failed computes are never cached, so transient errors retry naturally.
 */
export const createAsyncCache = <T>(options: CacheOptions = {}): AsyncCache<T> => {
  const { maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS, now = Date.now } = options
  const entries = new Map<string, CacheEntry<T>>()
  const inflight = new Map<string, Promise<T>>()

  const readFresh = (key: string): CacheEntry<T> | undefined => {
    const entry = entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= now()) {
      entries.delete(key)
      return undefined
    }
    // Re-insert on hit: Map iteration order doubles as the LRU order.
    entries.delete(key)
    entries.set(key, entry)
    return entry
  }

  const store = (key: string, value: T): void => {
    entries.delete(key)
    entries.set(key, { value, expiresAt: now() + ttlMs })
    if (entries.size > maxEntries) {
      const oldest = entries.keys().next().value
      if (oldest !== undefined) entries.delete(oldest)
    }
  }

  const get = async (key: string, compute: () => Promise<T>, opts: { force?: boolean } = {}): Promise<T> => {
    if (!opts.force) {
      const entry = readFresh(key)
      if (entry) return entry.value
      const pending = inflight.get(key)
      if (pending) return pending
    }

    const promise = compute()
      .then((value) => {
        store(key, value)
        return value
      })
      .finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key)
      })
    inflight.set(key, promise)
    return promise
  }

  return { get, size: () => entries.size }
}
