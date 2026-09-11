import { extractRedditPostId } from "../../detect"

export const redditTarget = (url: string) => {
  const id = extractRedditPostId(url)
  if (!id) throw new Error(`Not a Reddit post URL: ${url}`)
  const input = new URL(url)
  const path = input.hostname === "redd.it" ? `/comments/${id}` : input.pathname.replace(/\/(?:\.rss|\.json)\/?$/, "")
  const feedUrl = new URL(`https://www.reddit.com${path.replace(/\/+$/, "")}/.rss`)
  for (const key of ["sort", "context", "depth", "limit", "comment"]) {
    const value = input.searchParams.get(key)
    if (value !== null) feedUrl.searchParams.set(key, value)
  }
  const commentId =
    path.match(/\/comments\/[^/]+\/[^/]+\/([a-z0-9]+)(?:\/|$)/i)?.[1] ?? input.searchParams.get("comment")
  if (commentId && !/^[a-z0-9]+$/i.test(commentId)) throw new Error("Invalid Reddit comment ID")
  return { id, commentId: commentId?.toLowerCase(), feedUrl: feedUrl.href }
}
