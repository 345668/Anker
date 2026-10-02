import { describe, it, expect } from "vitest"
import { extractJsonObject, repairLenient } from "./json-extract"

describe("extractJsonObject: quirks models emit", () => {
  it("accepts clean, fenced and prefaced JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJsonObject('Here you go:\n{"a":1}\nHope that helps')).toEqual({ a: 1 })
  })
  it("repairs a thousands-separated number in a value position", () => {
    expect(extractJsonObject('{"raise": 1,500,000, "arr": 84,000.5, "team": 5}')).toEqual({ raise: 1500000, arr: 84000.5, team: 5 })
  })
  it("repairs comments, raw newlines in strings, and NaN / undefined", () => {
    const raw = '{\n  // the ask\n  "ask": "line one\nline two", /* note */ "mrr": NaN, "x": undefined,\n}'
    expect(extractJsonObject(raw)).toEqual({ ask: "line one\nline two", mrr: null, x: null })
  })
  it("leaves string contents alone", () => {
    expect(extractJsonObject('{"note": "value is undefined; raised 1,500,000, then more // not a comment"}'))
      .toEqual({ note: "value is undefined; raised 1,500,000, then more // not a comment" })
  })
  it("still returns null for text that is not JSON", () => {
    expect(extractJsonObject("no json here")).toBeNull()
  })
  it("repairLenient leaves valid JSON valid", () => {
    const v = { a: [1, 2, { b: "x,y" }], c: null }
    expect(JSON.parse(repairLenient(JSON.stringify(v)))).toEqual(v)
  })
})
