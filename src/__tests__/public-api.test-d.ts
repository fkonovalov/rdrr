import { expectTypeOf, it } from "vitest"
import { parse, type ParseResult, type ParsedResult, type TranscriptSegment, type XStatusResult } from "../index"

it("narrows parsed results while preserving compatibility with the common interface", () => {
  expectTypeOf<Awaited<ReturnType<typeof parse>>>().toEqualTypeOf<ParsedResult>()
  expectTypeOf<ParsedResult>().toExtend<ParseResult>()
  expectTypeOf<Extract<ParsedResult, { type: "youtube" }>["transcript"]>().toEqualTypeOf<TranscriptSegment[]>()
  expectTypeOf<Extract<ParsedResult, { type: "x-status" }>>().toEqualTypeOf<XStatusResult>()
})
