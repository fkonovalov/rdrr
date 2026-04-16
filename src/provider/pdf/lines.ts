import type { LineItem, TextItem } from "./types"

const Y_TOLERANCE = 2

export const reconstructLines = (items: TextItem[]): LineItem[] => {
  if (items.length === 0) return []
  const lines: LineItem[] = []
  let current: { texts: string[]; height: number; y: number } | null = null

  for (const item of items) {
    if (!item.str && !item.hasEOL) continue
    const y = item.transform[5] ?? 0
    const height = Math.abs(item.transform[3] ?? 0)

    if (!current || Math.abs(current.y - y) > Y_TOLERANCE) {
      if (current) {
        const text = current.texts.join("").trim()
        if (text) lines.push({ text, height: current.height, y: current.y, isSmall: false })
      }
      current = { texts: [item.str], height, y }
    } else {
      current.texts.push(item.str)
      if (height > current.height) current.height = height
    }

    if (item.hasEOL && current) {
      const text = current.texts.join("").trim()
      if (text) lines.push({ text, height: current.height, y: current.y, isSmall: false })
      current = null
    }
  }

  if (current) {
    const text = current.texts.join("").trim()
    if (text) lines.push({ text, height: current.height, y: current.y, isSmall: false })
  }

  return lines
}
