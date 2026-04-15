export interface RawItem {
  text: string
  offset: number
  duration: number
}

export interface VideoMetadata {
  title: string
  author: string
  thumbnailUrl: string
}

export interface RawChapter {
  title: string
  startTime: number
}
