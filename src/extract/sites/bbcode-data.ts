import type { SiteExtractor } from "./types"
import { bbcodeToHtml } from "../utils/bbcode"
import { registerSite } from "./registry"

registerSite({
  patterns: [/.*/],
  create: (doc) => {
    const getEventData = (): Record<string, unknown> | null => {
      const raw = doc.querySelector("#application_config")?.getAttribute("data-partnereventstore")
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed[0] : parsed
      } catch {
        return null
      }
    }

    const event = getEventData()
    const body = (event as Record<string, unknown>)?.announcement_body as Record<string, unknown> | undefined

    return {
      canExtract: () => !!body?.body,
      extract: () => {
        const contentHtml = bbcodeToHtml(String(body?.body ?? ""))
        const title = String(body?.headline ?? (event as Record<string, unknown>)?.event_name ?? "")
        const posttime = body?.posttime as number | undefined
        const published = posttime ? new Date(posttime * 1000).toISOString() : ""

        const groupRaw = doc.querySelector("#application_config")?.getAttribute("data-groupvanityinfo")
        let author = ""
        if (groupRaw) {
          try {
            const data = JSON.parse(groupRaw)
            author = (Array.isArray(data) ? data[0] : data)?.group_name ?? ""
          } catch {}
        }

        return {
          content: contentHtml,
          contentHtml,
          variables: { title, author, published },
        }
      },
    } satisfies SiteExtractor
  },
})
