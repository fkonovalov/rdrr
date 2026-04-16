import { describe, expect, it } from "vitest"
import { escapeHtml, isDangerousUrl } from "../dom"

describe("escapeHtml", () => {
  it("escapes ampersand, angle brackets, and double quote", () => {
    expect(escapeHtml("&")).toBe("&amp;")
    expect(escapeHtml("<")).toBe("&lt;")
    expect(escapeHtml(">")).toBe("&gt;")
    expect(escapeHtml('"')).toBe("&quot;")
  })

  it("escapes in order (ampersand first)", () => {
    expect(escapeHtml("&<>")).toBe("&amp;&lt;&gt;")
  })

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("hello world")).toBe("hello world")
  })

  it("handles nested patterns", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;")
  })
})

describe("isDangerousUrl", () => {
  it("flags javascript: scheme", () => {
    expect(isDangerousUrl("javascript:alert(1)")).toBe(true)
    expect(isDangerousUrl("JAVASCRIPT:alert(1)")).toBe(true)
    expect(isDangerousUrl("  javascript:alert(1)")).toBe(true)
  })

  it("flags vbscript, livescript, mocha", () => {
    expect(isDangerousUrl("vbscript:msgbox(1)")).toBe(true)
    expect(isDangerousUrl("livescript:foo()")).toBe(true)
    expect(isDangerousUrl("mocha:bar()")).toBe(true)
  })

  it("flags data: html/svg/xhtml/msdownload", () => {
    expect(isDangerousUrl("data:text/html,<script>")).toBe(true)
    expect(isDangerousUrl("data:image/svg+xml,<svg>")).toBe(true)
    expect(isDangerousUrl("data:application/xhtml+xml,<html>")).toBe(true)
    expect(isDangerousUrl("data:application/x-msdownload,...")).toBe(true)
  })

  it("strips control characters used to obfuscate schemes", () => {
    expect(isDangerousUrl("java\x00script:alert(1)")).toBe(true)
    expect(isDangerousUrl("java\tscript:alert(1)")).toBe(true)
    expect(isDangerousUrl("java\nscript:alert(1)")).toBe(true)
  })

  it("allows http, https, mailto, tel, fragments", () => {
    expect(isDangerousUrl("https://example.com")).toBe(false)
    expect(isDangerousUrl("http://example.com")).toBe(false)
    expect(isDangerousUrl("mailto:a@b.com")).toBe(false)
    expect(isDangerousUrl("tel:+1234")).toBe(false)
    expect(isDangerousUrl("#anchor")).toBe(false)
  })

  it("allows inline image data URLs that aren't executable", () => {
    expect(isDangerousUrl("data:image/png;base64,iVBOR...")).toBe(false)
    expect(isDangerousUrl("data:image/jpeg;base64,...")).toBe(false)
  })

  it("allows relative paths", () => {
    expect(isDangerousUrl("/path")).toBe(false)
    expect(isDangerousUrl("./relative")).toBe(false)
  })
})
