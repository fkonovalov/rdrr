import { describe, expect, it, vi } from "vitest"
import { parseHtml } from "../../provider/web"
import { MAX_INPUT_BYTES, readResponseText, readStreamText } from "../body"

describe("bounded input", () => {
  it("cancels a chunked stream as soon as decoded bytes exceed the limit", async () => {
    const cancel = vi.fn<() => void>()
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(16))
      },
      cancel,
    })
    await expect(readResponseText(new Response(body), 32)).rejects.toMatchObject({ name: "InputTooLargeError" })
    expect(cancel).toHaveBeenCalledOnce()
    expect(pulls).toBeLessThanOrEqual(4)
  })

  it("rejects oversized declared bodies without consuming them", async () => {
    const cancel = vi.fn<() => void>()
    const body = new ReadableStream<Uint8Array>({ cancel })
    await expect(readResponseText(new Response(body, { headers: { "content-length": "100" } }), 32)).rejects.toThrow(
      "32-byte limit",
    )
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("counts UTF-8 bytes and preserves characters split across chunks", async () => {
    const bytes = Buffer.from("Привет😀")
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 3))
          controller.enqueue(bytes.subarray(3))
          controller.close()
        },
      })
    await expect(readStreamText(stream(), bytes.length)).resolves.toBe("Привет😀")
    await expect(readStreamText(stream(), bytes.length - 1)).rejects.toMatchObject({ name: "InputTooLargeError" })
  })

  it("rejects raw HTML before DOM parsing", async () => {
    await expect(parseHtml("x".repeat(MAX_INPUT_BYTES + 1))).rejects.toMatchObject({ name: "InputTooLargeError" })
  })
})
