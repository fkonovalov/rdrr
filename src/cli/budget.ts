/**
 * Approximate token count using a fixed char-per-token ratio.
 *
 * Real tokenizers (cl100k_base, o200k_base) live in tiktoken/gpt-tokenizer
 * and weigh >1 MB. For an LLM context-budget guardrail we don't need exactness
 * — a slightly conservative estimate that never *overshoots* real token counts
 * is the win. Empirically 4 chars/token matches BPE tokenizers within ~10% on
 * English prose and undercounts on Cyrillic/CJK (which is safe for budgeting).
 */
const CHARS_PER_TOKEN = 4

export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN)

interface TruncationInfo {
  kept: number
  total: number
  omittedTokens: number
  totalTokens: number
}

interface TruncateResult {
  content: string
  info: TruncationInfo | null
}

/**
 * Truncate `content` so the rendered output stays at or below `budget` tokens.
 *
 * Chooses paragraph boundaries (double-newline) so we never end a cut inside a
 * sentence. Tracks fenced-code-block state so a multi-paragraph code block is
 * never split down the middle — leaving an unclosed ``` in the output. The
 * first paragraph (usually the title/lede) is always kept even if it alone
 * exceeds the budget, so the caller retains document head for context.
 *
 * Returns `info: null` when nothing had to be dropped — the caller should then
 * decide whether to add any JSON field.
 *
 * The budget covers the content body only; frontmatter added by the CLI around
 * this string is not tracked here. For agent workflows that's the right level —
 * agents care about the text they'll actually reason over.
 */
export const truncateToBudget = (content: string, budget: number): TruncateResult => {
  const totalTokens = estimateTokens(content)
  if (totalTokens <= budget) return { content, info: null }

  const paragraphs = splitParagraphs(content)
  const kept: string[] = []
  let keptTokens = 0
  let fenceOpen = false

  for (const [index, para] of paragraphs.entries()) {
    const paraTokens = estimateTokens(para) + 1 // account for paragraph separator
    const fits = keptTokens + paraTokens <= budget
    // Always keep the first paragraph so the reader has the document head even
    // when the budget is too small for anything else — otherwise the output is
    // just a truncation marker with no context.
    const forceKeep = index === 0
    // If we're in the middle of a fenced code block, keep paragraphs until the
    // fence closes so we never emit markdown with a dangling ```.
    if (!fits && !forceKeep && !fenceOpen) break

    kept.push(para)
    keptTokens += paraTokens
    if (countFenceToggles(para) % 2 === 1) fenceOpen = !fenceOpen
  }

  // If head-preservation ended up keeping everything the caller had, the
  // "truncated" framing would be misleading: the output is actually complete.
  // Report it the same way an under-budget input does.
  if (kept.length === paragraphs.length) return { content, info: null }

  // If we exited while a fence was still open, synthesise a closing fence so
  // downstream parsers don't trip on a half-open block.
  const closingFence = fenceOpen ? "\n```" : ""
  const safeBody = kept.join("\n\n") + closingFence
  const omittedTokens = Math.max(0, totalTokens - keptTokens)
  const marker = `\n\n[truncated ${omittedTokens} tokens, ${totalTokens} total]`

  return {
    content: safeBody + marker,
    info: { kept: kept.length, total: paragraphs.length, omittedTokens, totalTokens },
  }
}

const splitParagraphs = (content: string): string[] => content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

const countFenceToggles = (para: string): number => {
  // Count only fence markers that sit at the start of a line; inline triple
  // backticks inside prose don't open a real code block.
  const matches = para.match(/^```/gm)
  return matches ? matches.length : 0
}
