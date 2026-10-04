import { describe, it, expect } from "vitest"
import { sanitizeWinAnsi, wrapRuns, groupLines, linesToParas, type TextItem } from "./doc-engines"

const measure = (t: string) => t.length * 6 // 6 units per character

describe("sanitizeWinAnsi", () => {
  it("keeps Western European text, maps typography, replaces what the standard fonts cannot draw", () => {
    expect(sanitizeWinAnsi("Café Müller – “quoted” … 5 €")).toBe('Café Müller - "quoted" ... 5 €')
    expect(sanitizeWinAnsi("中文 ok")).toBe("?? ok")
    expect(sanitizeWinAnsi("a\tb")).toBe("a    b")
  })
})

describe("wrapRuns", () => {
  it("wraps at the width and keeps styles", () => {
    const lines = wrapRuns([{ text: "alpha beta " }, { text: "gamma", bold: true }, { text: " delta" }], 66, measure)
    expect(lines.map((l) => l.map((r) => r.text).join(""))).toEqual(["alpha beta", "gamma delta"])
    expect(lines[1][0]).toMatchObject({ text: "gamma", bold: true })
  })
  it("breaks a word longer than the line so it cannot leave the page", () => {
    const lines = wrapRuns([{ text: "abcdefghijklmnopqrstuvwxyz" }], 60, measure)
    expect(lines.length).toBeGreaterThan(2); for (const l of lines) expect(l.map((r) => r.text).join("").length * 6).toBeLessThanOrEqual(60)
    expect(lines.map((l) => l.map((r) => r.text).join("")).join("")).toBe("abcdefghijklmnopqrstuvwxyz")
  })
  it("empty input gives no lines", () => expect(wrapRuns([{ text: "   " }], 100, measure)).toEqual([]))
})

const it_ = (str: string, x: number, y: number, h = 10): TextItem => ({ str, x, y, h, w: str.length * 5 })

describe("groupLines", () => {
  it("joins fragments on one baseline left to right and orders lines top to bottom", () => {
    const lines = groupLines([it_("world", 40, 700), it_("Hello", 10, 700.5), it_("Second line", 10, 680)])
    expect(lines.map((l) => l.text)).toEqual(["Hello world", "Second line"])
  })
  it("does not add a space inside a word split across fragments", () => {
    expect(groupLines([it_("inter", 10, 700), it_("national", 35, 700)])[0].text).toBe("international")
  })
})

describe("linesToParas", () => {
  const line = (text: string, y: number, h = 10) => ({ text, y, h, x: 10 })
  it("a larger font is a heading, wrapped lines join into one paragraph, a gap starts another", () => {
    const paras = linesToParas([line("Investment Memo", 780, 24), line("The company sells software to", 740), line("hospitals and has two pilots.", 727), line("Second paragraph here.", 690)])
    expect(paras.map((p) => p.kind)).toEqual(["heading", "paragraph", "paragraph"])
    expect(paras[1].text).toBe("The company sells software to hospitals and has two pilots.")
  })
  it("recognises bullets and numbered items and strips the marker", () => {
    const paras = linesToParas([line("Intro text here", 700), line("• First", 680), line("- Second", 665), line("1. Third", 650)])
    expect(paras.filter((p) => p.kind === "bullet").map((p) => p.text)).toEqual(["First", "Second", "Third"])
  })
  it("empty in, empty out", () => expect(linesToParas([])).toEqual([]))
})
