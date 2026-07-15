import { estimateTokens, truncateToBudget } from "../cli/budget"

export interface PageInfo {
  kept: number
  total: number
  nextStartIndex: number
  hint: string
}

export interface Page {
  body: string
  truncated?: PageInfo
}

/** Tokens of slack for the `[truncated ...]` marker appended by truncateToBudget. */
const MARKER_SLACK = 32
/** Mirrors the estimator ratio in cli/budget.ts. */
const CHARS_PER_TOKEN = 4

const hintFor = (nextStartIndex: number): string =>
  `Content truncated to fit the token budget. Call again with startIndex=${nextStartIndex} to continue reading.`

/**
 * Slice `content` from `startIndex`, then cut the slice down to `maxTokens`.
 * Prefers paragraph boundaries (via truncateToBudget) and reports the exact
 * character offset where the next page starts.
 */
export const paginate = (content: string, startIndex: number, maxTokens: number): Page => {
  const body = startIndex > 0 ? content.slice(startIndex) : content
  if (estimateTokens(body) <= maxTokens) return { body }

  const total = estimateTokens(content)
  const { content: cut, info } = truncateToBudget(body, maxTokens)

  // truncateToBudget always keeps the head paragraph (and whole fenced code
  // blocks), so its output can still exceed the budget -- e.g. one huge
  // paragraph. Fall back to a hard character cut to guarantee the cap.
  if (info === null || estimateTokens(cut) > maxTokens + MARKER_SLACK) {
    return hardCut(body, startIndex, maxTokens, total)
  }

  const nextStartIndex = startIndex + paragraphOffset(body, info.kept)
  return {
    body: cut,
    truncated: {
      kept: info.totalTokens - info.omittedTokens,
      total,
      nextStartIndex,
      hint: hintFor(nextStartIndex),
    },
  }
}

const hardCut = (body: string, startIndex: number, maxTokens: number, total: number): Page => {
  const keptChars = maxTokens * CHARS_PER_TOKEN
  const nextStartIndex = startIndex + keptChars
  return {
    body: `${body.slice(0, keptChars)}\n\n[truncated mid-paragraph at the token budget]`,
    truncated: { kept: maxTokens, total, nextStartIndex, hint: hintFor(nextStartIndex) },
  }
}

/**
 * Character offset in `body` where the first dropped paragraph starts.
 * Mirrors truncateToBudget's paragraph split: blank-line separated,
 * whitespace-only segments don't count.
 */
const paragraphOffset = (body: string, keptParagraphs: number): number => {
  let count = 0
  let segmentStart = 0
  for (const match of body.matchAll(/\n{2,}/g)) {
    const segment = body.slice(segmentStart, match.index)
    if (segment.trim().length > 0) {
      count++
      if (count === keptParagraphs) return match.index + match[0].length
    }
    segmentStart = match.index + match[0].length
  }
  return body.length
}
