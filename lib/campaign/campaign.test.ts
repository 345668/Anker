import { describe, it, expect } from "vitest"
import { toStartupStage } from "./util"
import { assembleEmail } from "./draft"
import type { StartupProfile } from "@/lib/matching/v2/founder-types"

describe("toStartupStage", () => {
  it("maps common form labels to the engine enum", () => {
    expect(toStartupStage("Pre-seed")).toBe("pre-seed")
    expect(toStartupStage("pre seed")).toBe("pre-seed")
    expect(toStartupStage("Seed")).toBe("seed")
    expect(toStartupStage("Series A")).toBe("series-a")
    expect(toStartupStage("series_b")).toBe("series-b")
  })
  it("folds growth / late stage into series-b and defaults unknowns to seed", () => {
    expect(toStartupStage("Growth")).toBe("series-b")
    expect(toStartupStage("Series C")).toBe("series-b")
    expect(toStartupStage("")).toBe("seed")
    expect(toStartupStage(null)).toBe("seed")
    expect(toStartupStage("whatever")).toBe("seed")
  })
})

describe("assembleEmail", () => {
  const startup = { name: "Acme", oneLiner: "Robots for warehouses" } as StartupProfile
  const base = {
    startup,
    investorName: "Dana",
    yesUrl: "https://x/i/tok?a=yes",
    noUrl: "https://x/i/tok?a=no",
    viewUrl: "https://x/i/tok?a=view",
  }

  it("parses LLM JSON and appends CTA links + signature", () => {
    const out = assembleEmail({ ...base, llmJson: '{"subject":"Intro: Acme","body":"Hi Dana, quick intro."}' })
    expect(out.subject).toBe("Intro: Acme")
    expect(out.body).toContain("Hi Dana, quick intro.")
    expect(out.body).toContain("https://x/i/tok?a=yes")
    expect(out.body).toContain("https://x/i/tok?a=no")
    expect(out.body).toContain("https://x/i/tok?a=view")
    // signature block from lib/email/signature
    expect(out.body).toContain("Philippe M. Masindet")
    expect(out.body).toContain("https://www.linkedin.com/in/philippe-m-masindet/")
  })

  it("falls back to a safe subject/body when the LLM output is unparseable", () => {
    const out = assembleEmail({ ...base, llmJson: "not json at all" })
    expect(out.subject).toBe("Intro: Acme")
    expect(out.body).toContain("Acme")
    expect(out.body).toContain("https://x/i/tok?a=yes")
    expect(out.body).toContain("Philippe M. Masindet")
  })

  it("caps an overlong subject", () => {
    const long = "x".repeat(200)
    const out = assembleEmail({ ...base, llmJson: JSON.stringify({ subject: long, body: "hi" }) })
    expect(out.subject.length).toBeLessThanOrEqual(120)
  })
})
