import { DOMParser } from "linkedom"
import { SaxesParser } from "saxes"

export const invalidFeed = (message: string): Error =>
  Object.assign(new Error(`Invalid Reddit feed: ${message}`), { name: "RedditFeedError" })

export const parseFeedXml = (xml: string): Document => {
  const parser = new SaxesParser({ xmlns: true })
  parser.on("doctype", () => {
    throw new Error("DOCTYPE is not allowed")
  })
  try {
    parser.write(xml).close()
  } catch (error) {
    throw invalidFeed(error instanceof Error ? error.message : "malformed XML")
  }
  const doc = new DOMParser().parseFromString(xml, "text/xml") as unknown as Document
  if (doc.documentElement?.tagName !== "feed") throw invalidFeed("expected an Atom feed")
  return doc
}
