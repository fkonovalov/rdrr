import { afterEach, describe, expect, it, vi } from "vitest"
import { parseHtml } from "../../../provider/web"

const URL = "https://www.reddit.com/r/ricohGR/comments/1wd9yit/gr_snap_14/"
const POST = `<html><body><shreddit-post author="photographer">
  <h1>GR Snap 1.4 is out</h1><div slot="text-body"><p>New camera recipes are available.</p></div>
</shreddit-post></body></html>`

afterEach(() => vi.unstubAllGlobals())

describe("Reddit fallback", () => {
  it("preserves the original post when old Reddit returns a login page with HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html><body><h1>Welcome to Reddit</h1></body></html>")),
    )
    const result = await parseHtml(POST, { url: URL })
    expect(result.title).toBe("GR Snap 1.4 is out")
    expect(result.content).toContain("New camera recipes are available.")
  })

  it("rejects a browser check when old Reddit also returns no post", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html><body><h1>Welcome to Reddit</h1></body></html>")),
    )
    await expect(
      parseHtml("<html><head><title>Reddit</title></head><body></body></html>", { url: URL }),
    ).rejects.toThrow("Reddit did not return a post")
  })

  it("still extracts an old Reddit post and its comments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(`<html><body>
      <div class="thing link" data-author="photographer" data-subreddit="ricohGR">
        <a class="title">GR Snap 1.4 is out</a>
        <div class="usertext-body"><div class="md"><p>New camera recipes are available.</p></div></div>
      </div>
      <div class="commentarea"><div class="sitetable"><div class="thing comment" data-author="reader">
        <div class="entry"><div class="usertext-body"><div class="md"><p>Thanks for the update!</p></div></div></div>
      </div></div></div>
    </body></html>`),
      ),
    )
    const result = await parseHtml(POST, { url: URL })
    expect(result.content).toContain("New camera recipes are available.")
    expect(result.content).toContain("Thanks for the update!")
    expect(result.siteName).toBe("r/ricohGR")
  })
})
