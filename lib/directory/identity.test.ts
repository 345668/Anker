import { describe, it, expect } from "vitest"
import { hashEmail, hashLinkedIn, linkedinSlug, identityHashes, canaryHash, hashKey } from "./identity"

describe("identity hashes", () => {
  it("hash an address the same way however it is written, and differently per key", () => {
    expect(hashEmail(" Anna@Fund.COM ", "k1")).toBe(hashEmail("anna@fund.com", "k1"))
    expect(hashEmail("anna@fund.com", "k1")).not.toBe(hashEmail("anna@fund.com", "k2"))
    expect(hashEmail("anna@fund.com", "k1")).toMatch(/^[0-9a-f]{64}$/)
  })
  it("give nothing for a value that is not an address or a person's profile", () => {
    expect(hashEmail("", "k")).toBeNull(); expect(hashEmail("not-an-email", "k")).toBeNull(); expect(hashEmail(null, "k")).toBeNull()
    expect(hashLinkedIn("https://www.linkedin.com/company/acme", "k")).toBeNull()
  })
  it("read a LinkedIn profile from any of its spellings", () => {
    const want = hashLinkedIn("https://www.linkedin.com/in/Anna-Berg", "k")
    for (const u of ["http://linkedin.com/in/anna-berg/", "https://de.linkedin.com/in/anna-berg?trk=x", "linkedin.com/in/ANNA-BERG#top"]) expect(hashLinkedIn(u, "k")).toBe(want)
    expect(linkedinSlug("https://www.linkedin.com/in/j%C3%BCrgen")).toBe("in/jürgen")
  })
  it("keeps email and profile hashes apart, and de-duplicates the profile hashes", () => {
    const h = identityHashes({ email: "a@b.co", linkedinUrl: "https://linkedin.com/in/x", personLinkedinUrl: "https://www.linkedin.com/in/x/" }, "k")
    expect(h.linkedinHashes).toHaveLength(1); expect(h.emailHash).not.toBe(h.linkedinHashes[0])
  })
  it("uses DIRECTORY_HASH_KEY before SECRET_KEY and refuses to run without a key", () => {
    expect(hashKey({ DIRECTORY_HASH_KEY: "a", SECRET_KEY: "b" })).toBe("a"); expect(hashKey({ SECRET_KEY: "b" })).toBe("b")
    expect(() => hashKey({})).toThrow(/No hash key/)
    expect(canaryHash("a")).not.toBe(canaryHash("b"))
  })
})
