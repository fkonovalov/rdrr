import { afterEach, describe, expect, it, vi } from "vitest"
import { parseStackOverflow } from "../stackoverflow"

const makeFetch = (responders: Record<string, () => Response>): void => {
  const patterns = Object.keys(responders).sort((a, b) => b.length - a.length)
  const spy = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (input) => {
    const url = typeof input === "string" ? input : input.toString()
    const match = patterns.find((pattern) => url.includes(pattern))
    if (!match) throw new Error(`unexpected fetch: ${url}`)
    return responders[match]!()
  })
  vi.stubGlobal("fetch", spy)
}

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const QUESTION = {
  title: "Why is &quot;foo&quot; faster?",
  body: "<p>Some <code>code</code> question.</p>",
  owner: { display_name: "asker" },
  creation_date: 1340805096,
  score: 27539,
  tags: ["java", "performance"],
  is_answered: true,
  answer_count: 2,
}

const ANSWERS = [
  {
    body: "<p>Because of <strong>branch prediction</strong>.</p>",
    owner: { display_name: "expert" },
    creation_date: 1340805200,
    score: 35000,
    is_accepted: true,
  },
]

describe("parseStackOverflow", () => {
  it("renders question, metadata, and answers as markdown", async () => {
    makeFetch({
      "/questions/11227809/answers": () => jsonResponse({ items: ANSWERS }),
      "/questions/11227809?": () => jsonResponse({ items: [QUESTION] }),
    })

    const result = await parseStackOverflow("https://stackoverflow.com/questions/11227809/why-is-foo")
    expect(result.type).toBe("stackoverflow")
    expect(result.title).toBe('Why is "foo" faster?')
    expect(result.author).toBe("asker")
    expect(result.questionId).toBe("11227809")
    expect(result.isAnswered).toBe(true)
    expect(result.content).toContain("**Score:** 27539")
    expect(result.content).toContain("**Tags:** java, performance")
    expect(result.content).toContain("Some `code` question.")
    expect(result.content).toContain("## Answers (1 of 2, top-voted)")
    expect(result.content).toContain("### expert · 35000 points ✅ accepted")
    expect(result.content).toContain("**branch prediction**")
  })

  it("throws not-found when the question is missing", async () => {
    makeFetch({
      "/answers": () => jsonResponse({ items: [] }),
      "/questions/404": () => jsonResponse({ items: [] }),
    })
    await expect(parseStackOverflow("https://stackoverflow.com/questions/404/gone")).rejects.toThrow(/not found/i)
  })

  it("throws quota error on throttle violation", async () => {
    const throttle = (): Response =>
      new Response(
        JSON.stringify({ error_id: 502, error_name: "throttle_violation", error_message: "too many requests" }),
        { status: 400, headers: { "content-type": "application/json" } },
      )
    makeFetch({ "/answers": throttle, "/questions/1?": throttle })
    await expect(parseStackOverflow("https://stackoverflow.com/questions/1/x")).rejects.toThrow(/quota/i)
  })

  it("throws detailed error on non-throttle API failure", async () => {
    const bad = (): Response =>
      new Response(JSON.stringify({ error_id: 400, error_name: "bad_parameter", error_message: "ids" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    makeFetch({ "/answers": bad, "/questions/1?": bad })
    await expect(parseStackOverflow("https://stackoverflow.com/questions/1/x")).rejects.toThrow(
      /StackExchange API error: ids/,
    )
  })

  it("resolves /a/ answer permalinks to their parent question", async () => {
    makeFetch({
      "/answers/9999?": () => jsonResponse({ items: [{ question_id: 11227809 }] }),
      "/questions/11227809/answers": () => jsonResponse({ items: ANSWERS }),
      "/questions/11227809?": () => jsonResponse({ items: [QUESTION] }),
    })

    const result = await parseStackOverflow("https://stackoverflow.com/a/9999")
    expect(result.questionId).toBe("11227809")
    expect(result.title).toBe('Why is "foo" faster?')
    expect(result.content).toContain("**branch prediction**")
  })

  it("rejects non-question urls", async () => {
    await expect(parseStackOverflow("https://stackoverflow.com/users/1/someone")).rejects.toThrow(
      /Not a Stack Overflow question/,
    )
  })
})
