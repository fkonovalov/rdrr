export const MAX_INPUT_BYTES = 20 * 1024 * 1024

export const assertInputSize = (bytes: number, limit = MAX_INPUT_BYTES): void => {
  if (bytes <= limit) return
  const error = new Error(`Input exceeds the ${limit}-byte limit. Use a smaller document or split the input.`)
  error.name = "InputTooLargeError"
  throw error
}

export const readStreamText = async (
  stream: AsyncIterable<Uint8Array | string>,
  limit = MAX_INPUT_BYTES,
): Promise<string> => {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of stream) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk
    total += bytes.byteLength
    assertInputSize(total, limit)
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString("utf8")
}

export const readResponseText = async (response: Response, limit = MAX_INPUT_BYTES): Promise<string> => {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel()
    assertInputSize(Number(response.headers.get("content-length")), limit)
  }
  if (!response.body) return ""
  return readStreamText(response.body, limit)
}

export const readResponseJson = async (response: Response): Promise<unknown> =>
  JSON.parse(await readResponseText(response)) as unknown
