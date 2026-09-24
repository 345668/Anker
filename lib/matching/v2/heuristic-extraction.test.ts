/**
 * The fallback reads the deck (docs/architecture/22 §5).
 *
 * It runs whenever no AI provider answers — a rate limit, a missing key, a
 * refused model — which is not rare. It used to read a sports-and-health deck
 * as ["ai"], lose an ask written "RAISING $1MM", and never attempt a location,
 * so the profile it produced could not run a match.
 */
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { extractStartupProfile, nameFromText, sentencesFrom } from "./document-extractor"

/** Shaped like a real deck: a repeated name, a market, an ask, page furniture. */
const DECK = `
Northwind Sports · Pre-seed investment opportunity
Page 1
Northwind Sports is a HIPAA-compliant sports performance platform where coaches author training programmes for their athletes.
Coaches drown in administrative work. Northwind Sports replaces spreadsheets and outdated software with one system of record.
Our customers are collegiate athletic departments and professional clubs across the United States.
The platform is delivered as SaaS and uses machine learning to suggest programme adjustments.
Page 13
RAISING $1MM. SAFE, $8MM POST-MONEY VAL CAP.
CONFIDENTIAL
`

const file = (text: string) => ({ name: "northwind-deck.pdf", contentType: "text/plain", base64: "", text })

/** No provider configured, so extraction falls through to the heuristic path. */
async function heuristic(text: string, hints: Record<string, unknown> = {}) {
  return extractStartupProfile(file(text) as any, [], hints as any)
}

describe("the heuristic fallback", () => {
  it("reads the deck's sectors from the shared vocabulary, not a short regex list", async () => {
    const out = await heuristic(DECK)
    // The defect: this deck used to come back as ["ai"] alone.
    expect(out.sectors).toContain("sports")
    expect(out.sectors).toContain("healthcare")
    expect(out.sectors!.length).toBeGreaterThan(1)
    // Markets lead, delivery models follow (doc 21 §3).
    expect(out.primarySector).toBe("sports")
  })

  it("recovers an ask written the way decks actually write it", async () => {
    expect((await heuristic(DECK)).askAmount).toBe(1_000_000)
    expect((await heuristic("We are raising $750K on a SAFE.")).askAmount).toBe(750_000)
    expect((await heuristic("Raising €2.5m to reach profitability.")).askAmount).toBe(2_500_000)
    expect((await heuristic("A deck that never mentions a round.")).askAmount).toBeUndefined()
  })

  it("reads the valuation separately from the ask", async () => {
    expect((await heuristic(DECK)).preMoneyValuation).toBe(8_000_000)
  })

  it("recovers the country the deck names, and invents none when it does not", async () => {
    expect((await heuristic(DECK)).location).toMatch(/United States/i)
    expect((await heuristic("A deck with no geography at all, only product talk about scheduling.")).location).toBeUndefined()
  })

  it("takes the stage from the document", async () => {
    expect((await heuristic(DECK)).stage).toBe("pre-seed")
  })

  it("quotes the deck rather than composing prose", async () => {
    const out = await heuristic(DECK)
    // The rule that keeps a heuristic honest: every sentence it returns is in
    // the document.
    expect(out.oneLiner).toBeTruthy()
    expect(DECK).toContain(out.oneLiner!)
    for (const sentence of (out.description ?? "").split(/(?<=\.)\s+/).filter(Boolean)) {
      expect(DECK).toContain(sentence)
    }
  })

  it("keeps saying it is a heuristic", async () => {
    const out = await heuristic(DECK)
    expect(out.confidence).toBe(0.3)
    expect(out.notes).toMatch(/quoted, never composed/i)
  })

  it("is stable: the same text gives the same fields", async () => {
    const a = await heuristic(DECK)
    const b = await heuristic(DECK)
    expect(b).toEqual(a)
  })
})

describe("nameFromText", () => {
  it("takes the name the deck repeats", () => {
    expect(nameFromText(DECK, ["northwind-deck.pdf"])).toBe("Northwind")
  })

  it("ignores the words every deck capitalises", () => {
    const text = "Team. Market. Problem. Solution. Traction. The Ask. Vision. Team. Market. Problem."
    // Nothing distinctive recurs, so it uses the file's own name.
    expect(nameFromText(text, ["acme-pitch.pdf"])).toBe("acme pitch")
  })

  it("has nothing to offer when there is nothing to read", () => {
    expect(nameFromText("", [])).toBeUndefined()
  })
})

describe("sentencesFrom", () => {
  it("skips page furniture and shouty banners", () => {
    const out = sentencesFrom(DECK, 4)
    expect(out.some((s) => /^Page \d/.test(s))).toBe(false)
    expect(out).not.toContain("CONFIDENTIAL")
    expect(out).not.toContain("RAISING $1MM. SAFE, $8MM POST-MONEY VAL CAP.")
  })

  it("returns nothing rather than fragments", () => {
    expect(sentencesFrom("Too short.", 3)).toEqual([])
  })
})
