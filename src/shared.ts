/**
 * Merge a per-request timeout with an optional user-supplied AbortSignal.
 * Returns a single signal that aborts as soon as either fires.
 */
export const mergeSignals = (timeoutMs: number, external?: AbortSignal): AbortSignal => {
  const timeout = AbortSignal.timeout(timeoutMs)
  return external ? AbortSignal.any([timeout, external]) : timeout
}

export const safeDomain = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

// Any scheme-like prefix (`foo://`, `ftp:`, `mailto:`, etc.) — if one is already
// present we must leave it alone so `isValidUrl` can reject non-HTTP schemes
// cleanly instead of producing a Frankenstein `https://ftp://...`.
const SCHEME_PREFIX = /^[a-z][a-z0-9+\-.]*:/i

export const ensureProtocol = (url: string): string => (SCHEME_PREFIX.test(url) ? url : `https://${url}`)

export const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

const DEFAULT_WORDS_PER_MINUTE = 200

export const estimateReadTime = (wordCount: number, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE): string => {
  const wpm = wordsPerMinute > 0 ? wordsPerMinute : DEFAULT_WORDS_PER_MINUTE
  const minutes = Math.max(1, Math.ceil(wordCount / wpm))
  return `${minutes} min`
}

export const countWords = (text: string): number => {
  if (!text) return 0

  let cjkCount = 0
  let wordCount = 0
  let inWord = false

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)

    // CJK character ranges (BMP only — Extension B+ are surrogate pairs, rare in practice)
    if (
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
      (code >= 0xac00 && code <= 0xd7af) // Korean Hangul
    ) {
      cjkCount++
      inWord = false
    } else if (code <= 32) {
      inWord = false
    } else if (!inWord) {
      wordCount++
      inWord = true
    }
  }

  return cjkCount + wordCount
}

const pad = (n: number): string => n.toString().padStart(2, "0")
