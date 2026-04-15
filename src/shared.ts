export const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

export const estimateReadTime = (wordCount: number): string => {
  const minutes = Math.max(1, Math.ceil(wordCount / 200))
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
