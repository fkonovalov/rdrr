export const cleanSegmentText = (text: string): string =>
  text
    .replace(/>{1,}\s*/g, "")
    .replace(/<{1,}\s*/g, "")
    .replace(/[♪♫♬♩🎵🎶]+/gu, "")
    .replace(/\[\s*[^\d[\]]{0,30}\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
