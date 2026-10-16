import { describe, it, expect } from "vitest"
import { inQuietHours, localHour, localDay, DEFAULT_QUIET } from "./quiet"

describe("quiet hours in Berlin time", () => {
  it("is quiet from 22:00 to 07:00 local, in summer time (UTC+2)", () => {
    const at = (h: number, m = 0) => Date.UTC(2026, 6, 15, h, m)
    expect(inQuietHours(at(19, 59))).toBe(false)    // 21:59 Berlin
    expect(inQuietHours(at(20, 0))).toBe(true)      // 22:00
    expect(inQuietHours(at(4, 59))).toBe(true)      // 06:59
    expect(inQuietHours(at(5, 0))).toBe(false)      // 07:00
    expect(localHour(at(20, 30))).toBe(22)
  })
  it("follows winter time (UTC+1) too", () => {
    const at = (h: number, m = 0) => Date.UTC(2026, 0, 15, h, m)
    expect(inQuietHours(at(20, 59))).toBe(false); expect(inQuietHours(at(21, 0))).toBe(true); expect(inQuietHours(at(5, 59))).toBe(true); expect(inQuietHours(at(6, 0))).toBe(false)
  })
  it("reads the local day, so the digest is once per Berlin day, not per UTC day", () => {
    expect(localDay(Date.UTC(2026, 6, 15, 22, 30))).toBe("2026-07-16")   // 00:30 Berlin
    expect(localDay(Date.UTC(2026, 6, 15, 21, 30))).toBe("2026-07-15")
  })
  it("a window that does not wrap, and an empty window", () => {
    expect(inQuietHours(Date.UTC(2026, 6, 15, 11, 0), { start: 13, end: 15, tz: "Europe/Berlin" })).toBe(true)
    expect(inQuietHours(Date.UTC(2026, 6, 15, 10, 0), { start: 13, end: 15, tz: "Europe/Berlin" })).toBe(false)
    expect(inQuietHours(Date.UTC(2026, 6, 15, 1, 0), { ...DEFAULT_QUIET, start: 7, end: 7 })).toBe(false)
  })
})
