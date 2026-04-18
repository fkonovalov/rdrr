import { countWords, safeDomain } from "@shared"
import type { ExtractOptions, ExtractResult } from "./types"
import { stripUnsafeElements, resolveRelativeUrls, countHtmlWords } from "./cleanup"
import { flattenShadowRoots, resolveStreamedContent, evaluateMediaQueries, applyMobileStyles } from "./compat"
import { HIDDEN_EXACT_SKIP_SELECTOR } from "./constants"
import { normaliseCallouts } from "./elements/callouts"
import { normaliseFootnotes } from "./elements/footnotes"
import { filterHiddenElements } from "./filters/hidden"
import { filterBySelectors, filterContentPatterns } from "./filters/patterns"
import { filterLowScoringBlocks } from "./filters/scoring"
import { filterSmallImages } from "./filters/small-images"
import { toMarkdown } from "./markdown"
import { type Metadata, extractMetadata } from "./metadata"
import { normaliseContent } from "./normalise"
import { extractSchemaOrg, getSchemaText, findElementBySchemaText, collectMetaTags } from "./schema"
import { findMainContent } from "./select"
import { findSiteExtractor, findAsyncSiteExtractor } from "./sites/registry"
import type { SiteExtractorResult } from "./sites/types"
import { serializeHTML } from "./utils/dom"

/**
 * Minimum word count a pass must hit before we accept it. Below this the
 * pipeline will retry with progressively looser filters and, as a last resort,
 * take the longest attempt it made.
 */
const MIN_ACCEPTABLE_WORDS = 50

export const extract = (doc: Document, options: ExtractOptions = {}): ExtractResult => {
  const url = options.url ?? ""
  const viaSite = runSyncSiteExtractor(doc, url, options)
  const raw = viaSite ?? runPipeline(doc, url, options)
  return finaliseMarkdown(raw, options, url)
}

export const extractAsync = async (doc: Document, options: ExtractOptions = {}): Promise<ExtractResult> => {
  const url = options.url ?? ""
  // Async site extractor short-circuits everything — an async site knows how
  // to talk to its own API and the sync pipeline has nothing to add.
  const asyncExtractor = findAsyncSiteExtractor(doc, url)
  if (asyncExtractor?.extractAsync) {
    const extracted = await asyncExtractor.extractAsync()
    return finaliseMarkdown(buildResultFromExtractor(extracted, collectMeta(doc), url), options, url)
  }

  // Otherwise run the sync engine, then patch in an async extractor's result
  // only if sync gave up. We pass `markdown: false` so the async fallback below
  // doesn't convert HTML that will be replaced wholesale.
  let result = extract(doc, { ...options, markdown: false })
  if (result.wordCount === 0 && asyncExtractor?.extractAsync) {
    const extracted = await asyncExtractor.extractAsync()
    result = mergeAsyncFallback(result, extracted)
  }
  return finaliseMarkdown(result, options, url)
}

/**
 * Try a sync site extractor (e.g. reddit, hackernews, github). Returns the
 * built result if one matched, or `null` to hand control to the readability
 * pipeline. Encapsulates both site-extractor modes (`contentSelector` asks
 * the engine to process a specific DOM subtree; `contentHtml` hands us a
 * pre-rendered body).
 */
const runSyncSiteExtractor = (doc: Document, url: string, options: ExtractOptions): ExtractResult | null => {
  if (!url) return null
  const siteExtractor = findSiteExtractor(doc, url)
  if (!siteExtractor) return null
  const extracted = siteExtractor.extract()

  if (extracted.contentSelector) {
    const pipelineResult = extractInternal(doc, url, {
      ...options,
      contentSelector: extracted.contentSelector,
      removeLowScoring: false,
      removeHiddenElements: false,
    })
    return mergeExtractorVariables(pipelineResult, extracted.variables)
  }
  if (extracted.contentHtml) {
    return buildResultFromExtractor(extracted, collectMeta(doc), url)
  }
  return null
}

/**
 * Full readability pipeline with up to three retries (progressive loosening of
 * filters) plus a schema.org rescue pass. Only entered when no site extractor
 * handled the page.
 */
const runPipeline = (doc: Document, url: string, options: ExtractOptions): ExtractResult => {
  const cache = getOrCreateCache(doc)
  const opts: InternalOptions = { ...options, _cache: cache }

  const attempts: ExtractResult[] = []
  const tryExtract = (retryOpts: InternalOptions): ExtractResult => {
    const r = extractInternal(doc, url, retryOpts)
    attempts.push(r)
    return r
  }

  let result = tryExtract(opts)
  if (result.wordCount < MIN_ACCEPTABLE_WORDS) result = retryWithHiddenIncluded(result, doc, opts, tryExtract)
  if (result.wordCount < MIN_ACCEPTABLE_WORDS) result = retryWithLowScoringKept(result, opts, tryExtract)
  if (result.wordCount < MIN_ACCEPTABLE_WORDS) result = bestOfAttempts(result, attempts)

  stripUnsafeElements(doc)

  return rescueFromSchemaOrg(result, doc, url, opts, cache.schemaOrg)
}

const retryWithHiddenIncluded = (
  current: ExtractResult,
  doc: Document,
  opts: InternalOptions,
  tryExtract: (o: InternalOptions) => ExtractResult,
): ExtractResult => {
  let result = current
  const retry = tryExtract({ ...opts, removeHiddenElements: false })
  if (retry.wordCount > result.wordCount * 2) result = retry

  // Target the largest visually-hidden subtree directly — some SPAs stash the
  // full article inside an aria-hidden wrapper while only a skeleton is visible.
  const hiddenSelector = findLargestHiddenContentSelector(doc)
  if (!hiddenSelector) return result

  const hiddenRetry = tryExtract({ ...opts, removeHiddenElements: false, contentSelector: hiddenSelector })
  const beatsByWords = hiddenRetry.wordCount > result.wordCount
  const similarWordsButTighter =
    hiddenRetry.wordCount > Math.max(20, result.wordCount * 0.7) && hiddenRetry.content.length < result.content.length
  return beatsByWords || similarWordsButTighter ? hiddenRetry : result
}

const retryWithLowScoringKept = (
  current: ExtractResult,
  opts: InternalOptions,
  tryExtract: (o: InternalOptions) => ExtractResult,
): ExtractResult => {
  const retry = tryExtract({ ...opts, removeLowScoring: false })
  return retry.wordCount > current.wordCount ? retry : current
}

/**
 * Safety net: when the pipeline has already given up, take the longest attempt
 * it made. Only runs when `current.wordCount < MIN_ACCEPTABLE_WORDS`, so the
 * happy path is untouched.
 */
const bestOfAttempts = (current: ExtractResult, attempts: ExtractResult[]): ExtractResult => {
  if (attempts.length <= 1) return current
  const best = attempts.reduce((a, b) => (b.wordCount > a.wordCount ? b : a))
  return best.wordCount > current.wordCount ? best : current
}

/**
 * If schema.org JSON-LD describes a substantially longer article body than the
 * pipeline extracted, reach for that element instead. Keeps us honest on SSR
 * sites where the rendered DOM hides most of the prose behind interactive widgets.
 */
const rescueFromSchemaOrg = (
  current: ExtractResult,
  doc: Document,
  url: string,
  opts: InternalOptions,
  schemaOrg: unknown[],
): ExtractResult => {
  const schemaText = getSchemaText(schemaOrg)
  if (!schemaText || countWords(schemaText) <= current.wordCount * 1.5) return current

  const bestMatch = doc.body ? findElementBySchemaText(doc.body, schemaText) : null
  if (bestMatch) {
    const selector = getSelector(bestMatch, doc)
    return extractInternal(doc, url, { ...opts, contentSelector: selector })
  }
  return { ...current, content: schemaText, wordCount: countWords(schemaText) }
}

/**
 * Merge an async-extractor result onto a (near-empty) sync result. Preserves
 * every field the async extractor left unset (e.g. `domain`, `language`) so
 * callers still see the metadata the sync pipeline gathered.
 */
const mergeAsyncFallback = (syncResult: ExtractResult, extracted: SiteExtractorResult): ExtractResult => ({
  ...syncResult,
  title: extracted.variables?.title ?? syncResult.title,
  author: extracted.variables?.author ?? syncResult.author,
  content: extracted.contentHtml,
  siteName: extracted.variables?.site ?? syncResult.siteName,
  published: extracted.variables?.published ?? syncResult.published,
  wordCount: countHtmlWords(extracted.contentHtml),
})

/**
 * Build a canonical `ExtractResult` out of a site-extractor payload and the
 * document metadata. Identical shape between sync and async code paths.
 */
const buildResultFromExtractor = (extracted: SiteExtractorResult, meta: Metadata, url: string): ExtractResult => ({
  title: extracted.variables?.title ?? meta.title,
  author: extracted.variables?.author ?? meta.author,
  content: extracted.contentHtml,
  description: extracted.variables?.description ?? meta.description,
  domain: meta.domain || (url ? safeDomain(url) : ""),
  siteName: extracted.variables?.site ?? meta.siteName,
  language: extracted.variables?.language ?? meta.language,
  dir: meta.dir,
  published: extracted.variables?.published ?? meta.published ?? null,
  wordCount: countHtmlWords(extracted.contentHtml),
})

const collectMeta = (doc: Document): Metadata => {
  const schemaOrg = extractSchemaOrg(doc)
  const metaTags = collectMetaTags(doc)
  return extractMetadata(doc, schemaOrg, metaTags)
}

/**
 * Convert `result.content` from HTML to markdown when the caller asked for it
 * via `options.markdown === true`. Preserves word count (computed from text, not
 * markup) and leaves HTML in place for every other caller so existing consumers
 * that do their own conversion downstream (e.g. provider/web.ts) aren't affected.
 */
const finaliseMarkdown = (result: ExtractResult, options: ExtractOptions, url: string): ExtractResult => {
  if (options.markdown !== true || !result.content) return result
  return { ...result, content: toMarkdown(result.content, url) }
}

interface InternalOptions extends ExtractOptions {
  removeHiddenElements?: boolean
  removeLowScoring?: boolean
  contentSelector?: string
  _cache?: ExtractionCache
}

interface ExtractionCache {
  schemaOrg: unknown[]
  metaTags: ReturnType<typeof collectMetaTags>
  meta: ReturnType<typeof extractMetadata>
  mobileStyles: ReturnType<typeof evaluateMediaQueries>
  smallImages: ReturnType<typeof filterSmallImages>
}

const getOrCreateCache = (doc: Document, existing?: ExtractionCache): ExtractionCache => {
  if (existing) return existing
  const schemaOrg = extractSchemaOrg(doc)
  const metaTags = collectMetaTags(doc)
  const meta = extractMetadata(doc, schemaOrg, metaTags)
  const mobileStyles = evaluateMediaQueries(doc)
  const smallImages = filterSmallImages(doc)
  return { schemaOrg, metaTags, meta, mobileStyles, smallImages }
}

const extractInternal = (doc: Document, url: string, options: InternalOptions = {}): ExtractResult => {
  const { removeHiddenElements: shouldRemoveHidden = true, removeLowScoring = true, contentSelector } = options

  if (!doc.documentElement) {
    return emptyResult(url)
  }

  const cache = getOrCreateCache(doc, options._cache)
  const { meta, mobileStyles } = cache

  const clone = doc.cloneNode(true) as Document
  clone.body?.normalize()

  flattenShadowRoots(doc, clone)
  resolveStreamedContent(clone)
  applyMobileStyles(clone, mobileStyles)

  const mainContent = findMainContent(clone, contentSelector)
  if (!mainContent) {
    return {
      ...emptyResult(url),
      content: doc.body ? serializeHTML(doc.body) : "",
      wordCount: doc.body ? countHtmlWords(serializeHTML(doc.body)) : 0,
    }
  }

  mainContent.querySelectorAll("wbr").forEach((el) => el.remove())
  normaliseFootnotes(mainContent)
  normaliseCallouts(mainContent)

  if (shouldRemoveHidden) filterHiddenElements(clone)
  filterBySelectors(clone, mainContent, !shouldRemoveHidden)
  if (removeLowScoring) filterLowScoringBlocks(clone, mainContent)
  filterContentPatterns(mainContent, url)

  normaliseContent(mainContent, meta.title, clone)

  if (url) resolveRelativeUrls(mainContent, url, doc)

  const content = mainContent.outerHTML
  return {
    title: meta.title,
    author: meta.author,
    content,
    description: meta.description,
    domain: meta.domain || (url ? safeDomain(url) : ""),
    siteName: meta.siteName,
    language: meta.language,
    dir: meta.dir,
    published: meta.published || null,
    wordCount: countHtmlWords(content),
  }
}

const emptyResult = (url: string): ExtractResult => ({
  title: "",
  author: "",
  content: "",
  description: "",
  domain: url ? safeDomain(url) : "",
  siteName: "",
  published: null,
  wordCount: 0,
})

const getSelector = (el: Element, doc: Document): string => {
  const parts: string[] = []
  let current: Element | null = el
  while (current && current !== doc.documentElement) {
    let selector = current.tagName.toLowerCase()
    if (current.id) selector += `#${current.id}`
    parts.unshift(selector)
    current = current.parentElement
  }
  return parts.join(" > ")
}

// Memoize countWords(el.textContent) so that repeated scans during retry and
// subsequent schema-fallback comparisons don't re-walk the same subtrees.
const wordCountCache = new WeakMap<Element, number>()

const cachedWordCount = (el: Element): number => {
  const hit = wordCountCache.get(el)
  if (hit !== undefined) return hit
  const count = countWords(el.textContent ?? "")
  wordCountCache.set(el, count)
  return count
}

const findLargestHiddenContentSelector = (doc: Document): string | undefined => {
  if (!doc.body) return undefined
  const candidates = Array.from(doc.body.querySelectorAll(HIDDEN_EXACT_SKIP_SELECTOR)).filter(
    (el) => !(el.getAttribute("class") ?? "").includes("math"),
  )

  let best: Element | null = null
  let bestWords = 0
  for (const el of candidates) {
    const words = cachedWordCount(el)
    if (words > bestWords) {
      best = el
      bestWords = words
    }
  }

  if (!best || bestWords < 30) return undefined
  return getSelector(best, doc)
}

const mergeExtractorVariables = (result: ExtractResult, variables?: Record<string, string>): ExtractResult => {
  if (!variables) return result
  return {
    ...result,
    title: variables.title ?? result.title,
    author: variables.author ?? result.author,
    siteName: variables.site ?? result.siteName,
    language: variables.language ?? result.language,
    description: variables.description ?? result.description,
    published: variables.published ?? result.published,
  }
}
