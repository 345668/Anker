import { describe, it, expect } from "vitest"
import { extractJsonObject, repairLenient, closeUnclosedArrays } from "./json-extract"

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

  it("closes a string array that was never closed before the next key (real model output shape)", () => {
    const raw = '{\n  "name": "TEST CO",\n  "evidence": ["Match rate 96%", "Match rate 96% - month-end close in 2 days instead of 9",\n    "founderBios": "ex-DATEV and ex-Stripe",\n    "pitchDeckSummary": "x"\n}'
    expect(extractJsonObject(raw)).toEqual({
      name: "TEST CO",
      evidence: ["Match rate 96%", "Match rate 96% - month-end close in 2 days instead of 9"],
      founderBios: "ex-DATEV and ex-Stripe",
      pitchDeckSummary: "x",
    })
  })
  it("handles that slip together with other quirks, and several of them", () => {
    const raw = '{"a": ["x", "y",\n "b": 1,500,\n "c": ["p", "q",\n "d": "ok"}'
    expect(extractJsonObject(raw)).toEqual({ a: ["x", "y"], b: 1500, c: ["p", "q"], d: "ok" })
  })
  it("never alters valid JSON, including strings that look like keys", () => {
    const v = { list: ["a: b", "c"], nested: [{ k: "v" }, { k: "w" }], s: 'he said "x": y' }
    expect(closeUnclosedArrays(JSON.stringify(v))).toBe(JSON.stringify(v))
  })
})
