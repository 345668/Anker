/**
 * Reading and matching an investor-data drop (docs/architecture/24 §7).
 *
 * The rules under test are the ones that decide what happens to a live
 * directory: which sheet is people and which is firms, when two records are
 * the same record, and when a difference is a disagreement rather than one
 * value simply being more specific.
 */
import { describe, expect, it } from "vitest"
import {
  applyAliasKeys, personViaAlias, classifySheet, countryTail, findHeaderRow, hostOf, linkedinSlug, looksLikeNote, samePlausibly,
} from "../scripts/import-directory-drop.mjs"

describe("findHeaderRow", () => {
  it("looks past the banner most of these files start with", () => {
    const aoa = [
      ["8FUNDRAISING  ·  VC DROP #04"],
      [""],
      ["Updated July 2026"],
      ["FULL NAME", "TITLE", "FIRM", "EMAIL", "LINKEDIN", "LOCATION"],
      ["Jane Doe", "Partner", "Acme", "j@acme.vc", "", "London"],
    ]
    expect(findHeaderRow(aoa)).toBe(3)
  })

  it("takes row one when row one is the header", () => {
    expect(findHeaderRow([["first_name", "last_name", "title", "company", "email"]])).toBe(0)
  })

  it("says so when a sheet has no header at all", () => {
    expect(findHeaderRow([["GLOBAL INVESTOR DATABASE"], [""], ["a note"]])).toBe(-1)
  })
})

describe("classifySheet", () => {
  it("reads a contact list as people", () => {
    expect(classifySheet({ fullName: 0, title: 1, firm: 2, email: 3 })).toBe("people")
    expect(classifySheet({ firstName: 0, lastName: 1, company: 2, email: 3 })).toBe("people")
  })

  it("reads a firm list as firms", () => {
    // The trap: "01 Ventures" and "Aaron Levie" are both two words, so this
    // cannot be decided per row — only the sheet knows.
    expect(classifySheet({ fullName: 0, type: 1, location: 2, website: 3, aum: 4 })).toBe("firms")
    expect(classifySheet({ firm: 0, type: 1, location: 2 })).toBe("firms")
  })
})

describe("hostOf", () => {
  it("reduces a website to the thing two records can be compared on", () => {
    for (const url of ["https://www.acme.vc/about", "http://acme.vc", "acme.vc", "www.acme.vc/", "HTTPS://ACME.VC"]) {
      expect(hostOf(url), url).toBe("acme.vc")
    }
  })

  it("has nothing to say about nothing", () => {
    expect(hostOf("")).toBeNull()
    expect(hostOf(null)).toBeNull()
    expect(hostOf("not a url")).toBe("not a url".includes(".") ? hostOf("not a url") : null)
  })

  it("keeps different firms apart", () => {
    expect(hostOf("https://acme.vc")).not.toBe(hostOf("https://acme.com"))
  })
})

describe("linkedinSlug", () => {
  it("finds the profile whatever the URL around it looks like", () => {
    for (const url of [
      "https://www.linkedin.com/in/Jane-Doe/",
      "linkedin.com/in/jane-doe",
      "https://uk.linkedin.com/in/jane-doe?originalSubdomain=uk",
    ]) expect(linkedinSlug(url), url).toBe("jane-doe")
  })

  it("is not fooled by a company page", () => {
    expect(linkedinSlug("https://linkedin.com/company/acme")).toBeNull()
  })
})

describe("countryTail", () => {
  it("folds the aliases that make one country look like two", () => {
    expect(countryTail("San Francisco, USA")).toBe("us")
    expect(countryTail("Austin, United States")).toBe("us")
    expect(countryTail("London, UK")).toBe("uk")
    expect(countryTail("Cambridge, United Kingdom")).toBe("uk")
    expect(countryTail("Dubai, UAE")).toBe("uae")
  })

  it("falls back to the last word when it knows no alias", () => {
    expect(countryTail("Stockholm, Sweden")).toBe("sweden")
    expect(countryTail("")).toBeNull()
  })

  it("keeps genuinely different countries apart", () => {
    expect(countryTail("London, UK")).not.toBe(countryTail("Stockholm, Sweden"))
  })
})

describe("looksLikeNote", () => {
  it("rejects a footer or advert in a name column", () => {
    expect(looksLikeNote("Need allocators beyond this list? Find partners at any fund, start free")).toBe(true)
    expect(looksLikeNote("Pulled from the base database. Find any investor at example.com")).toBe(true)
  })
  it("keeps real names", () => {
    expect(looksLikeNote("Nina von Kessel")).toBe(false)
    expect(looksLikeNote("Nordwerk Gründerfonds Management GmbH")).toBe(false)
  })
})

describe("samePlausibly", () => {
  it("a shared site settles it", () => {
    expect(samePlausibly({ website: "https://www.acme.vc/", hq_location: "Paris, France" }, { website: "acme.vc", place: "New York" })).toBe(true)
  })
  it("a different site and a different country is a different firm", () => {
    expect(samePlausibly({ website: "https://www.better.vc/", hq_location: "Oakland, California, United States" }, { website: "betterventures.io", place: "Munich, Germany" })).toBe(false)
  })
  it("one disagreement alone is just an office or a new site", () => {
    expect(samePlausibly({ website: "https://acme.vc", hq_location: "Paris, France" }, { website: "", place: "New York, USA" })).toBe(true)
    expect(samePlausibly({ website: "https://acme.vc", hq_location: "Paris, France" }, { website: "acme.io", place: "Lyon, France" })).toBe(true)
  })
})

describe("keys of merged records (docs/architecture/55 E4)", () => {
  const firms = [{ id: "f1", name: "Kindred Capital" }, { id: "f9", name: "Other" }], people = [{ id: "p1" }]
  const maps = () => ({ firms, people, firmByHost: new Map([["other.example", firms[1]]]), firmByKeys: new Map([["kindredcapital", firms[0]]]) })
  it("a folded-in firm's name key and host now point at the survivor, without ever overriding a key a live record holds", () => {
    const m = maps(), r = applyAliasKeys(m, [
      { kind: "firm", key_type: "firm_key", key: "kindredcapitalvc", target_id: "f1" }, { kind: "firm", key_type: "firm_host", key: "kindred.example", target_id: "f1" },
      { kind: "firm", key_type: "firm_host", key: "other.example", target_id: "f1" },                 // a live firm already owns this host
      { kind: "firm", key_type: "firm_key", key: "gone", target_id: "no-such-firm" }])               // the survivor is not in the directory (erased): nothing is added
    expect(m.firmByKeys.get("kindredcapitalvc")).toBe(firms[0]); expect(m.firmByHost.get("kindred.example")).toBe(firms[0]); expect(m.firmByHost.get("other.example")).toBe(firms[1]); expect(m.firmByKeys.has("gone")).toBe(false); expect(r.count).toBe(2)
  })
  it("a folded-in person's keyed hashes resolve to the survivor: by email first, then by any profile", () => {
    const r = applyAliasKeys(maps(), [{ kind: "person", key_type: "email_hash", key: "H-EMAIL", target_id: "p1" }, { kind: "person", key_type: "linkedin_hash", key: "H-LI", target_id: "p1" }])
    expect(personViaAlias(r, { emailHash: "H-EMAIL", linkedinHashes: [] })).toEqual({ id: "p1" }); expect(personViaAlias(r, { emailHash: null, linkedinHashes: ["x", "H-LI"] })).toEqual({ id: "p1" }); expect(personViaAlias(r, { emailHash: "nope", linkedinHashes: [] })).toBeNull(); expect(r.count).toBe(2)
  })
  it("nothing merged means nothing changes", () => { const m = maps(), r = applyAliasKeys(m, []); expect(r.count).toBe(0); expect(m.firmByKeys.size).toBe(1) })
})
