import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: () => [] }))
import { keywordPatterns } from "./tools"

describe("keywordPatterns", () => {
  it("splits a phrase into words and drops ones that fit every firm", () => {
    expect(keywordPatterns("climate-tech")).toEqual(["%climate%"])
    expect(keywordPatterns("seed-stage climate tech investors")).toEqual(["%climate%"])
    expect(keywordPatterns("sports betting")).toEqual(["%sports%", "%betting%"])
  })
  it("keeps a lone generic word rather than searching for nothing", () => {
    expect(keywordPatterns("tech")).toEqual(["%tech%"])
  })
  it("no keyword means no filter", () => {
    expect(keywordPatterns("")).toBeNull()
    expect(keywordPatterns(undefined)).toBeNull()
  })
})
