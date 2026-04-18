import { describe, expect, it } from "vitest"
import { detectUrlType, extractVideoId, extractXHandle, extractXStatus, isValidUrl, normalizeUrl } from "../detect"

describe("detectUrlType", () => {
  it("classifies youtube variants", () => {
    expect(detectUrlType("https://www.youtube.com/watch?v=abc123")).toBe("youtube")
    expect(detectUrlType("https://youtube.com/watch?v=abc123")).toBe("youtube")
    expect(detectUrlType("https://youtu.be/abc123")).toBe("youtube")
    expect(detectUrlType("https://m.youtube.com/watch?v=abc123")).toBe("youtube")
  })

  it("classifies github issues and PRs", () => {
    expect(detectUrlType("https://github.com/user/repo/issues/42")).toBe("github-issue")
    expect(detectUrlType("https://github.com/user/repo/pull/7")).toBe("github-issue")
  })

  it("classifies github blob files", () => {
    expect(detectUrlType("https://github.com/user/repo/blob/main/src/index.ts")).toBe("github-file")
  })

  it("classifies pdfs by pathname", () => {
    expect(detectUrlType("https://example.com/report.pdf")).toBe("pdf")
    expect(detectUrlType("https://example.com/REPORT.PDF")).toBe("pdf")
  })

  it("classifies x/twitter profile urls", () => {
    expect(detectUrlType("https://x.com/finnfkonovalov")).toBe("x-profile")
    expect(detectUrlType("https://twitter.com/someone")).toBe("x-profile")
  })

  it("does not classify x reserved paths as profile", () => {
    expect(detectUrlType("https://x.com/home")).toBe("webpage")
    expect(detectUrlType("https://x.com/settings")).toBe("webpage")
  })

  it("classifies x/twitter status urls", () => {
    expect(detectUrlType("https://x.com/someone/status/123")).toBe("x-status")
    expect(detectUrlType("https://twitter.com/handle/status/9876")).toBe("x-status")
    // Routed-by-id form with `i` placeholder for unknown author.
    expect(detectUrlType("https://x.com/i/status/123")).toBe("x-status")
  })

  it("falls back to webpage for anything else", () => {
    expect(detectUrlType("https://example.com")).toBe("webpage")
    expect(detectUrlType("https://react.dev/learn")).toBe("webpage")
  })
})

describe("extractXStatus", () => {
  it("extracts handle + id", () => {
    expect(extractXStatus("https://x.com/someone/status/123")).toEqual({ handle: "someone", id: "123" })
    expect(extractXStatus("https://twitter.com/handle/status/987654321")).toEqual({
      handle: "handle",
      id: "987654321",
    })
  })

  it("supports the /i/status/ canonical form", () => {
    expect(extractXStatus("https://x.com/i/status/123")).toEqual({ handle: null, id: "123" })
  })

  it("returns null for non-status paths", () => {
    expect(extractXStatus("https://x.com/someone")).toBeNull()
    expect(extractXStatus("https://x.com/i/foo/123")).toBeNull()
  })

  it("returns null for non-x hosts", () => {
    expect(extractXStatus("https://example.com/someone/status/1")).toBeNull()
  })
})

describe("extractXHandle", () => {
  it("extracts handle from x/twitter urls", () => {
    expect(extractXHandle("https://x.com/someone")).toBe("someone")
    expect(extractXHandle("https://twitter.com/another")).toBe("another")
    expect(extractXHandle("https://www.x.com/yet_another")).toBe("yet_another")
    expect(extractXHandle("https://x.com/Trailing/")).toBe("Trailing")
  })

  it("returns null for reserved handles", () => {
    expect(extractXHandle("https://x.com/home")).toBeNull()
    expect(extractXHandle("https://x.com/i")).toBeNull()
    expect(extractXHandle("https://x.com/HOME")).toBeNull()
  })

  it("returns null for non-x hosts", () => {
    expect(extractXHandle("https://example.com/someone")).toBeNull()
  })

  it("returns null for multi-segment paths", () => {
    expect(extractXHandle("https://x.com/someone/status/123")).toBeNull()
  })

  it("returns null for invalid urls", () => {
    expect(extractXHandle("not-a-url")).toBeNull()
  })
})

describe("extractVideoId", () => {
  it("extracts from youtu.be short links", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from watch?v= urls", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from /embed/", () => {
    expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from /shorts/", () => {
    expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("returns null when no id present", () => {
    expect(extractVideoId("https://www.youtube.com/")).toBeNull()
    expect(extractVideoId("https://youtu.be/")).toBeNull()
  })

  it("returns null for invalid urls", () => {
    expect(extractVideoId("garbage")).toBeNull()
  })
})

describe("isValidUrl", () => {
  it("accepts http and https", () => {
    expect(isValidUrl("https://example.com")).toBe(true)
    expect(isValidUrl("http://example.com")).toBe(true)
  })

  it("rejects other protocols", () => {
    expect(isValidUrl("javascript:alert(1)")).toBe(false)
    expect(isValidUrl("file:///etc/passwd")).toBe(false)
    expect(isValidUrl("ftp://example.com")).toBe(false)
  })

  it("rejects garbage", () => {
    expect(isValidUrl("not a url")).toBe(false)
    expect(isValidUrl("")).toBe(false)
  })
})

describe("normalizeUrl", () => {
  it("upgrades http to https", () => {
    expect(normalizeUrl("http://example.com/foo")).toBe("https://example.com/foo")
  })

  it("strips hash fragment", () => {
    expect(normalizeUrl("https://example.com/foo#section")).toBe("https://example.com/foo")
  })

  it("strips trailing slash on paths", () => {
    expect(normalizeUrl("https://example.com/foo/")).toBe("https://example.com/foo")
  })

  it("preserves trailing slash on root", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/")
  })

  it("returns raw input for malformed urls", () => {
    expect(normalizeUrl("not a url")).toBe("not a url")
  })

  it("is idempotent", () => {
    const u = "https://example.com/article"
    expect(normalizeUrl(normalizeUrl(u))).toBe(u)
  })
})
