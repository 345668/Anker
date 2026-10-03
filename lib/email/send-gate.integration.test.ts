/** The country send-gate and the opt-out, against a real Postgres (PGlite) with the real consent migration. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ sql: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: state.sql }))
process.env.SECRET_KEY = "gate-test"
import { assertOutreachAllowed, recordConsent, countryCode, countryFromEmailDomain, CountryGateError } from "./send-gate"
import { suppressGlobally, SuppressedRecipientError } from "./unsubscribe"
import { sendGmail } from "./gmail"

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE email_suppressions (id bigserial PRIMARY KEY, user_id text, email text NOT NULL, reason text, source text, created_at timestamptz DEFAULT now());
    CREATE TABLE investors (email text, norm_country text, investor_country text);
    CREATE TABLE email_oauth_accounts (id text, last_error text, last_used_at timestamptz, updated_at timestamptz);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-03-outreach-consents.sql", "utf8"))
  state.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM email_suppressions; DELETE FROM investors; DELETE FROM outreach_consents"); delete process.env.OUTREACH_COUNTRY_GATE })

describe("country resolution", () => {
  it("reads names and codes, and the country-code domain", () => {
    expect(countryCode("Germany")).toBe("DE"); expect(countryCode("Deutschland")).toBe("DE"); expect(countryCode("fr")).toBe("FR"); expect(countryCode("")).toBeNull()
    expect(countryFromEmailDomain("a@fund.de")).toBe("DE"); expect(countryFromEmailDomain("a@fund.co.uk")).toBe("GB"); expect(countryFromEmailDomain("a@fund.com")).toBeNull()
  })
})

describe("assertOutreachAllowed", () => {
  it("blocks a .de address with no attestation, and lets it through with one", async () => {
    await expect(assertOutreachAllowed({ to: "a@fund.de", senderUserId: "u1" })).rejects.toBeInstanceOf(CountryGateError)
    await recordConsent("u1", "A@Fund.de", "prior_express_consent", "asked us to write")
    await expect(assertOutreachAllowed({ to: "a@fund.de", senderUserId: "u1" })).resolves.toBeUndefined()
    await expect(assertOutreachAllowed({ to: "a@fund.de", senderUserId: "u2" })).rejects.toBeInstanceOf(CountryGateError)
    await expect(assertOutreachAllowed({ to: "a@fund.de" })).rejects.toBeInstanceOf(CountryGateError)
  })
  it("uses the directory country over the domain, so a .com address of a German investor is gated", async () => {
    await db.query("INSERT INTO investors VALUES ('x@fund.com', 'Germany', NULL)")
    await expect(assertOutreachAllowed({ to: "X@fund.com", senderUserId: "u1" })).rejects.toMatchObject({ code: "country_gated", country: "DE" })
  })
  it("gates other EU states, permits the US, the UK and an unknown country", async () => {
    await expect(assertOutreachAllowed({ to: "a@fund.fr", senderUserId: "u1" })).rejects.toBeInstanceOf(CountryGateError)
    await expect(assertOutreachAllowed({ to: "a@fund.com", senderUserId: "u1", recipientCountry: "Italy" })).rejects.toBeInstanceOf(CountryGateError)
    for (const to of ["a@fund.com", "a@fund.co.uk", "a@fund.io"]) await expect(assertOutreachAllowed({ to, senderUserId: "u1" })).resolves.toBeUndefined()
    await expect(assertOutreachAllowed({ to: "a@fund.com", senderUserId: "u1", recipientCountry: "United States" })).resolves.toBeUndefined()
  })
  it("a revoked attestation gates again, and the switch turns the country rule off but never the opt-out", async () => {
    await recordConsent("u1", "a@fund.de", "existing_customer")
    await db.query("UPDATE outreach_consents SET revoked_at = now()")
    await expect(assertOutreachAllowed({ to: "a@fund.de", senderUserId: "u1" })).rejects.toBeInstanceOf(CountryGateError)
    process.env.OUTREACH_COUNTRY_GATE = "off"
    await expect(assertOutreachAllowed({ to: "a@fund.de", senderUserId: "u1" })).resolves.toBeUndefined()
    await suppressGlobally("a@fund.de", "unsubscribed", "recipient")
    await expect(assertOutreachAllowed({ to: "a@fund.de", senderUserId: "u1" })).rejects.toBeInstanceOf(SuppressedRecipientError)
  })
  it("re-attesting refreshes the row, it does not duplicate it", async () => {
    await recordConsent("u1", "a@fund.de", "prior_express_consent"); await recordConsent("u1", "A@FUND.DE", "existing_customer", "now a customer")
    const r = (await db.query("SELECT basis FROM outreach_consents")).rows as any[]
    expect(r).toEqual([{ basis: "existing_customer" }])
  })
})

describe("the Gmail path no longer bypasses the gate", () => {
  const account: any = { id: "g1", user_id: "u1", email: "me@summit.test", status: "active", display_name: null }
  it("refuses a gated recipient before it touches Gmail", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy)
    const r = await sendGmail({ account, to: "a@fund.de", subject: "Hi", text: "Hello" })
    expect(r).toMatchObject({ ok: false }); expect((r as any).error).toMatch(/prior express consent/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it("refuses an opted-out address", async () => {
    await suppressGlobally("a@fund.com", "unsubscribed", "recipient")
    const r = await sendGmail({ account, to: "a@fund.com", subject: "Hi", text: "Hello" })
    expect(r).toMatchObject({ ok: false })
  })
})
