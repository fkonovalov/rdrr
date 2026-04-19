import { parseHTML } from "linkedom"
import type { RawChapter, RawItem, VideoMetadata } from "./types"

const INNERTUBE_API = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
const INNERTUBE_NEXT = "https://www.youtube.com/youtubei/v1/next?prettyPrint=false"
const INNERTUBE_VERSION = "20.10.38"
const ANDROID_CONTEXT = { client: { clientName: "ANDROID", clientVersion: INNERTUBE_VERSION } }
const WEB_CONTEXT = { client: { clientName: "WEB", clientVersion: "2.20240101.00.00" } }
const ANDROID_UA = `com.google.android.youtube/${INNERTUBE_VERSION} (Linux; U; Android 14)`

export const fetchMetadata = async (videoId: string): Promise<VideoMetadata> => {
  const oembed = await fetchOembedMetadata(videoId)
  if (oembed) return oembed
  const player = await fetchPlayerMetadata(videoId)
  if (player) return player
  throw new Error("Video not found")
}

const fetchOembedMetadata = async (videoId: string): Promise<VideoMetadata | undefined> => {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
    if (!res.ok) return undefined
    const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
    return {
      title: data.title ?? "",
      author: data.author_name ?? "",
      thumbnailUrl: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    }
  } catch {
    return undefined
  }
}

const fetchPlayerMetadata = async (videoId: string): Promise<VideoMetadata | undefined> => {
  const data = await tryFetchPlayerData(videoId, ANDROID_CONTEXT, ANDROID_UA)
  if (!data) return undefined
  const details = asRecord(asRecord(data).videoDetails)
  const title = asString(details.title)
  if (!title) return undefined
  const thumbs = asArray(asRecord(details.thumbnail).thumbnails)
  const bestThumb = thumbs
    .map(asRecord)
    .reduce<string | undefined>((best, t) => asString(t.url) ?? best, undefined)
  return {
    title,
    author: asString(details.author) ?? "",
    thumbnailUrl: bestThumb ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

export const fetchTranscript = async (videoId: string, preferredLanguage?: string): Promise<RawItem[]> => {
  const playerData = await fetchPlayerData(videoId)
  if (!playerData) throw new Error("FETCH_FAILED")
  const tracks = getCaptionTracks(playerData)
  if (tracks.length === 0) throw new Error("NO_CAPTIONS")
  const track = pickTrack(tracks, playerData, preferredLanguage)
  if (!track?.baseUrl || !validateCaptionUrl(track.baseUrl)) throw new Error("NO_CAPTIONS")
  const res = await fetch(track.baseUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) throw new Error("NO_CAPTIONS")
  const xml = await res.text()
  const items = parseCaptionXml(xml)
  if (items.length === 0) throw new Error("NO_CAPTIONS")
  return items
}

export const fetchChapters = async (videoId: string): Promise<RawChapter[]> => {
  let res: Response
  try {
    res = await fetch(INNERTUBE_NEXT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, context: WEB_CONTEXT }),
      signal: AbortSignal.timeout(4000),
    })
  } catch {
    return []
  }
  if (!res.ok) return []
  const data = await res.json()
  for (const panel of asArray(asRecord(data).engagementPanels)) {
    const panelObj = asRecord(panel)
    const markers = asRecord(asRecord(panelObj.engagementPanelSectionListRenderer).content).macroMarkersListRenderer
    const items = asArray(asRecord(markers).contents)
    if (items.length === 0) continue
    const chapters: RawChapter[] = []
    for (const item of items) {
      const renderer = asRecord(asRecord(item).macroMarkersListItemRenderer)
      const title = asString(asRecord(renderer.title).simpleText)
      const timeStr = asString(asRecord(renderer.timeDescription).simpleText)
      if (!title || !timeStr) continue
      chapters.push({ title, startTime: parseTimestamp(timeStr) })
    }
    if (chapters.length > 1) return chapters
  }
  return []
}

// Narrow helpers to keep the deep InnerTube JSON walks readable.
const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {}
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)

const parseTimestamp = (timeStr: string): number => {
  const parts = timeStr.split(":").map(Number)
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
  return parts[0] ?? 0
}

const fetchPlayerData = async (videoId: string): Promise<unknown | undefined> => {
  // Race both client contexts in parallel. Android almost always wins and carries
  // captions; WEB is a safety net when YouTube rate-limits the Android client.
  const attempts = [
    tryFetchPlayerData(videoId, ANDROID_CONTEXT, ANDROID_UA),
    tryFetchPlayerData(videoId, WEB_CONTEXT),
  ]
  const results = await Promise.all(attempts)
  for (const data of results) {
    if (data && getCaptionTracks(data).length > 0) return data
  }
  return undefined
}

const tryFetchPlayerData = async (
  videoId: string,
  context: Record<string, unknown>,
  userAgent?: string,
): Promise<unknown | undefined> => {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (userAgent) headers["User-Agent"] = userAgent
    const res = await fetch(INNERTUBE_API, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ context, videoId }),
    })
    if (!res.ok) return undefined
    return await res.json()
  } catch {
    return undefined
  }
}

const getCaptionTracks = (data: unknown): Array<{ languageCode?: string; baseUrl?: string }> => {
  const list = asRecord(asRecord(data).captions).playerCaptionsTracklistRenderer
  return asArray(asRecord(list).captionTracks) as Array<{ languageCode?: string; baseUrl?: string }>
}

const pickTrack = (
  tracks: Array<{ languageCode?: string; baseUrl?: string }>,
  playerData: unknown,
  preferredLanguage?: string,
): { baseUrl?: string } | undefined => {
  // Priority: explicit user preference -> video's default audio language -> English -> first.
  const preferred = preferredLanguage?.split(/[-_,;]/)[0]?.toLowerCase() ?? ""
  if (preferred) {
    const m = tracks.find((t) => t.languageCode?.toLowerCase().startsWith(preferred))
    if (m) return m
  }

  const details = asRecord(asRecord(playerData).videoDetails)
  const baseLang = (asString(details.defaultAudioLanguage) ?? "").split("-")[0]?.toLowerCase() ?? ""
  if (baseLang) {
    const m = tracks.find((t) => t.languageCode?.toLowerCase().startsWith(baseLang))
    if (m) return m
  }
  return tracks.find((t) => t.languageCode === "en") ?? tracks[0]
}

const validateCaptionUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname.endsWith(".youtube.com")
  } catch {
    return false
  }
}

const decodeEntities = (text: string): string =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))

const parseCaptionXml = (xml: string): RawItem[] => {
  const items: RawItem[] = []
  const pRe = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
  let m: RegExpExecArray | null
  while ((m = pRe.exec(xml)) !== null) {
    const sRe = /<s[^>]*>([^<]*)<\/s>/g
    let text = ""
    let s: RegExpExecArray | null
    while ((s = sRe.exec(m[3]!)) !== null) text += s[1]
    if (!text) text = m[3]!.replace(/<[^>]+>/g, "")
    text = decodeEntities(text).trim()
    if (text) items.push({ text, offset: parseInt(m[1]!, 10), duration: parseInt(m[2]!, 10) })
  }
  if (items.length > 0) return items
  const tRe = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g
  while ((m = tRe.exec(xml)) !== null) {
    const text = decodeEntities(m[3]!.replace(/<[^>]+>/g, "")).trim()
    if (text)
      items.push({ text, offset: Math.round(parseFloat(m[1]!) * 1000), duration: Math.round(parseFloat(m[2]!) * 1000) })
  }
  if (items.length > 0) return items

  // Last-resort DOM walk: survives YouTube caption-format drift that breaks both regexes.
  return parseCaptionXmlDom(xml)
}

const parseCaptionXmlDom = (xml: string): RawItem[] => {
  try {
    const { document } = parseHTML(`<!doctype html><html><body>${xml}</body></html>`)
    const items: RawItem[] = []
    for (const node of document.querySelectorAll("p[t], p[d]")) {
      const t = node.getAttribute("t")
      const d = node.getAttribute("d")
      if (!t || !d) continue
      const text = decodeEntities(node.textContent ?? "").trim()
      if (text) items.push({ text, offset: parseInt(t, 10), duration: parseInt(d, 10) })
    }
    if (items.length > 0) return items
    for (const node of document.querySelectorAll("text[start][dur]")) {
      const start = node.getAttribute("start")
      const dur = node.getAttribute("dur")
      if (!start || !dur) continue
      const text = decodeEntities(node.textContent ?? "").trim()
      if (text) {
        items.push({
          text,
          offset: Math.round(parseFloat(start) * 1000),
          duration: Math.round(parseFloat(dur) * 1000),
        })
      }
    }
    return items
  } catch {
    return []
  }
}
