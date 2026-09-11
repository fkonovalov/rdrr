import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parse } from "../dist/index.mjs"

const corpus = JSON.parse(await readFile(new URL("reddit-posts.json", import.meta.url), "utf8"))
const output = resolve(process.argv[2] ?? ".Codex/reddit-live")
await mkdir(output, { recursive: true })
assert.ok(new Set(corpus.map(({ id }) => id)).size >= 20)
const normalize = (text) =>
  text
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
const nativeFetch = globalThis.fetch
const results = []

for (const post of corpus) {
  const requests = []
  const captures = []
  const started = Date.now()
  globalThis.fetch = async (...args) => {
    const response = await nativeFetch(...args)
    const request = {
      url: String(args[0]),
      status: response.status,
      remaining: response.headers.get("x-ratelimit-remaining"),
      reset: response.headers.get("x-ratelimit-reset"),
    }
    requests.push(request)
    if (response.ok) {
      const filename = `${post.id}.attempt-${requests.length}.xml`
      captures.push(
        response
          .clone()
          .text()
          .then(async (xml) => {
            await writeFile(resolve(output, filename), xml)
            return xml
          })
          .catch((error) => {
            request.captureError = String(error)
            return ""
          }),
      )
    }
    return response
  }
  try {
    const result = await parse(post.url, { timeoutMs: 120000 })
    await writeFile(resolve(output, `${post.id}.md`), result.content)
    assert.equal(result.title, post.title)
    assert.equal(result.author, post.author)
    assert.equal(result.siteName.toLowerCase(), `r/${post.sub}`.toLowerCase())
    assert.ok(result.content.trim().length > 0)
    for (const marker of post.checks) {
      assert.ok(normalize(result.content).includes(normalize(marker)), `Missing post content: ${marker}`)
    }
    const xml = (await Promise.all(captures)).filter(Boolean).at(-1)
    assert.ok(xml, "No complete feed captured")
    await writeFile(resolve(output, `${post.id}.xml`), xml)
    const comments = [...xml.matchAll(/<id>t1_[a-z0-9]+<\/id>/g)].length
    assert.equal((result.content.match(/^> \*\*[^*\n]+\*\* ·/gm) ?? []).length, comments)
    if (comments) assert.ok(result.content.includes("## Comments"))
    results.push({ ...post, passed: true, words: result.wordCount, comments, ms: Date.now() - started, requests })
    console.log(
      `PASS ${results.length}/${corpus.length} ${post.sub}/${post.id} words=${result.wordCount} comments=${comments}`,
    )
  } catch (error) {
    results.push({
      ...post,
      passed: false,
      error: String(error),
      cause: error.cause ? String(error.cause) : undefined,
      ms: Date.now() - started,
      requests,
    })
    console.log(`FAIL ${results.length}/${corpus.length} ${post.sub}/${post.id}: ${error}`)
  } finally {
    globalThis.fetch = nativeFetch
    await Promise.all(captures)
  }
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2),
  )
}

const passed = results.filter((result) => result.passed).length
console.log(`${passed}/${corpus.length} passed. Results: ${output}`)
assert.equal(passed, corpus.length)
