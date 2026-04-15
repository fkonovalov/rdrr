import { countWords } from "@shared"
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
import { extractMetadata } from "./metadata"
import { normaliseContent } from "./normalise"
import { extractSchemaOrg, getSchemaText, findElementBySchemaText, collectMetaTags } from "./schema"
import { findMainContent } from "./select"
import { findSiteExtractor, findAsyncSiteExtractor } from "./sites/registry"
import { serializeHTML } from "./utils/dom"

export const extract = (doc: Document, options: ExtractOptions = {}): ExtractResult => {
  const url = options.url ?? ""

  // Try sync site extractors first
  const siteExtractor = url ? findSiteExtractor(doc, url) : null
  if (siteExtractor) {
    const extracted = siteExtractor.extract()
    if (extracted.contentSelector) {
      // Extractor wants the engine to process a specific element
      const pipelineResult = extractInternal(doc, url, {
        ...options,
        contentSelector: extracted.contentSelector,
        removeLowScoring: false,
        removeHiddenElements: false,
      })
      return mergeExtractorVariables(pipelineResult, extracted.variables)
    }
    if (extracted.contentHtml) {
      const schemaOrg = extractSchemaOrg(doc)
      const metaTags = collectMetaTags(doc)
      const meta = extractMetadata(doc, schemaOrg, metaTags)
      return {
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
      }
    }
  }

  // Build cache once, reuse across all retries
  const _cache = getOrCreateCache(doc)
  const opts = { ...options, _cache }

  // Collect all attempts for final safety net fallback
  const attempts: ExtractResult[] = []
  const tryExtract = (retryOpts: InternalOptions): ExtractResult => {
    const r = extractInternal(doc, url, retryOpts)
    attempts.push(r)
    return r
  }

  let result = tryExtract(opts)

  if (result.wordCount < 50) {
    const retry = tryExtract({ ...opts, removeHiddenElements: false })
    if (retry.wordCount > result.wordCount * 2) result = retry

    // Try targeting the largest hidden subtree directly
    const hiddenSelector = findLargestHiddenContentSelector(doc)
    if (hiddenSelector) {
      const hiddenRetry = tryExtract({
        ...opts,
        removeHiddenElements: false,
        contentSelector: hiddenSelector,
      })
      if (
        hiddenRetry.wordCount > result.wordCount ||
        (hiddenRetry.wordCount > Math.max(20, result.wordCount * 0.7) &&
          hiddenRetry.content.length < result.content.length)
      ) {
        result = hiddenRetry
      }
    }
  }

  if (result.wordCount < 50) {
    const retry = tryExtract({
      ...opts,
      removeLowScoring: false,
    })
    if (retry.wordCount > result.wordCount) result = retry
  }

  // Safety net: if all retries still failed, fall back to the longest attempt.
  // Only triggers when the current pipeline already gave up (wordCount < 50),
  // so happy-path output is unaffected.
  if (result.wordCount < 50 && attempts.length > 1) {
    const best = attempts.reduce((a, b) => (b.wordCount > a.wordCount ? b : a))
    if (best.wordCount > result.wordCount) result = best
  }

  stripUnsafeElements(doc)

  const schemaText = getSchemaText(_cache.schemaOrg)
  if (schemaText && countWords(schemaText) > result.wordCount * 1.5) {
    const bestMatch = doc.body ? findElementBySchemaText(doc.body, schemaText) : null
    if (bestMatch) {
      const selector = getSelector(bestMatch, doc)
      result = extractInternal(doc, url, { ...opts, contentSelector: selector })
    } else {
      result.content = schemaText
      result.wordCount = countWords(schemaText)
    }
  }

  return result
}

export const extractAsync = async (doc: Document, options: ExtractOptions = {}): Promise<ExtractResult> => {
  const url = options.url ?? ""

  // Try async site extractors first (e.g. X.com via FxTwitter API)
  const asyncExtractor = findAsyncSiteExtractor(doc, url)
  if (asyncExtractor?.extractAsync) {
    const extracted = await asyncExtractor.extractAsync()
    const schemaOrg = extractSchemaOrg(doc)
    const metaTags = collectMetaTags(doc)
    const meta = extractMetadata(doc, schemaOrg, metaTags)

    return {
      title: extracted.variables?.title ?? meta.title,
      author: extracted.variables?.author ?? meta.author,
      content: extracted.contentHtml,
      description: extracted.variables?.description ?? meta.description,
      domain: meta.domain,
      siteName: extracted.variables?.site ?? meta.siteName,
      language: extracted.variables?.language ?? meta.language,
      dir: meta.dir,
      published: extracted.variables?.published ?? meta.published ?? null,
      wordCount: countHtmlWords(extracted.contentHtml),
    }
  }

  // Fall back to sync extract
  const result = extract(doc, options)

  // If sync produced very little content, try async extractors as fallback
  if (result.wordCount === 0) {
    const fallback = findAsyncSiteExtractor(doc, url)
    if (fallback?.extractAsync) {
      const extracted = await fallback.extractAsync()
      return {
        ...result,
        title: extracted.variables?.title ?? result.title,
        author: extracted.variables?.author ?? result.author,
        content: extracted.contentHtml,
        siteName: extracted.variables?.site ?? result.siteName,
        published: extracted.variables?.published ?? result.published,
        wordCount: countHtmlWords(extracted.contentHtml),
      }
    }
  }

  return result
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

const safeDomain = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

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

const findLargestHiddenContentSelector = (doc: Document): string | undefined => {
  if (!doc.body) return undefined
  const candidates = Array.from(doc.body.querySelectorAll(HIDDEN_EXACT_SKIP_SELECTOR)).filter(
    (el) => !(el.getAttribute("class") ?? "").includes("math"),
  )

  let best: Element | null = null
  let bestWords = 0
  for (const el of candidates) {
    const words = countWords(el.textContent ?? "")
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
