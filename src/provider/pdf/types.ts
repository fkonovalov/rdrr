export interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}

export interface LineItem {
  text: string
  height: number
  y: number
  isSmall: boolean
}

export type LineRole = "h1" | "h2" | "p" | "small" | "blockquote"

export interface FontStats {
  mean: number
  stddev: number
  bodyHeight: number
}

export interface PageLines {
  lines: LineItem[]
  pageNum: number
}
