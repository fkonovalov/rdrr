import type { SiteExtractor } from "./types"
import { serializeHTML } from "../utils/dom"
import { registerSite } from "./registry"

const SEL = {
  ARTICLE: '[data-testid="twitterArticleRichTextView"]',
  TITLE: '[data-testid="twitter-article-title"]',
  AUTHOR: '[itemprop="author"]',
  AUTHOR_NAME: 'meta[itemprop="name"]',
  AUTHOR_HANDLE: 'meta[itemprop="additionalName"]',
  IMAGES: '[data-testid="tweetPhoto"] img',
  DRAFT_PARAGRAPHS: ".longform-unstyled, .public-DraftStyleDefault-block",
  BOLD_SPANS: 'span[style*="font-weight: bold"]',
  DRAFT_ATTRS: "[data-offset-key]",
  EMBEDDED_TWEET: '[data-testid="simpleTweet"]',
  TWEET_TEXT: '[data-testid="tweetText"]',
  USER_NAME: '[data-testid="User-Name"]',
  CODE_BLOCK: '[data-testid="markdown-code-block"]',
  HEADER_BLOCK: '[data-testid="longform-header"]',
} as const

registerSite({
  patterns: ["x.com", "twitter.com"],
  create: (doc, url) => {
    const articleContainer = doc.querySelector(SEL.ARTICLE)

    return {
      canExtract: () => !!articleContainer,
      extract: () => {
        const title = doc.querySelector(SEL.TITLE)?.textContent?.trim() ?? "Untitled X Article"
        const author = extractAuthor(doc, url)
        const contentHtml = extractContent(doc, articleContainer!)

        return {
          content: contentHtml,
          contentHtml,
          variables: {
            title,
            author,
            site: "X (Twitter)",
            description: articleContainer?.textContent?.trim().slice(0, 140) ?? "",
          },
        }
      },
    } satisfies SiteExtractor
  },
})

const extractAuthor = (doc: Document, url: string): string => {
  const authorContainer = doc.querySelector(SEL.AUTHOR)
  if (authorContainer) {
    const name = authorContainer.querySelector(SEL.AUTHOR_NAME)?.getAttribute("content")
    const handle = authorContainer.querySelector(SEL.AUTHOR_HANDLE)?.getAttribute("content")
    if (name && handle) return `${name} (@${handle})`
    if (name || handle) return name ?? handle ?? ""
  }

  const urlMatch = url.match(/\/([a-zA-Z0-9_][a-zA-Z0-9_]{0,14})\/(article|status)\/\d+/)
  if (urlMatch) return `@${urlMatch[1]}`

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? ""
  const match = ogTitle.match(/^(?:\(\d+\)\s+)?(.+?)\s+on\s+X\s*:/)
  return match ? match[1]!.trim() : "Unknown"
}

const extractContent = (doc: Document, container: Element): string => {
  const clone = container.cloneNode(true) as Element

  convertEmbeddedTweets(clone, doc)
  convertCodeBlocks(clone, doc)
  convertHeaders(clone, doc)
  unwrapLinkedImages(clone, doc)
  upgradeImageQuality(clone)
  convertBoldSpans(clone, doc)
  convertDraftParagraphs(clone, doc)
  removeDraftAttributes(clone)
  repairSurrogatePairs(clone, doc)

  return `<article class="x-article">${serializeHTML(clone)}</article>`
}

const convertEmbeddedTweets = (container: Element, doc: Document): void => {
  for (const tweet of container.querySelectorAll(SEL.EMBEDDED_TWEET)) {
    const blockquote = doc.createElement("blockquote")
    blockquote.className = "embedded-tweet"

    const userNameEl = tweet.querySelector(SEL.USER_NAME)
    const authorLinks = userNameEl?.querySelectorAll("a")
    const fullName = authorLinks?.[0]?.textContent?.trim() ?? ""
    const handle = authorLinks?.[1]?.textContent?.trim() ?? ""

    if (fullName || handle) {
      const cite = doc.createElement("cite")
      cite.textContent = handle ? `${fullName} ${handle}` : fullName
      blockquote.appendChild(cite)
    }

    const tweetText = tweet.querySelector(SEL.TWEET_TEXT)?.textContent?.trim() ?? ""
    if (tweetText) {
      const p = doc.createElement("p")
      p.textContent = tweetText
      blockquote.appendChild(p)
    }

    tweet.replaceWith(blockquote)
  }
}

const convertCodeBlocks = (container: Element, doc: Document): void => {
  for (const block of container.querySelectorAll(SEL.CODE_BLOCK)) {
    const pre = block.querySelector("pre")
    const code = block.querySelector("code")
    if (!pre || !code) continue

    let language = ""
    const langClass = code.className.match(/language-(\w+)/)
    if (langClass) {
      language = langClass[1]!
    } else {
      const langSpan = block.querySelector("span")
      language = langSpan?.textContent?.trim() ?? ""
    }

    const newPre = doc.createElement("pre")
    const newCode = doc.createElement("code")
    if (language) {
      newCode.setAttribute("data-lang", language)
      newCode.className = `language-${language}`
    }
    newCode.textContent = code.textContent ?? ""
    newPre.appendChild(newCode)
    block.replaceWith(newPre)
  }
}

const convertHeaders = (container: Element, doc: Document): void => {
  for (const header of container.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const level = header.tagName.toLowerCase()
    const text = header.textContent?.trim() ?? ""
    if (!text) continue
    const newHeader = doc.createElement(level)
    newHeader.textContent = text
    header.replaceWith(newHeader)
  }
}

const unwrapLinkedImages = (container: Element, doc: Document): void => {
  for (const img of container.querySelectorAll(SEL.IMAGES)) {
    const anchor = img.closest("a")
    if (!anchor || !container.contains(anchor)) continue

    let src = img.getAttribute("src") ?? ""
    const alt = img.getAttribute("alt")?.replace(/\s+/g, " ").trim() ?? "Image"

    src = upgradeImageUrl(src)
    const cleanImg = doc.createElement("img")
    cleanImg.setAttribute("src", src)
    cleanImg.setAttribute("alt", alt)
    anchor.replaceWith(cleanImg)
  }
}

const upgradeImageQuality = (container: Element): void => {
  for (const img of container.querySelectorAll(SEL.IMAGES)) {
    const src = img.getAttribute("src")
    if (src) img.setAttribute("src", upgradeImageUrl(src))
  }
}

const upgradeImageUrl = (src: string): string => {
  if (src.includes("&name=")) return src.replace(/&name=\w+/, "&name=large")
  if (src.includes("?")) return `${src}&name=large`
  return `${src}?name=large`
}

const convertBoldSpans = (container: Element, doc: Document): void => {
  for (const span of container.querySelectorAll(SEL.BOLD_SPANS)) {
    const strong = doc.createElement("strong")
    strong.textContent = span.textContent ?? ""
    span.replaceWith(strong)
  }
}

const convertDraftParagraphs = (container: Element, doc: Document): void => {
  for (const div of container.querySelectorAll(SEL.DRAFT_PARAGRAPHS)) {
    const p = doc.createElement("p")

    const processNode = (node: Node): void => {
      if (node.nodeType === 3) {
        p.appendChild(doc.createTextNode(node.textContent ?? ""))
      } else if (node.nodeType === 1) {
        const el = node as Element
        const tag = el.tagName.toLowerCase()
        if (tag === "strong") {
          const strong = doc.createElement("strong")
          strong.textContent = el.textContent ?? ""
          p.appendChild(strong)
        } else if (tag === "a") {
          const link = doc.createElement("a")
          link.setAttribute("href", el.getAttribute("href") ?? "")
          link.textContent = el.textContent ?? ""
          p.appendChild(link)
        } else if (tag === "code") {
          const code = doc.createElement("code")
          code.textContent = el.textContent ?? ""
          p.appendChild(code)
        } else {
          for (const child of el.childNodes) processNode(child)
        }
      }
    }

    for (const child of div.childNodes) processNode(child)
    div.replaceWith(p)
  }
}

const removeDraftAttributes = (container: Element): void => {
  for (const el of container.querySelectorAll(SEL.DRAFT_ATTRS)) {
    el.removeAttribute("data-offset-key")
  }
}

const repairSurrogatePairs = (container: Element, doc: Document): void => {
  const walker = doc.createTreeWalker(container, 4) // NodeFilter.SHOW_TEXT
  let prev: Text | null = null
  let node: Node | null
  while ((node = walker.nextNode())) {
    const curr = node as Text
    if (prev) {
      const prevText = prev.textContent ?? ""
      const currText = curr.textContent ?? ""
      if (prevText && currText) {
        const lastCode = prevText.charCodeAt(prevText.length - 1)
        const firstCode = currText.charCodeAt(0)
        if (lastCode >= 0xd800 && lastCode <= 0xdbff && firstCode >= 0xdc00 && firstCode <= 0xdfff) {
          prev.textContent = prevText.slice(0, -1)
          curr.textContent = prevText.slice(-1) + currText
        }
      }
    }
    prev = curr
  }
}
