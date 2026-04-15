import type { RawChapter, RawItem, VideoMetadata } from "./types"

const INNERTUBE_API = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
const INNERTUBE_NEXT = "https://www.youtube.com/youtubei/v1/next?prettyPrint=false"
const INNERTUBE_VERSION = "20.10.38"
const ANDROID_CONTEXT = { client: { clientName: "ANDROID", clientVersion: INNERTUBE_VERSION } }
const WEB_CONTEXT = { client: { clientName: "WEB", clientVersion: "2.20240101.00.00" } }
const ANDROID_UA = `com.google.android.youtube/${INNERTUBE_VERSION} (Linux; U; Android 14)`

export const fetchMetadata = async (videoId: string): Promise<VideoMetadata> => {
  const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
  if (!res.ok) throw new Error(`Video not found (${res.status})`)
  const data = (await res.json()) as { title: string; author_name: string; thumbnail_url: string }
  return {
    title: data.title ?? "",
    author: data.author_name ?? "",
    thumbnailUrl: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

export const fetchTranscript = async (videoId: string): Promise<RawItem[]> => {
  const playerData = await fetchPlayerData(videoId)
  if (!playerData) throw new Error("FETCH_FAILED")
  const tracks = getCaptionTracks(playerData)
  if (tracks.length === 0) throw new Error("NO_CAPTIONS")
  const track = pickTrack(tracks, playerData)
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
  const res = await fetch(INNERTUBE_NEXT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, context: WEB_CONTEXT }),
  })
  if (!res.ok) return []
  const data = (await res.json()) as Record<string, unknown>
  const panels = (data as { engagementPanels?: unknown[] }).engagementPanels ?? []
  for (const panel of panels) {
    const contents = (panel as Record<string, unknown>)?.engagementPanelSectionListRenderer as
      | Record<string, unknown>
      | undefined
    const markers = (contents?.content as Record<string, unknown>)?.macroMarkersListRenderer as
      | Record<string, unknown>
      | undefined
    const items = markers?.contents
    if (!Array.isArray(items)) continue
    const chapters: RawChapter[] = []
    for (const item of items) {
      const r = (item as Record<string, unknown>)?.macroMarkersListItemRenderer as Record<string, unknown> | undefined
      const title = (r?.title as Record<string, unknown>)?.simpleText as string | undefined
      const timeStr = (r?.timeDescription as Record<string, unknown>)?.simpleText as string | undefined
      if (!title || !timeStr) continue
      const parts = timeStr.split(":").map(Number)
      const seconds = parts.length === 3 ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]! : parts[0]! * 60 + parts[1]!
      chapters.push({ title, startTime: seconds })
    }
    if (chapters.length > 1) return chapters
  }
  return []
}

const fetchPlayerData = async (videoId: string): Promise<unknown | undefined> => {
  try {
    const res = await fetch(INNERTUBE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ context: ANDROID_CONTEXT, videoId }),
    })
    if (res.ok) {
      const data = await res.json()
      if (getCaptionTracks(data).length > 0) return data
    }
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === "TimeoutError") return undefined
  }
  try {
    const res = await fetch(INNERTUBE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ context: WEB_CONTEXT, videoId }),
    })
    if (res.ok) {
      const data = await res.json()
      if (getCaptionTracks(data).length > 0) return data
    }
  } catch {}
  return undefined
}

const getCaptionTracks = (data: unknown): Array<{ languageCode?: string; baseUrl?: string }> => {
  const tracks = (data as Record<string, unknown>)?.captions as Record<string, unknown> | undefined
  const list = tracks?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined
  const arr = list?.captionTracks
  return Array.isArray(arr) ? arr : []
}

const pickTrack = (
  tracks: Array<{ languageCode?: string; baseUrl?: string }>,
  playerData: unknown,
): { baseUrl?: string } | undefined => {
  const details = (playerData as Record<string, unknown>)?.videoDetails as Record<string, unknown> | undefined
  const baseLang = ((details?.defaultAudioLanguage as string) ?? "").split("-")[0]?.toLowerCase() ?? ""
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
  return items
}
