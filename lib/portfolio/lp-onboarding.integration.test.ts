import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
const st = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); return { sql: f } })
process.env.SECRET_KEY = "lp-test-secret"
import { LpError, acceptTerms, advance, confirmDetails, inviteLp, listForFund, lpEmail, markReviewed, onboardingView, sendCode, sessionCookieName, sessionOk, setContact, verifyCode, maskEmail } from "./lp-onboarding"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const sent: Array<{ to: string; subject: string; text: string }> = []
const send = async (m: { to: string; subject: string; text: string }) => { sent.push(m) }
const codeOf = () => /(\d{6})/.exec(sent.at(-1)!.subject)![1]
const tokenId = async () => (await rows("SELECT id FROM lp_portal_tokens WHERE revoked = false ORDER BY created_at DESC LIMIT 1"))[0].id as string

beforeAll(async () => {
  db = new PGlite(); st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE funds (id text PRIMARY KEY, name text); INSERT INTO funds VALUES ('f1', 'Fund One');
    CREATE TABLE contacts (id text PRIMARY KEY, first_name text, last_name text, email text);
    CREATE TABLE fund_lps (id text PRIMARY KEY, fund_id text, lp_contact_id text, lp_name text, lp_type text, status text DEFAULT 'committed', metadata jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now());
    CREATE TABLE lp_portal_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lp_id text, fund_id text, token_hash text, prefix text, label text, expires_at timestamptz, revoked boolean DEFAULT false, last_seen_at timestamptz, view_count int DEFAULT 0, created_by text, created_at timestamptz DEFAULT now());`)
  await db.exec(readFileSync("scripts/migrations/2026-10-17b-lp-onboarding.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  sent.length = 0
  await db.exec(`DELETE FROM lp_portal_codes; DELETE FROM lp_portal_sessions; DELETE FROM lp_onboarding_details; DELETE FROM lp_terms_acceptances; DELETE FROM lp_portal_tokens; DELETE FROM fund_lps; DELETE FROM contacts;
    INSERT INTO contacts VALUES ('c1', 'Anna', 'Berg', 'Anna.Berg@Example.com');
    INSERT INTO fund_lps (id, fund_id, lp_name, lp_type) VALUES ('lp1', 'f1', 'Berg Holding GmbH', 'company'), ('lp2', 'f1', 'Meier Family', 'family_office');
    UPDATE fund_lps SET lp_contact_id = 'c1' WHERE id = 'lp2'`)
})

describe("the contact address", () => {
  it("is the one typed on the row, else the linked contact's, else one kept in the row's metadata; none means no invitation", async () => {
    expect((await lpEmail("lp1"))!.email).toBeNull()
    expect((await lpEmail("lp2"))!).toMatchObject({ email: "anna.berg@example.com", name: "Anna Berg", fundName: "Fund One" })
    await db.exec(`UPDATE fund_lps SET metadata = '{"email":"Meta@x.org"}' WHERE id = 'lp1'`); expect((await lpEmail("lp1"))!.email).toBe("meta@x.org")
    await setContact("lp2", { email: " Typed@Example.com ", name: "Typed Name" }); expect((await lpEmail("lp2"))).toMatchObject({ email: "typed@example.com", name: "Typed Name" })
  })
  it("rejects an address that is not one, and an LP that does not exist", async () => {
    await expect(setContact("lp1", { email: "nope" })).rejects.toBeInstanceOf(LpError)
    await expect(setContact("ghost", { email: "a@b.co" })).rejects.toMatchObject({ status: 404 })
  })
})

describe("the invitation", () => {
  it("refuses without an address; with one it sends a 30-day personal link, moves the LP to invited, and a resend replaces the old link", async () => {
    await expect(inviteLp("lp1", "gp", "https://app.test", send)).rejects.toMatchObject({ code: "no_email", status: 422 }); expect(sent).toHaveLength(0)
    const r = await inviteLp("lp2", "gp", "https://app.test/", send)
    expect(r.sentTo).toBe("a***@example.com"); expect(sent[0].to).toBe("anna.berg@example.com"); expect(sent[0].text).toMatch(/https:\/\/app\.test\/portal\/lp_[\w-]+/); expect(sent[0].text).toContain("30 days")
    const days = (new Date(r.expiresAt!).getTime() - Date.now()) / 86_400_000; expect(days).toBeGreaterThan(29.9); expect(days).toBeLessThan(30.1)
    expect((await rows("SELECT onboarding_state, invited_at FROM fund_lps WHERE id = 'lp2'"))[0].onboarding_state).toBe("invited")
    const first = sent[0].text.match(/\/portal\/(lp_[\w-]+)/)![1]
    await inviteLp("lp2", "gp", "https://app.test", send)
    const live = await rows("SELECT token_hash FROM lp_portal_tokens WHERE lp_id = 'lp2' AND revoked = false"); expect(live).toHaveLength(1)
    expect(live[0].token_hash).not.toBe(createHash("sha256").update(first).digest("hex")); expect(live[0].token_hash).not.toContain("lp_")
  })
  it("a failed email revokes the new link and leaves the LP where they were", async () => {
    await expect(inviteLp("lp2", "gp", "https://app.test", async () => { throw new Error("resend down") })).rejects.toThrow("resend down")
    expect(await rows("SELECT 1 FROM lp_portal_tokens WHERE revoked = false")).toHaveLength(0); expect((await rows("SELECT onboarding_state FROM fund_lps WHERE id = 'lp2'"))[0].onboarding_state).toBe("not_invited")
  })
})

describe("the code that opens the portal", () => {
  const setup = async () => { await inviteLp("lp2", "gp", "https://app.test", send); sent.length = 0; return tokenId() }
  it("is emailed to the LP's own address, six digits, stored only as a hash; the right code opens a session and marks the LP opened", async () => {
    const t = await setup()
    await sendCode(t, "lp2", send); expect(sent[0].to).toBe("anna.berg@example.com"); const code = codeOf(); expect(code).toMatch(/^\d{6}$/)
    expect(JSON.stringify(await rows("SELECT code_hash FROM lp_portal_codes"))).not.toContain(code)
    const { session } = await verifyCode(t, "lp2", ` ${code.slice(0, 3)} ${code.slice(3)} `, "1.2.3.4")
    expect(await sessionOk(t, session)).toBe(true); expect(await sessionOk(t, "x".repeat(40))).toBe(false); expect(await sessionOk(t, null)).toBe(false)
    expect((await rows("SELECT onboarding_state FROM fund_lps WHERE id = 'lp2'"))[0].onboarding_state).toBe("opened")
    expect(JSON.stringify(await rows("SELECT session_hash FROM lp_portal_sessions"))).not.toContain(session)
    await expect(verifyCode(t, "lp2", code, null)).rejects.toMatchObject({ code: "expired" })      // a code works once
  })
  it("a session belongs to one link: it opens nothing on another, and not after it expires or is revoked", async () => {
    const t = await setup(); await sendCode(t, "lp2", send); const { session } = await verifyCode(t, "lp2", codeOf(), null)
    expect(await sessionOk("00000000-0000-0000-0000-000000000000", session)).toBe(false)
    await db.exec("UPDATE lp_portal_sessions SET expires_at = now() - interval '1 minute'"); expect(await sessionOk(t, session)).toBe(false)
    await db.exec("UPDATE lp_portal_sessions SET expires_at = now() + interval '1 hour', revoked = true"); expect(await sessionOk(t, session)).toBe(false)
  })
  it("three wrong tries lock the code; a new code works; an expired code does not", async () => {
    const t = await setup(); await sendCode(t, "lp2", send); const good = codeOf(), bad = good === "000000" ? "111111" : "000000"
    for (let i = 0; i < 3; i++) await expect(verifyCode(t, "lp2", bad, null)).rejects.toMatchObject({ code: "wrong" })
    await expect(verifyCode(t, "lp2", good, null)).rejects.toMatchObject({ code: "locked" })
    await db.exec("UPDATE lp_portal_codes SET created_at = now() - interval '2 minutes'"); await sendCode(t, "lp2", send); await expect(verifyCode(t, "lp2", codeOf(), null)).resolves.toBeTruthy()
    await sendCode(t, "lp2", send).catch(() => {}); await db.exec("UPDATE lp_portal_codes SET expires_at = now() - interval '1 minute'")
    await expect(verifyCode(t, "lp2", codeOf(), null)).rejects.toMatchObject({ code: "expired" })
  })
  it("a malformed code is refused before it counts as a try; codes are rate limited per minute and per hour", async () => {
    const t = await setup(); await sendCode(t, "lp2", send)
    await expect(verifyCode(t, "lp2", "12ab56", null)).rejects.toBeInstanceOf(LpError); expect((await rows("SELECT attempts FROM lp_portal_codes"))[0].attempts).toBe(0)
    await expect(sendCode(t, "lp2", send)).rejects.toMatchObject({ code: "wait", status: 429 })
    for (let i = 0; i < 4; i++) { await db.exec("UPDATE lp_portal_codes SET created_at = created_at - interval '2 minutes'"); await sendCode(t, "lp2", send) }
    await db.exec("UPDATE lp_portal_codes SET created_at = created_at - interval '2 minutes'")
    await expect(sendCode(t, "lp2", send)).rejects.toMatchObject({ code: "limit" })
  })
  it("no address on file means no code can be sent", async () => {
    await db.exec("INSERT INTO lp_portal_tokens (lp_id, fund_id, token_hash) VALUES ('lp1','f1','h')"); const t = await tokenId()
    await expect(sendCode(t, "lp1", send)).rejects.toMatchObject({ code: "no_email" })
  })
  it("the cookie name is per link, so two investors in one browser do not collide", () => { expect(sessionCookieName("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).not.toBe(sessionCookieName("bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee")) })
})

describe("onboarding steps", () => {
  it("steps only move forward", async () => {
    expect(await advance("lp1", "opened")).toBe(true); expect(await advance("lp1", "invited")).toBe(false); expect(await advance("lp1", "opened")).toBe(false); expect(await advance("lp1", "details_confirmed")).toBe(true)
    expect((await rows("SELECT onboarding_state FROM fund_lps WHERE id = 'lp1'"))[0].onboarding_state).toBe("details_confirmed")
  })
  it("details need a name and a kind; the tax number is stored encrypted and only its last four digits come back; the fund's own record is untouched", async () => {
    await expect(confirmDetails("lp1", { legalName: " ", entityType: "company" })).rejects.toBeInstanceOf(LpError)
    await expect(confirmDetails("lp1", { legalName: "Berg", entityType: "alien" })).rejects.toBeInstanceOf(LpError)
    await confirmDetails("lp1", { legalName: "Berg Beteiligungs GmbH", entityType: "company", address: "Hauptstr. 1", country: "Germany", taxResidence: "DE", taxId: "DE123456789", signatoryName: "Anna Berg" })
    const raw = JSON.stringify(await rows("SELECT * FROM lp_onboarding_details")); expect(raw).not.toContain("DE123456789")
    const v = (await onboardingView("lp1"))!; expect(v.details).toMatchObject({ legalName: "Berg Beteiligungs GmbH", taxIdLast4: "6789" }); expect(v.steps.find((s) => s.key === "details")!.done).toBe(true)
    expect((await rows("SELECT lp_name FROM fund_lps WHERE id = 'lp1'"))[0].lp_name).toBe("Berg Holding GmbH")
  })
  it("terms come after details, record the version, and complete the first three steps", async () => {
    await expect(acceptTerms("lp1", "1.1.1.1", "UA")).rejects.toMatchObject({ code: "order" })
    await advance("lp1", "opened"); await confirmDetails("lp1", { legalName: "Berg", entityType: "company" }); await acceptTerms("lp1", "1.1.1.1", "UA")
    expect((await rows("SELECT version, user_agent_hash FROM lp_terms_acceptances"))[0]).toMatchObject({ version: "2026-10" }); expect((await onboardingView("lp1"))!.steps.slice(0, 3).every((s) => s.done)).toBe(true)
  })
  it("the fund's list shows the state, the address, a name that differs, details to read, and who has waited ten days; reading marks them", async () => {
    await advance("lp1", "invited"); await confirmDetails("lp1", { legalName: "Berg Beteiligungs GmbH", entityType: "company" })
    await db.exec("UPDATE fund_lps SET details_confirmed_at = now() - interval '12 days' WHERE id = 'lp1'")
    const list = await listForFund("f1"); const a = list.find((r) => r.id === "lp1")!, b = list.find((r) => r.id === "lp2")!
    expect(a).toMatchObject({ state: "details_confirmed", differs: true, detailsToReview: true, email: null, waitingDays: 12 }); expect(b).toMatchObject({ state: "not_invited", email: "anna.berg@example.com", waitingDays: null })
    await markReviewed("lp1", "gp"); expect((await listForFund("f1")).find((r) => r.id === "lp1")!.detailsToReview).toBe(false)
  })
  it("masks an address", () => { expect(maskEmail("anna@example.com")).toBe("a***@example.com") })
})
