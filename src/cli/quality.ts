import type { ParseResult } from "../types"

interface QualitySignals {
  textDensity: number
  linkRatio: number
  paragraphCount: number
  hasTitle: boolean
  hasByline: boolean
  contentLength: number
  boilerplateRatio: number
}

interface QualityReport {
  score: number
  signals: QualitySignals
  verdict: "good" | "partial" | "poor"
}

/**
 * Boilerplate phrases that signal navigation chrome, consent walls, or marketing
 * ribbons rather than the article the caller asked for. A high concentration of
 * these in extracted "content" tells the caller the extractor probably missed
 * the real article body. Covers the biggest consent-banner / paywall surfaces
 * in English, Russian, German, French, Spanish — the same copy tends to repeat
 * across CMS themes, so exact matches catch most cases without heuristics.
 */
const BOILERPLATE_PHRASES = [
  // English
  /\baccept (all )?cookies\b/i,
  /\bmanage preferences\b/i,
  /\bsign in\b/i,
  /\bsubscribe (now|to continue|for (full|unlimited))\b/i,
  /\bcreate (an )?account\b/i,
  /\bby continuing to use\b/i,
  /\bprivacy policy\b/i,
  /\bterms of service\b/i,
  // Russian
  /принять (все )?(cookie|куки)/i,
  /политика конфиденциальности/i,
  /условия использования/i,
  /подписаться/i,
  /войти в аккаунт/i,
  // German
  /alle cookies akzeptieren/i,
  /datenschutz(erkl[aä]rung| policy)/i,
  /nutzungsbedingungen/i,
  // French
  /accepter (tous les )?cookies/i,
  /politique de confidentialit[eé]/i,
  /conditions d[’']utilisation/i,
  // Spanish
  /aceptar (todas las )?cookies/i,
  /pol[ií]tica de privacidad/i,
  /t[eé]rminos (del servicio|de uso)/i,
]

const PAYWALL_MARKERS = [
  /\bpaywall\b/i,
  /subscribe to (read|continue|unlock)/i,
  /unlock (the )?full article/i,
  /только для подписчиков/i, // RU
  /nur für abonnenten/i, // DE
  /r[eé]serv[eé] aux abonn[eé]s/i, // FR
  /solo para suscriptores/i, // ES
]
const CAPTCHA_MARKERS = [/please verify you are human/i, /cloudflare.*checking your browser/i]

// Scoring thresholds. Tuned empirically against a spread of article pages;
// adjust in one place rather than threading literals through the scoring body.
const BASE_SCORE = 50
const LONG_ARTICLE_CHARS = 2000
const MEDIUM_ARTICLE_CHARS = 500
const LONG_ARTICLE_BONUS = 20
const MEDIUM_ARTICLE_BONUS = 10
const DENSE_PARAGRAPHS = 6
const SPARSE_PARAGRAPHS = 2
const DENSE_PARAGRAPH_BONUS = 10
const SPARSE_PARAGRAPH_BONUS = 5
const METADATA_BONUS = 5
const LOW_LINK_RATIO = 0.25
const HIGH_LINK_RATIO = 0.5
const LINK_BONUS = 10
const LINK_PENALTY = 10
const BOILERPLATE_WEIGHT = 40
const PAYWALL_SCORE_CAP = 30
const GOOD_VERDICT_THRESHOLD = 70
const PARTIAL_VERDICT_THRESHOLD = 40

// Content shorter than this is treated as "essentially empty": the page either
// failed to extract, was a thin stub, or was redirected away. We skip the
// positive bonuses (title/byline/links) so the score reflects the truth
// instead of being propped up by metadata we shouldn't trust.
const EMPTY_CONTENT_CHARS = 20

export const computeQuality = (result: ParseResult): QualityReport => {
  const content = result.content
  const signals = computeSignals(result, content)

  // Essentially-empty content is "poor" outright — no amount of metadata or
  // link-ratio gaming rescues a page with no body.
  if (signals.contentLength < EMPTY_CONTENT_CHARS) {
    return { score: 0, signals, verdict: "poor" }
  }

  let score = BASE_SCORE
  if (signals.contentLength > LONG_ARTICLE_CHARS) score += LONG_ARTICLE_BONUS
  else if (signals.contentLength > MEDIUM_ARTICLE_CHARS) score += MEDIUM_ARTICLE_BONUS
  if (signals.paragraphCount > DENSE_PARAGRAPHS) score += DENSE_PARAGRAPH_BONUS
  else if (signals.paragraphCount > SPARSE_PARAGRAPHS) score += SPARSE_PARAGRAPH_BONUS
  if (signals.hasTitle) score += METADATA_BONUS
  if (signals.hasByline) score += METADATA_BONUS
  if (signals.linkRatio < LOW_LINK_RATIO) score += LINK_BONUS
  else if (signals.linkRatio > HIGH_LINK_RATIO) score -= LINK_PENALTY
  score -= Math.round(signals.boilerplateRatio * BOILERPLATE_WEIGHT)
  if (hasMatch(content, PAYWALL_MARKERS) || hasMatch(content, CAPTCHA_MARKERS)) {
    score = Math.min(score, PAYWALL_SCORE_CAP)
  }

  score = Math.max(0, Math.min(100, score))
  const verdict: QualityReport["verdict"] =
    score >= GOOD_VERDICT_THRESHOLD ? "good" : score >= PARTIAL_VERDICT_THRESHOLD ? "partial" : "poor"
  return { score, signals, verdict }
}

const computeSignals = (result: ParseResult, content: string): QualitySignals => {
  const plainText = stripMarkdown(content)
  const linkTextLength = countLinkTextLength(content)
  const contentLength = plainText.length
  const boilerplateRatio = computeBoilerplateRatio(content)
  return {
    textDensity: content.length > 0 ? plainText.length / content.length : 0,
    linkRatio: plainText.length > 0 ? Math.min(1, linkTextLength / plainText.length) : 0,
    paragraphCount: content.split(/\n{2,}/).filter((p) => p.trim().length > 0).length,
    hasTitle: Boolean(result.title?.trim()),
    hasByline: Boolean(result.author?.trim()),
    contentLength,
    boilerplateRatio,
  }
}

const stripMarkdown = (md: string): string =>
  md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const countLinkTextLength = (md: string): number => {
  let total = 0
  for (const m of md.matchAll(/\[([^\]]+)\]\([^)]*\)/g)) total += m[1]!.length
  return total
}

// Boilerplate signal caps at `SATURATION_HITS` matches — beyond that the
// density is already high enough to flag the page and we don't want the
// ratio to dilute when more language-specific phrases are added to the list.
const BOILERPLATE_SATURATION_HITS = 4

const computeBoilerplateRatio = (content: string): number => {
  if (!content.trim()) return 0
  let hits = 0
  for (const pattern of BOILERPLATE_PHRASES) if (pattern.test(content)) hits++
  return Math.min(hits, BOILERPLATE_SATURATION_HITS) / BOILERPLATE_SATURATION_HITS
}

const hasMatch = (content: string, patterns: RegExp[]): boolean => patterns.some((p) => p.test(content))
