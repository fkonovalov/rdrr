import { countWords, estimateReadTime, mergeSignals } from "@shared"
import type { ParseOptions, StackOverflowResult } from "../types"
import { extractStackOverflowRef } from "../detect"
import { toMarkdown } from "../extract/markdown"

const DEFAULT_TIMEOUT_MS = 25000
const API = "https://api.stackexchange.com/2.3"
// stackoverflow.com blocks plain HTTP clients with 403, so we go through the
// StackExchange API instead (anonymous quota: 300 requests/day per IP).
const MAX_ANSWERS = 10

interface SoUser {
  display_name?: string
}

interface SoQuestion {
  title: string
  body: string
  owner?: SoUser
  creation_date: number
  score: number
  tags: string[]
  is_answered: boolean
  answer_count: number
}

interface SoAnswer {
  body: string
  owner?: SoUser
  creation_date: number
  score: number
  is_accepted: boolean
}

interface SoResponse<T> {
  items: T[]
  quota_remaining?: number
  error_id?: number
  error_name?: string
  error_message?: string
}

export const parseStackOverflow = async (url: string, options?: ParseOptions): Promise<StackOverflowResult> => {
  const ref = extractStackOverflowRef(url)
  if (!ref) throw new Error(`Not a Stack Overflow question URL: ${url}`)

  const signal = mergeSignals(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal)
  const common = "site=stackoverflow&filter=withbody"

  // /a/<id> answer permalinks resolve to their parent question first.
  const id = ref.kind === "answer" ? await resolveQuestionId(ref.id, signal) : ref.id

  const [question, answers] = await Promise.all([
    fetchItems<SoQuestion>(`${API}/questions/${id}?${common}`, signal).then(([q]) => q),
    fetchItems<SoAnswer>(
      `${API}/questions/${id}/answers?${common}&sort=votes&order=desc&pagesize=${MAX_ANSWERS}`,
      signal,
    ),
  ])

  if (!question) throw new Error(`Stack Overflow question ${id} not found`)

  const title = decodeEntities(question.title)
  const author = question.owner?.display_name ?? "unknown"
  const published = new Date(question.creation_date * 1000).toISOString()

  const lines: string[] = [
    `# ${title}`,
    "",
    [
      `**Question** by **${author}**`,
      `**Score:** ${question.score}`,
      `**Created:** ${published.split("T")[0]}`,
      ...(question.tags.length > 0 ? [`**Tags:** ${question.tags.join(", ")}`] : []),
    ].join(" · "),
    "",
    "---",
    "",
    toMarkdown(question.body),
    "",
  ]

  if (answers.length > 0) {
    const suffix = question.answer_count > answers.length ? ` of ${question.answer_count}, top-voted` : ""
    lines.push("---", "", `## Answers (${answers.length}${suffix})`, "")
    for (const a of answers) {
      const badge = a.is_accepted ? " ✅ accepted" : ""
      const who = a.owner?.display_name ?? "unknown"
      lines.push(`### ${who} · ${a.score} points${badge}`, "", toMarkdown(a.body), "")
    }
  }

  const content = lines.join("\n")
  const wc = countWords(content)

  return {
    type: "stackoverflow",
    title,
    author,
    content,
    description: toMarkdown(question.body).replace(/\s+/g, " ").trim().slice(0, 140),
    domain: "stackoverflow.com",
    siteName: "Stack Overflow",
    published,
    wordCount: wc,
    readTime: estimateReadTime(wc, options?.wordsPerMinute),
    questionId: id,
    score: question.score,
    isAnswered: question.is_answered,
  }
}

const resolveQuestionId = async (answerId: string, signal: AbortSignal): Promise<string> => {
  const [answer] = await fetchItems<{ question_id: number }>(`${API}/answers/${answerId}?site=stackoverflow`, signal)
  if (!answer) throw new Error(`Stack Overflow answer ${answerId} not found`)
  return String(answer.question_id)
}

const fetchItems = async <T>(url: string, signal: AbortSignal): Promise<T[]> => {
  const res = await fetch(url, { headers: { "User-Agent": "rdrr/1.0 (reader)" }, signal })
  // StackExchange reports errors as JSON with error_name even on non-2xx,
  // so inspect the body before deciding: a 400 can be a throttle violation
  // or just a malformed id.
  const data = (await res.json().catch(() => null)) as SoResponse<T> | null
  if (!res.ok || !data || data.error_id) {
    const detail = data?.error_message ?? `HTTP ${res.status}`
    if (res.status === 429 || data?.error_name === "throttle_violation" || detail.includes("throttle")) {
      throw new Error("StackExchange API quota exceeded (anonymous limit: 300 requests/day per IP). Try again later.")
    }
    throw new Error(`StackExchange API error: ${detail}`)
  }
  return data.items
}

// API titles come HTML-encoded (e.g. `&quot;`), bodies are HTML and go
// through toMarkdown which already handles entities.
const decodeEntities = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
