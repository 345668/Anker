import { describe, it, expect } from "vitest"
import { detectFirms, detectPeople, namesCompatible, isRoleMailbox, MAX_BLOCK, type FirmRec } from "./candidates-core"

const f = (id: string, name: string, website?: string, source = "folk"): FirmRec => ({ id, name, website, source })
const find = (c: ReturnType<typeof detectFirms>, a: string, b: string) => c.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))

describe("firm candidates, on the cases found by hand in production", () => {
  it("Spring Capital in two sources is one firm: probable", () => {
    const c = detectFirms([f("s1", "Spring Capital", "https://springcapital.com", "drop:2026-09-24"), f("s2", "Spring Capital", "springcapital.com", "folk")])
    expect(find(c, "s1", "s2")).toMatchObject({ tier: "probable", suggest: "same" })
    expect(find(c, "s1", "s2")!.score).toBeGreaterThanOrEqual(90)
  })
  it("a name spelled two ways on the same site is probable; the same name on different sites is only possible", () => {
    const same = detectFirms([f("a", "Courtside Ventures LLC", "https://courtside.vc"), f("b", "CourtsideVC", "courtside.vc")])
    expect(find(same, "a", "b")?.tier).toBe("probable")
    const apart = detectFirms([f("a", "Acme Partners", "https://acme-partners.com"), f("b", "Acme Partners", "https://acme.io")])
    expect(find(apart, "a", "b")).toMatchObject({ tier: "possible", evidence: { hostConflict: true } })
  })
  it("a former name stated on the record joins it to the old name: probable", () => {
    const c = detectFirms([f("a", "500 Global (prev 500 Startups)"), f("b", "500 Startups")])
    expect(find(c, "a", "b")?.tier).toBe("probable")
  })
  it("a brand and its programmes on one site are proposed as RELATED, not as the same", () => {
    const c = detectFirms([f("p", "Startupbootcamp", "https://startupbootcamp.org"), f("c1", "Startupbootcamp FinTech London", "https://startupbootcamp.org"), f("c2", "Startupbootcamp Israël", "https://startupbootcamp.org")])
    for (const id of ["c1", "c2"]) expect(find(c, "p", id)).toMatchObject({ tier: "probable", suggest: "related", evidence: { prefix: { short: "startupbootcamp" } } })
  })
  it("different firms that share a generic word, tied only by an acronym record, are never proposed against each other", () => {
    const c = detectFirms([f("1", "Hera Family Office"), f("2", "Hidaka Family Office"), f("3", "Hopp Family Office"), f("4", "Hansmann Family Office"), f("5", "HFO")])
    for (const [x, y] of [["1", "2"], ["1", "3"], ["2", "4"], ["3", "4"]]) expect(find(c, x, y), `${x}-${y}`).toBeUndefined()
  })
  it("an acronym that fits one full name is possible; one that fits many proposes nothing", () => {
    const one = detectFirms([f("a", "DvH Ventures"), f("b", "Dieter von Holtzbrinck Ventures")])
    expect(find(one, "a", "b")).toMatchObject({ tier: "possible", evidence: { initials: expect.any(String) } })
    const many = detectFirms([f("acr", "FFO"), f("1", "Francis Family Office"), f("2", "Finvia Family Office"), f("3", "Fisher Family Office"), f("4", "Fiduciary Family Office"), f("5", "Foster Family Office")])
    expect(many.filter((c) => c.a === "acr" || c.b === "acr")).toHaveLength(0)
  })
  it("people who sit at both firms raise a possible pair to probable and add weight", () => {
    const shared = new Map([["a\u0000b", 2]])
    const c = detectFirms([f("a", "Kindred Capital", "https://kindred.vc"), f("b", "Kindred Capital VC", "https://kindred.vc")], shared)
    expect(find(c, "a", "b")).toMatchObject({ tier: "probable" })
    expect(find(c, "a", "b")!.evidence.sharedPeople).toBe(2)
  })
  it("never proposes a firm against itself or a pair twice, orders ids, and skips a block of generic size", () => {
    const many = Array.from({ length: MAX_BLOCK + 1 }, (_, i) => f(`x${i}`, "Capital Partners"))
    expect(detectFirms(many)).toHaveLength(0)
    const c = detectFirms([f("b", "Same Name"), f("a", "Same Name")])
    expect(c).toHaveLength(1); expect(c[0].a < c[0].b).toBe(true)
  })
  it("nothing here is merged automatically: no firm candidate is ever 'certain'", () => {
    const c = detectFirms([f("a", "Same", "https://s.com"), f("b", "Same", "https://s.com")], new Map([["a\u0000b", 5]]))
    expect(c.every((x) => x.tier !== "certain")).toBe(true)
  })
  it("handles a directory-sized input inside a time budget", () => {
    const firms: FirmRec[] = []
    for (let i = 0; i < 21000; i++) firms.push(f(`id${i}`, `Firm ${i} ${["Capital", "Ventures", "Partners", "Fund"][i % 4]}`, i % 3 ? `https://site${i}.com` : undefined))
    for (let i = 0; i < 400; i++) firms.push(f(`dup${i}`, `Firm ${i} ${["Capital", "Ventures", "Partners", "Fund"][i % 4]}`, `https://site${i}.com`, "drop"))
    const t = Date.now(); const c = detectFirms(firms)
    expect(Date.now() - t).toBeLessThan(5000); expect(c.length).toBeGreaterThanOrEqual(300)
  })
})

describe("people", () => {
  const P = (id: string, first: string, last: string) => ({ id, first, last })
  it("compatible names: same surname and the same or an initial first name; never a different person", () => {
    expect(namesCompatible(P("1", "Anna", "Berg"), P("2", "anna", "BERG"))).toBe(true)
    expect(namesCompatible(P("1", "A.", "Berg"), P("2", "Anna", "Berg"))).toBe(true)
    expect(namesCompatible(P("1", "Jürgen", "Müller"), P("2", "Jurgen", "Muller"))).toBe(true)
    expect(namesCompatible(P("1", "Anna", "Berg"), P("2", "Ben", "Berg"))).toBe(false)
    expect(namesCompatible(P("1", "Anna", "Berg"), P("2", "Anna", "Stein"))).toBe(false)
    expect(namesCompatible(P("1", "", "Berg"), P("2", "Anna", "Berg"))).toBe(false)
  })
  it("the same email and a compatible name is certain; a team mailbox or a different name never is", () => {
    const c = detectPeople([
      { by: "email", value: "anna@fund.com", rows: [P("1", "Anna", "Berg"), P("2", "Anna", "Berg")] },
      { by: "email", value: "info@fund.com", rows: [P("3", "Anna", "Berg"), P("4", "Anna", "Berg")] },
      { by: "email", value: "shared@fund.com", rows: [P("5", "Anna", "Berg"), P("6", "Ben", "Stein")] },
    ])
    const byPair = Object.fromEntries(c.map((x) => [`${x.a}-${x.b}`, x.tier]))
    expect(byPair["1-2"]).toBe("certain"); expect(byPair["3-4"]).toBe("possible"); expect(byPair["5-6"]).toBe("possible")
    expect(isRoleMailbox("Invest@x.com")).toBe(true); expect(isRoleMailbox("anna@x.com")).toBe(false)
  })
  it("the same profile and a compatible name is certain, an incompatible name only probable", () => {
    const c = detectPeople([{ by: "profile", value: "anna-berg", rows: [P("1", "Anna", "Berg"), P("2", "Anna", "Berg")] }, { by: "profile", value: "x", rows: [P("3", "Anna", "Berg"), P("4", "Carl", "Stein")] }])
    expect(c.find((x) => x.a === "1")!.tier).toBe("certain"); expect(c.find((x) => x.a === "3")!.tier).toBe("probable")
  })
  it("the same name at the same firm is probable, and several reasons for one pair keep the strongest tier once", () => {
    const rows = [P("1", "Anna", "Berg"), P("2", "Anna", "Berg")]
    const c = detectPeople([{ by: "name_firm", value: "anna berg|f1", rows }, { by: "email", value: "anna@fund.com", rows }])
    expect(c).toHaveLength(1); expect(c[0]).toMatchObject({ tier: "certain", kind: "person" }); expect(c[0].evidence.by).toEqual(expect.arrayContaining(["email", "name_firm"]))
    expect(detectPeople([{ by: "name_firm", value: "k", rows }])[0].tier).toBe("probable")
  })
  it("ignores a group of one or a group too large to be an identity, and stores no names in the evidence", () => {
    expect(detectPeople([{ by: "email", value: "a@b.co", rows: [P("1", "A", "B")] }])).toHaveLength(0)
    expect(detectPeople([{ by: "email", value: "a@b.co", rows: Array.from({ length: MAX_BLOCK + 1 }, (_, i) => P(`p${i}`, "A", "B")) }])).toHaveLength(0)
    expect(JSON.stringify(detectPeople([{ by: "email", value: "anna@fund.com", rows: [P("1", "Anna", "Berg"), P("2", "Anna", "Berg")] }]))).not.toMatch(/Anna|Berg|fund\.com/)
  })
})
