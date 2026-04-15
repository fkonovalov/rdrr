import { countWords } from "@shared"

export interface MetaTag {
  name: string | null
  property: string | null
  content: string
}

export interface Metadata {
  title: string
  description: string
  domain: string
  favicon: string
  image: string
  language: string
  dir?: "ltr" | "rtl"
  published: string
  author: string
  siteName: string
}

export const extractMetadata = (doc: Document, schemaOrg: unknown[], metaTags: MetaTag[]): Metadata => {
  const { url, domain } = resolveUrl(doc, schemaOrg, metaTags)
  const siteName = getSiteName(schemaOrg, metaTags)
  const { title, detectedSite } = cleanTitle(getBestTitle(doc, schemaOrg, metaTags, domain, siteName), siteName)
  const author = getAuthor(doc, schemaOrg, metaTags)
  const authorAsSite = author && !author.includes(",") ? author : ""

  return {
    title,
    description: getDescription(schemaOrg, metaTags),
    domain,
    favicon: getFavicon(doc, url, metaTags),
    image: getImage(schemaOrg, metaTags),
    language: getLanguage(doc, schemaOrg, metaTags),
    dir: getDir(doc),
    published: getPublished(doc, schemaOrg, metaTags),
    author,
    siteName: siteName || detectedSite || authorAsSite || domain || "",
  }
}

const getDir = (doc: Document): "ltr" | "rtl" | undefined => {
  const candidates = ["article", "main", "[role=main]", "body"]
  for (const sel of candidates) {
    const el = doc.querySelector(sel)
    if (!el) continue
    let current: Element | null = el
    while (current) {
      const dir = current.getAttribute("dir")?.toLowerCase()
      if (dir === "ltr" || dir === "rtl") return dir
      current = current.parentElement
    }
  }
  const rootDir = doc.documentElement?.getAttribute("dir")?.toLowerCase()
  if (rootDir === "ltr" || rootDir === "rtl") return rootDir
  return undefined
}

const resolveUrl = (doc: Document, schemaOrg: unknown[], metaTags: MetaTag[]): { url: string; domain: string } => {
  let url = ""
  try {
    url = doc.location?.href ?? ""
    if (!url) {
      url =
        meta(metaTags, "property", "og:url") ||
        meta(metaTags, "property", "twitter:url") ||
        schema(schemaOrg, "url") ||
        schema(schemaOrg, "mainEntityOfPage.url") ||
        schema(schemaOrg, "mainEntity.url") ||
        schema(schemaOrg, "WebSite.url") ||
        (doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "")
    }
  } catch {
    const base = doc.querySelector("base[href]")?.getAttribute("href") ?? ""
    if (base) url = base
  }

  let domain = ""
  if (url) {
    try {
      domain = new URL(url).hostname.replace(/^www\./, "")
    } catch {}
  }
  return { url, domain }
}

const getSiteName = (schemaOrg: unknown[], metaTags: MetaTag[]): string => {
  const candidate =
    schema(schemaOrg, "publisher.name") ||
    meta(metaTags, "property", "og:site_name") ||
    meta(metaTags, "name", "og:site_name") ||
    schema(schemaOrg, "WebSite.name") ||
    schema(schemaOrg, "sourceOrganization.name") ||
    meta(metaTags, "name", "copyright") ||
    schema(schemaOrg, "copyrightHolder.name") ||
    schema(schemaOrg, "isPartOf.name") ||
    meta(metaTags, "name", "application-name") ||
    ""
  return candidate && countWords(candidate) <= 6 ? candidate : ""
}

const getBestTitle = (
  doc: Document,
  schemaOrg: unknown[],
  metaTags: MetaTag[],
  domain: string,
  siteName: string,
): string => {
  const candidates = [
    meta(metaTags, "property", "og:title"),
    meta(metaTags, "name", "twitter:title"),
    schema(schemaOrg, "headline"),
    meta(metaTags, "name", "title"),
    meta(metaTags, "name", "sailthru.title"),
    doc.querySelector("title")?.textContent?.trim() ?? "",
  ].filter(Boolean)

  if (candidates.length === 0) return ""

  const authorNorm = (meta(metaTags, "property", "author") || meta(metaTags, "name", "author")).trim().toLowerCase()
  const siteNorm = siteName.trim().toLowerCase()
  const domainNorm = domain
    ? domain
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
    : ""

  return candidates.find((c) => !isSiteId(c, authorNorm, siteNorm, domainNorm)) ?? candidates[0]!
}

const isSiteId = (candidate: string, authorNorm: string, siteNorm: string, domainNorm: string): boolean => {
  const norm = candidate.trim().toLowerCase()
  if (authorNorm && norm === authorNorm) return true
  if (siteNorm && norm === siteNorm) return true
  if (domainNorm && norm.replace(/[^a-z0-9]/g, "") === domainNorm) return true
  return false
}

const SEPARATORS = "[|\\-\u2013\u2014/\u00b7]"

const cleanTitle = (title: string, siteName: string): { title: string; detectedSite: string } => {
  if (!title) return { title, detectedSite: "" }

  if (siteName && siteName.toLowerCase() !== title.toLowerCase() && countWords(siteName) <= 6) {
    const siteNameLower = siteName.toLowerCase()
    const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    for (const pattern of [`\\s*${SEPARATORS}\\s*${escaped}\\s*$`, `^\\s*${escaped}\\s*${SEPARATORS}\\s*`]) {
      const re = new RegExp(pattern, "i")
      if (re.test(title)) return { title: title.replace(re, "").trim(), detectedSite: siteName }
    }

    // Fuzzy match: title may use abbreviated site name
    const allSepPattern = new RegExp(`\\s+${SEPARATORS}\\s+`, "g")
    let sepMatch
    const allPositions: Array<{ index: number; length: number }> = []
    while ((sepMatch = allSepPattern.exec(title)) !== null) {
      allPositions.push({ index: sepMatch.index, length: sepMatch[0].length })
    }

    if (allPositions.length > 0) {
      // Try suffix
      const lastPos = allPositions.at(-1)!
      const lastSegment = title
        .substring(lastPos.index + lastPos.length)
        .trim()
        .toLowerCase()
      if (lastSegment && siteNameLower.includes(lastSegment)) {
        let cutIndex = lastPos.index
        for (let i = allPositions.length - 2; i >= 0; i--) {
          const pos = allPositions[i]!
          const segment = title.substring(pos.index + pos.length, cutIndex).trim()
          if (countWords(segment) > 3) break
          cutIndex = pos.index
        }
        return { title: title.substring(0, cutIndex).trim(), detectedSite: siteName }
      }

      // Try prefix
      const firstPos = allPositions[0]!
      const prefixSegment = title.substring(0, firstPos.index).trim().toLowerCase()
      if (prefixSegment && siteNameLower.includes(prefixSegment)) {
        let cutIndex = firstPos.index + firstPos.length
        for (let i = 1; i < allPositions.length; i++) {
          const pos = allPositions[i]!
          const segment = title.substring(cutIndex, pos.index).trim()
          if (countWords(segment) > 3) break
          cutIndex = pos.index + pos.length
        }
        return { title: title.substring(cutIndex).trim(), detectedSite: siteName }
      }
    }
  }

  const strongResult = trySplit(title, /\s+([|/\u00b7])\s+/g, (tW, sW) => sW <= 3 && tW >= 2 && tW >= sW * 2)
  if (strongResult) return strongResult

  const dashResult = trySplit(title, /\s+[-\u2013\u2014]\s+/g, (tW, sW) => sW <= 2 && tW >= 2 && tW > sW, true)
  if (dashResult) return dashResult

  return { title: title.trim(), detectedSite: "" }
}

const trySplit = (
  title: string,
  pattern: RegExp,
  guard: (tW: number, sW: number) => boolean,
  suffixOnly = false,
): { title: string; detectedSite: string } | null => {
  const positions: Array<{ index: number; length: number }> = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(title)) !== null) positions.push({ index: m.index, length: m[0].length })
  if (positions.length === 0) return null

  const last = positions.at(-1)!
  const suffTitle = title.substring(0, last.index).trim()
  const suffSite = title.substring(last.index + last.length).trim()
  if (guard(countWords(suffTitle), countWords(suffSite))) return { title: suffTitle, detectedSite: suffSite }

  if (!suffixOnly) {
    const first = positions[0]!
    const preSite = title.substring(0, first.index).trim()
    const preTitle = title.substring(first.index + first.length).trim()
    if (guard(countWords(preTitle), countWords(preSite))) return { title: preTitle, detectedSite: preSite }
  }

  return null
}

const getDescription = (schemaOrg: unknown[], metaTags: MetaTag[]): string =>
  meta(metaTags, "name", "description") ||
  meta(metaTags, "property", "description") ||
  meta(metaTags, "property", "og:description") ||
  schema(schemaOrg, "description") ||
  meta(metaTags, "name", "twitter:description") ||
  meta(metaTags, "name", "sailthru.description") ||
  ""

const getImage = (schemaOrg: unknown[], metaTags: MetaTag[]): string =>
  meta(metaTags, "property", "og:image") ||
  meta(metaTags, "name", "twitter:image") ||
  schema(schemaOrg, "image.url") ||
  meta(metaTags, "name", "sailthru.image.full") ||
  ""

const getLanguage = (doc: Document, schemaOrg: unknown[], metaTags: MetaTag[]): string => {
  const htmlLang = doc.documentElement?.getAttribute("lang")?.trim()
  if (htmlLang) return normLang(htmlLang)
  const contentLang = meta(metaTags, "name", "content-language") || meta(metaTags, "property", "og:locale")
  if (contentLang) return normLang(contentLang)
  const httpEquiv = doc.querySelector('meta[http-equiv="Content-Language" i]')?.getAttribute("content")?.trim()
  if (httpEquiv) return normLang(httpEquiv)
  const schemaLang = schema(schemaOrg, "inLanguage")
  if (schemaLang) return normLang(schemaLang)
  return ""
}

const normLang = (code: string): string => code.replace(/_/g, "-")

const getFavicon = (doc: Document, baseUrl: string, metaTags: MetaTag[]): string => {
  const iconFromMeta = meta(metaTags, "property", "og:image:favicon")
  if (iconFromMeta) return iconFromMeta

  const iconLink = doc.querySelector("link[rel='icon']")?.getAttribute("href")
  if (iconLink) return iconLink

  const shortcutLink = doc.querySelector("link[rel='shortcut icon']")?.getAttribute("href")
  if (shortcutLink) return shortcutLink

  if (baseUrl && /^https?:\/\//.test(baseUrl)) {
    try {
      return new URL("/favicon.ico", baseUrl).href
    } catch {}
  }

  return ""
}

const MONTH_MAP: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
}

const getPublished = (doc: Document, schemaOrg: unknown[], metaTags: MetaTag[]): string => {
  const result =
    schema(schemaOrg, "datePublished") ||
    meta(metaTags, "name", "publishDate") ||
    meta(metaTags, "property", "article:published_time") ||
    (doc.querySelector('abbr[itemprop="datePublished"]') as HTMLElement | null)?.title?.trim() ||
    doc.querySelector("time")?.getAttribute("datetime")?.trim() ||
    doc.querySelector("time")?.textContent?.trim() ||
    meta(metaTags, "name", "sailthru.date") ||
    ""
  if (result) return result

  const h1 = doc.querySelector("h1")
  if (h1) {
    let sibling = h1.nextElementSibling
    for (let i = 0; i < 3 && sibling; i++) {
      for (const child of sibling.querySelectorAll("p, time")) {
        const parsed = parseDate(child.textContent?.trim() ?? "")
        if (parsed) return parsed
      }
      const parsed = parseDate(sibling.textContent?.trim() ?? "")
      if (parsed) return parsed
      sibling = sibling.nextElementSibling
    }
  }

  return ""
}

const parseDate = (text: string): string => {
  let m = text.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
  )
  if (m) return `${m[3]}-${MONTH_MAP[m[2]!.toLowerCase()]}-${m[1]!.padStart(2, "0")}T00:00:00+00:00`

  m = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
  )
  if (m) return `${m[3]}-${MONTH_MAP[m[1]!.toLowerCase()]}-${m[2]!.padStart(2, "0")}T00:00:00+00:00`

  return ""
}

const getAuthor = (doc: Document, schemaOrg: unknown[], metaTags: MetaTag[]): string => {
  // 1. Meta tags
  const fromMeta =
    meta(metaTags, "name", "sailthru.author") ||
    meta(metaTags, "property", "author") ||
    meta(metaTags, "name", "author") ||
    meta(metaTags, "name", "byl") ||
    meta(metaTags, "name", "authorList")
  if (fromMeta && !isTemplate(fromMeta)) return fromMeta

  // Research paper meta tags
  let citations = metas(metaTags, "name", "citation_author").filter((s) => !isTemplate(s))
  if (citations.length === 0) citations = metas(metaTags, "property", "dc.creator").filter((s) => !isTemplate(s))
  if (citations.length > 0) {
    return citations
      .map((s) => {
        if (!s.includes(",")) return s.trim()
        const parts = /(.*),\s(.*)/.exec(s)
        return parts?.length === 3 ? `${parts[2]} ${parts[1]}` : s.trim()
      })
      .join(", ")
  }

  // 2. Schema.org
  const schemaAuthor = schema(schemaOrg, "author.name") || schema(schemaOrg, "author.[].name")
  if (schemaAuthor) {
    const unique = [
      ...new Set(
        schemaAuthor
          .split(",")
          .map((p) => p.trim().replace(/,$/, "").trim())
          .filter(Boolean),
      ),
    ]
    if (unique.length > 0) return unique.slice(0, 10).join(", ")
  }

  // 3. DOM elements
  const domAuthors: string[] = []
  for (const { selector, max } of [
    { selector: '[itemprop="author"]', max: Infinity },
    { selector: ".author", max: 3 },
    { selector: '[href*="/author/"]', max: 3 },
    { selector: ".authors a", max: 3 },
  ] as const) {
    const matches = doc.querySelectorAll(selector)
    if (matches.length > max) continue
    for (const el of matches) {
      const text = el.textContent?.trim() ?? ""
      for (const part of text.split(",")) {
        const clean = part.replace(/\s+/g, " ").trim().replace(/,$/, "").trim()
        if (clean && clean.toLowerCase() !== "author" && clean.toLowerCase() !== "authors") {
          domAuthors.push(clean)
        }
      }
    }
  }

  if (domAuthors.length > 0) {
    let unique = [...new Set(domAuthors.filter(Boolean))]
    if (unique.length > 1) unique = unique.filter((a) => !unique.some((b) => b !== a && a.includes(b)))
    if (unique.length > 0) return unique.slice(0, 10).join(", ")
  }

  // 4. Author near article heading
  const h1 = doc.querySelector("h1")
  if (h1) {
    // Check siblings of h1 for date-adjacent author names
    let sibling = h1.nextElementSibling
    for (let i = 0; i < 3 && sibling; i++) {
      const siblingText = sibling.textContent?.trim() ?? ""
      const childEls = Array.from(sibling.querySelectorAll("p, time"))
      const hasDateChild = childEls.some((el) => !!parseDate(el.textContent?.trim() ?? ""))
      const hasSiblingDate = !!parseDate(siblingText) || hasDateChild
      if (hasSiblingDate) {
        const links = sibling.querySelectorAll("a")
        if (links.length === 1) {
          const linkText = (links[0]!.textContent?.trim() ?? "").replace(/\u00a0/g, " ")
          if (linkText.length > 0 && linkText.length < 100 && !parseDate(linkText)) {
            return linkText
          }
        }
        if (hasDateChild && siblingText.length < 300) {
          for (const p of childEls) {
            if (p.tagName !== "P") continue
            const pText = (p.textContent?.trim() ?? "").replace(/\u00a0/g, " ")
            if (pText.length > 0 && pText.length < 150 && !parseDate(pText)) return pText
          }
        }
      }
      sibling = sibling.nextElementSibling
    }

    // Search for "By ..." bylines near h1
    let bylineScope: Element | null = h1
    for (let depth = 0; depth < 3 && bylineScope; depth++) {
      let candidate = bylineScope.previousElementSibling
      for (let i = 0; i < 3 && candidate; i++) {
        const result = extractByline(candidate)
        if (result) return result
        candidate = candidate.previousElementSibling
      }
      candidate = bylineScope.nextElementSibling
      for (let i = 0; i < 3 && candidate; i++) {
        const result = extractByline(candidate)
        if (result) return result
        candidate = candidate.nextElementSibling
      }
      bylineScope = bylineScope.parentElement
    }
  }

  return ""
}

const extractByline = (el: Element): string | null => {
  const candidates = [el, ...el.querySelectorAll("p, span, address")]
  for (const candidate of candidates) {
    const text = (candidate.textContent?.trim() ?? "").replace(/\u00a0/g, " ")
    if (text.length > 0 && text.length < 50) {
      const bylineMatch = text.match(/^By\s+([A-Z].+)$/i)
      if (bylineMatch) return bylineMatch[1]!.trim()
    }
  }
  return null
}

const isTemplate = (s: string): boolean => /[{}]/.test(s) || /^#[a-zA-Z]/.test(s)

const meta = (tags: MetaTag[], attr: "name" | "property", value: string): string => metas(tags, attr, value)[0] ?? ""

const metas = (tags: MetaTag[], attr: "name" | "property", value: string): string[] =>
  tags
    .filter((t) => (attr === "name" ? t.name : t.property)?.toLowerCase() === value.toLowerCase())
    .map((t) => t.content?.trim() ?? "")

const schema = (data: unknown, property: string): string => {
  if (!data) return ""

  const search = (obj: unknown, props: string[], isExact: boolean = true): string[] => {
    if (typeof obj === "string") return props.length === 0 ? [obj] : []
    if (!obj || typeof obj !== "object") return []

    if (Array.isArray(obj)) {
      const cur = props[0]
      if (cur && /^\[\d+\]$/.test(cur)) {
        const index = parseInt(cur.slice(1, -1))
        if ((obj as unknown[])[index]) return search((obj as unknown[])[index], props.slice(1), isExact)
        return []
      }
      if (props.length === 0 && obj.every((i) => typeof i === "string" || typeof i === "number")) return obj.map(String)
      return obj.flatMap((item) => search(item, props, isExact))
    }

    const [cur, ...rest] = props
    if (!cur) {
      if (typeof obj === "string") return [obj]
      if (Object.hasOwn(obj as object, "name") && typeof (obj as Record<string, unknown>).name === "string") {
        return [(obj as Record<string, unknown>).name as string]
      }
      return []
    }

    if (Object.hasOwn(obj as object, cur)) return search((obj as Record<string, unknown>)[cur], rest, true)

    // Fuzzy fallback: search nested objects
    if (!isExact) {
      const nested: string[] = []
      for (const key of Object.keys(obj as object)) {
        const val = (obj as Record<string, unknown>)[key]
        if (typeof val === "object" && val !== null) {
          nested.push(...search(val, props, false))
        }
      }
      if (nested.length > 0) return nested
    }

    return []
  }

  let results = search(data, property.split("."), true)
  if (results.length === 0) results = search(data, property.split("."), false)
  return results.filter(Boolean).join(", ")
}
