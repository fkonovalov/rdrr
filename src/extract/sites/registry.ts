import type { SiteExtractor, SiteExtractorFactory } from "./types"

const FACTORIES: SiteExtractorFactory[] = []

export const registerSite = (factory: SiteExtractorFactory): void => {
  FACTORIES.push(factory)
}

export const findSiteExtractor = (doc: Document, url: string, schemaOrg?: unknown[]): SiteExtractor | null => {
  return findByPredicate(doc, url, schemaOrg, (e) => e.canExtract())
}

export const findAsyncSiteExtractor = (doc: Document, url: string, schemaOrg?: unknown[]): SiteExtractor | null => {
  return findByPredicate(doc, url, schemaOrg, (e) => e.canExtractAsync?.() ?? false)
}

const findByPredicate = (
  doc: Document,
  url: string,
  schemaOrg: unknown[] | undefined,
  predicate: (e: SiteExtractor) => boolean,
): SiteExtractor | null => {
  try {
    const domain = new URL(url).hostname

    for (const { patterns, create } of FACTORIES) {
      const isMatch = patterns.some((pattern) =>
        pattern instanceof RegExp ? pattern.test(url) : domain.includes(pattern),
      )

      if (isMatch) {
        const extractor = create(doc, url, schemaOrg)
        if (predicate(extractor)) return extractor
      }
    }

    return null
  } catch {
    return null
  }
}
