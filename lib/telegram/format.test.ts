import { describe, it, expect } from "vitest"
import { esc, splitText, answerToParts, MAX_MESSAGE } from "./format"

describe("esc", () => { it("escapes the three characters HTML mode reads", () => expect(esc("<b>a & b</b>")).toBe("&lt;b&gt;a &amp; b&lt;/b&gt;")) })
describe("splitText", () => {
  it("leaves short text alone and splits long text at paragraph breaks, never over the limit", () => {
    expect(splitText("short")).toEqual(["short"])
    const para = "Sentence one is here. Sentence two follows. ".repeat(30).trim()
    const parts = splitText(`${para}\n\n${para}\n\n${para}`, 1500)
    expect(parts.length).toBeGreaterThan(1); for (const p of parts) expect(p.length).toBeLessThanOrEqual(1500)
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(`${para} ${para} ${para}`.replace(/\s+/g, " "))
  })
  it("splits text with no break at all, and stays below Telegram's limit by default", () => {
    const parts = splitText("x".repeat(9000)); expect(parts.every((p) => p.length <= 3800)).toBe(true); expect(parts.join("").length).toBe(9000); expect(3800).toBeLessThan(MAX_MESSAGE)
  })
})
describe("answerToParts", () => {
  it("escapes everything the model wrote, so an answer cannot inject markup or a link", () => {
    const [p] = answerToParts('<a href="https://evil.test">click</a> & <script>x</script>', "https://app")
    expect(p).not.toContain("<a "); expect(p).not.toContain("<script"); expect(p).toContain("&lt;a href=")
  })
  it("keeps bold and code as light formatting and nothing else", () => {
    expect(answerToParts("**Katja** moved to `Contacted`", "https://app")[0]).toBe("<b>Katja</b> moved to <code>Contacted</code>")
    expect(answerToParts("[link](https://x.test) __under__", "https://app")[0]).toBe("[link](https://x.test) __under__")
  })
  it("sends at most three parts and points to the app for the rest", () => {
    const long = ("word ".repeat(700) + "\n\n").repeat(8)
    const parts = answerToParts(long, "https://www.an-ker.de/dashboard/anker-ai")
    expect(parts).toHaveLength(4); expect(parts[3]).toContain("full answer is in Anker AI")
  })
  it("an empty answer is a visible placeholder, not an empty message (which Telegram refuses)", () => expect(answerToParts("   ", "https://app")).toEqual(["(no answer)"]))
})
