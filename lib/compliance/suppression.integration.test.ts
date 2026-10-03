/** Cross-channel suppression and the owner's pitch-us consent flow, against a real Postgres (PGlite). */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/audit/audit-log", () => ({ logAudit: vi.fn(async () => {}) }))
const state = vi.hoisted(() => ({ sql: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: state.sql }))
process.env.SECRET_KEY = "xchannel-test"
import { suppressEverywhere, isObjection, profileSlug, GLOBAL_LI_OWNER } from "./suppression"
import { isGloballySuppressed } from "@/lib/email/unsubscribe"
import { suppressedSlugs } from "@/lib/linkedin/suppressions"
import { assertOutreachAllowed, PLATFORM_SENDER_ID, CountryGateError } from "@/lib/email/send-gate"
import { listBlockedPitchRecipients, attestPitchConsent } from "@/lib/outreach/pitch-consent"

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE email_suppressions (id bigserial PRIMARY KEY, user_id text, email text NOT NULL, reason text, source text, created_at timestamptz DEFAULT now());
    CREATE TABLE li_suppressions (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL, slug text NOT NULL, target_url text, reason text, created_at timestamptz DEFAULT now(), UNIQUE (user_id, slug));
    CREATE TABLE investors (email text, norm_country text, investor_country text, linkedin_url text, person_linkedin_url text);
    CREATE TABLE crm_people (email text, linkedin text);
    CREATE TABLE contacts (email text, linkedin_url text);
    CREATE TABLE campaign_crm_entries (id serial PRIMARY KEY, stage text, investor_email text, investor_name text, send_error text, updated_at timestamptz);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-03-outreach-consents.sql", "utf8"))
  state.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM email_suppressions; DELETE FROM li_suppressions; DELETE FROM investors; DELETE FROM crm_people; DELETE FROM contacts; DELETE FROM campaign_crm_entries; DELETE FROM outreach_consents") })

describe("what counts as an objection", () => {
  it("is explicit, not a soft no", () => {
    for (const t of ["Please stop", "unsubscribe me", "remove me from your list", "Do not contact me", "opt out"]) expect(isObjection(t)).toBe(true)
    for (const t of ["not interested", "no thanks", "maybe later", ""]) expect(isObjection(t)).toBe(false)
  })
  it("reads a profile url into a slug", () => expect(profileSlug("https://www.linkedin.com/in/Jane-Doe/?x=1")).toBe("in/jane-doe"))
})

describe("suppression crosses channels", () => {
  it("an email unsubscribe also stops the person's LinkedIn profile", async () => {
    await db.query("INSERT INTO investors VALUES ('jane@fund.com', 'United States', NULL, 'https://linkedin.com/in/jane-doe', NULL)")
    const r = await suppressEverywhere({ email: "Jane@Fund.com", reason: "unsubscribed", source: "recipient" })
    expect(r).toEqual({ emails: 1, linkedin: 1 })
    expect(await isGloballySuppressed("jane@fund.com")).toBe(true)
    expect((await suppressedSlugs("any-user")).has("in/jane-doe")).toBe(true)
  })
  it("a LinkedIn objection also stops the person's email addresses, from any table that knows them", async () => {
    await db.query("INSERT INTO crm_people VALUES ('j@fund.com', 'https://www.linkedin.com/in/jane-doe')")
    await db.query("INSERT INTO investors VALUES ('jane@fund.com', NULL, NULL, 'https://linkedin.com/in/jane-doe', NULL)")
    const r = await suppressEverywhere({ linkedinUrl: "https://linkedin.com/in/jane-doe", reason: "linkedin_objection", source: "linkedin_reply" })
    expect(r.emails).toBe(2)
    expect(await isGloballySuppressed("j@fund.com")).toBe(true); expect(await isGloballySuppressed("jane@fund.com")).toBe(true)
  })
  it("is idempotent, does not touch other people, and a user's own list stays theirs", async () => {
    await db.query("INSERT INTO investors VALUES ('a@x.com', NULL, NULL, 'https://linkedin.com/in/a', NULL), ('b@x.com', NULL, NULL, 'https://linkedin.com/in/b', NULL)")
    await suppressEverywhere({ email: "a@x.com", reason: "complained", source: "resend" }); await suppressEverywhere({ email: "a@x.com", reason: "complained", source: "resend" })
    expect((await db.query("SELECT * FROM email_suppressions")).rows.length).toBe(1)
    expect((await db.query("SELECT * FROM li_suppressions WHERE user_id = $1", [GLOBAL_LI_OWNER])).rows.length).toBe(1)
    expect(await isGloballySuppressed("b@x.com")).toBe(false)
    await db.query("INSERT INTO li_suppressions (user_id, slug) VALUES ('u1', 'in/mine')")
    expect((await suppressedSlugs("u1")).has("in/mine")).toBe(true); expect((await suppressedSlugs("u2")).has("in/mine")).toBe(false)
  })
  it("with no other record, it still suppresses the one channel it was given", async () => {
    expect(await suppressEverywhere({ email: "solo@x.com", reason: "unsubscribed", source: "recipient" })).toEqual({ emails: 1, linkedin: 0 })
  })
})

describe("the owner's pitch-us consent flow", () => {
  it("lists held recipients with their country, and attesting releases them and lets the platform send", async () => {
    const held = "Not sent: DE recipients need prior express consent. Record that consent."
    await db.query("INSERT INTO campaign_crm_entries (stage, investor_email, investor_name, send_error) VALUES ('queued','Anna@Fonds.de','Anna','" + held + "'),('queued','Anna@Fonds.de','Anna','" + held + "'),('queued','bob@x.com','Bob','some other error')")
    await expect(assertOutreachAllowed({ to: "anna@fonds.de", senderUserId: PLATFORM_SENDER_ID })).rejects.toBeInstanceOf(CountryGateError)
    expect(await listBlockedPitchRecipients()).toEqual([{ email: "anna@fonds.de", name: "Anna", country: "DE", entries: 2 }])
    const r = await attestPitchConsent({ id: "o1", email: "owner@an-ker.de" }, "anna@fonds.de", "prior_express_consent", "asked us to write")
    expect(r.requeued).toBe(2)
    await expect(assertOutreachAllowed({ to: "anna@fonds.de", senderUserId: PLATFORM_SENDER_ID })).resolves.toBeUndefined()
    expect(((await db.query("SELECT send_error FROM campaign_crm_entries WHERE investor_email = 'bob@x.com'")).rows[0] as any).send_error).toBe("some other error")
    expect(await listBlockedPitchRecipients()).toEqual([])
  })
})
