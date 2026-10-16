/** Privacy requests against a real Postgres (PGlite) with the real migrations. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ q: null as any, mails: [] as any[], suppressed: [] as any[], failSend: false }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => state.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => state.q(t, v); return { sql: f } })
vi.mock("@/lib/email/resend", () => ({ sendEmail: async (m: any) => { if (state.failSend) throw new Error("smtp down"); state.mails.push(m); return {} } }))
vi.mock("@/lib/compliance/suppression", () => ({
  suppressEverywhere: async (i: any) => { state.suppressed.push(i); return { emails: 1, linkedin: 1 } },
  profileSlug: (u: string) => { const m = String(u ?? "").match(/linkedin\.com\/in\/([^/?#]+)/i); return m ? `in/${m[1].toLowerCase()}` : null },
}))
process.env.SECRET_KEY = "dsar-test-secret"; process.env.DIRECTORY_HASH_KEY = "dsar-hash-key"
import { createRequest, verifyRequest, getRequest, listRequests, sendAccess, rectify, restrict, refuse, extend, erase, erasePreview, expireRequests, dueDigest, makeFormToken, formTokenOk, DsarError } from "./dsar"
import { hashEmail } from "@/lib/directory/identity"
import { PERSON_REFS } from "@/lib/directory/person-registry"
import { enforceEmailUse, DirectoryUseError } from "@/lib/directory/sources"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const tokenOf = () => { const m = state.mails.at(-1)?.text.match(/t=([\w-]+)/); return m?.[1] as string }
const ins = (id: string, email: string | null, li: string | null, first = "Anna") => db.query("INSERT INTO investors (id, first_name, last_name, email, person_linkedin_url, source, title) VALUES ($1,$2,'Berg',$3,$4,'folk','Partner')", [id, first, email, li])
const mk = async (kind: string, email = "anna@fund.com", linkedin?: string) => { await createRequest({ kind, email, linkedin }); const t = tokenOf(); await verifyRequest(t); return (await rows("SELECT id FROM dsar_requests ORDER BY created_at DESC LIMIT 1"))[0].id as string }

beforeAll(async () => {
  db = new PGlite()
  state.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE investors (id varchar PRIMARY KEY, first_name varchar NOT NULL, last_name varchar, title varchar, email varchar, phone varchar, linkedin_url varchar, person_linkedin_url varchar, twitter_url varchar, location varchar, bio text, investor_type varchar, source varchar, is_active boolean DEFAULT true, avatar varchar, address varchar, folk_id varchar, folk_custom_fields jsonb, investment_thesis text, recent_investments text, embedding text, metadata jsonb DEFAULT '{}', status varchar, created_at timestamp DEFAULT now(), updated_at timestamp);
    CREATE TABLE investment_firms (id serial PRIMARY KEY, name text, source text); CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);
    CREATE TABLE crm_people (id serial PRIMARY KEY, org_id text, investor_id text);
    CREATE TABLE memberships (user_id text, org_id text, org_role text); CREATE TABLE profiles (id text, email text);`)
  for (const r of PERSON_REFS) await db.exec(`CREATE TABLE IF NOT EXISTS ${r.table} (${r.column} text${r.orgColumn ? ", org_id text" : ""})`)
  await db.exec(readFileSync("scripts/migrations/2026-10-16-directory-sources.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-16b-directory-tombstones.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-16c-dsar-requests.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-16d-directory-erasure.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { state.mails.length = 0; state.suppressed.length = 0; state.failSend = false; await db.exec("DELETE FROM dsar_requests; DELETE FROM investors; DELETE FROM directory_tombstones; DELETE FROM directory_hash_meta; DELETE FROM directory_erasure_notices; DELETE FROM memberships; DELETE FROM profiles")
  for (const r of PERSON_REFS) await db.exec(`DELETE FROM ${r.table}`) })

describe("making a request", () => {
  it("stores the details encrypted, emails a confirmation link, and nothing happens before it is used", async () => {
    await ins("a", "anna@fund.com", null)
    expect(await createRequest({ kind: "access", email: " Anna@Fund.com ", note: "hi" })).toMatchObject({ created: true })
    const [r] = await rows("SELECT * FROM dsar_requests")
    expect(r).toMatchObject({ kind: "access", status: "verifying", requester_email_hash: hashEmail("anna@fund.com", "dsar-hash-key") })
    expect(r.details_enc).not.toMatch(/anna|fund\.com/); expect(r.verify_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(state.mails).toHaveLength(1); expect(state.mails[0]).toMatchObject({ to: "anna@fund.com", purpose: "transactional" })
    expect(state.mails[0].text).toContain("/api/public/privacy-request/verify?t=")
    expect(JSON.stringify(r)).not.toContain(tokenOf())
    expect(Number((await rows("SELECT due_at > now() + interval '29 days' AS ok FROM dsar_requests"))[0].ok)).toBeTruthy()
  })
  it("validates the kind, the address and the profile", async () => {
    await expect(createRequest({ kind: "delete-all", email: "a@b.co" })).rejects.toBeInstanceOf(DsarError)
    await expect(createRequest({ kind: "access", email: "nope" })).rejects.toThrow(/valid email/)
    await expect(createRequest({ kind: "access", email: "a@b.co", linkedin: "https://linkedin.com/company/x" })).rejects.toThrow(/LinkedIn/)
  })
  it("does not create a second open request of the same kind for the same address, and gives no sign of it", async () => {
    await createRequest({ kind: "access", email: "a@b.co" })
    expect(await createRequest({ kind: "access", email: "A@B.co" })).toEqual({ created: false })
    expect(await createRequest({ kind: "erasure", email: "a@b.co" })).toMatchObject({ created: true })
    expect(state.mails).toHaveLength(2)
  })
  it("removes the request when the confirmation mail cannot be sent, so it can be retried", async () => {
    state.failSend = true
    await expect(createRequest({ kind: "access", email: "a@b.co" })).rejects.toThrow()
    expect(await rows("SELECT id FROM dsar_requests")).toHaveLength(0)
  })
  it("the form token is signed, needs a few seconds, and expires", () => {
    const t = makeFormToken(1_000_000)
    expect(formTokenOk(t, 1_000_500)).toBe(false); expect(formTokenOk(t, 1_005_000)).toBe(true); expect(formTokenOk(t, 1_000_000 + 3 * 3600_000)).toBe(false)
    expect(formTokenOk(t.replace(/.$/, "x"), 1_005_000)).toBe(false); expect(formTokenOk("", 1)).toBe(false)
  })
})

describe("confirming", () => {
  it("confirms once; the link then stops working", async () => {
    await createRequest({ kind: "access", email: "a@b.co" }); const t = tokenOf()
    expect(await verifyRequest(t)).toEqual({ ok: true, kind: "access" })
    expect((await rows("SELECT status, verified_at, verify_token_hash FROM dsar_requests"))[0]).toMatchObject({ status: "verified", verify_token_hash: null })
    expect(await verifyRequest(t)).toEqual({ ok: false, reason: "invalid" })
    expect(await verifyRequest("short")).toEqual({ ok: false, reason: "invalid" })
  })
  it("an expired link is refused and the request closed with its details wiped", async () => {
    await createRequest({ kind: "access", email: "a@b.co" }); const t = tokenOf()
    await db.exec("UPDATE dsar_requests SET verify_expires_at = now() - interval '1 day'")
    expect(await verifyRequest(t)).toEqual({ ok: false, reason: "expired" })
    expect((await rows("SELECT status, details_enc FROM dsar_requests"))[0]).toMatchObject({ status: "expired", details_enc: null })
  })
  it("an objection from a confirmed address is carried out at once: suppression, tombstones, done, and a confirmation mail", async () => {
    await ins("a", "anna@fund.com", "https://www.linkedin.com/in/anna")
    await createRequest({ kind: "objection", email: "Anna@fund.com" }); await verifyRequest(tokenOf())
    expect(state.suppressed).toEqual([{ email: "anna@fund.com", reason: "objection", source: "dsar" }])
    const t = await rows("SELECT email_hash, linkedin_hash, source, reason FROM directory_tombstones ORDER BY id")
    expect(t).toHaveLength(2); expect(t.every((x) => x.source === null && x.reason === "objection")).toBe(true)
    expect(t[0].email_hash).toBe(hashEmail("anna@fund.com", "dsar-hash-key"))
    expect((await rows("SELECT status, closed_at, outcome FROM dsar_requests"))[0]).toMatchObject({ status: "done", outcome: { suppressedEmails: 1, tombstones: 2, directoryRows: 1 } })
    expect(state.mails.at(-1).subject).toMatch(/objection/)
  })
  it("a second objection does not duplicate tombstones", async () => {
    await createRequest({ kind: "objection", email: "a@b.co" }); await verifyRequest(tokenOf())
    await createRequest({ kind: "objection", email: "a@b.co" }); await verifyRequest(tokenOf())
    expect(await rows("SELECT id FROM directory_tombstones")).toHaveLength(1)
  })
})

describe("operator actions", () => {
  it("finds the records at the confirmed address, and only offers LinkedIn matches as candidates", async () => {
    await ins("a", "anna@fund.com", null); await ins("b", "other@x.com", "https://www.linkedin.com/in/anna-b", "Bea")
    const id = await mk("access", "anna@fund.com", "https://linkedin.com/in/anna-b")
    const g = await getRequest(id)
    expect(g.details).toMatchObject({ email: "anna@fund.com" }); expect(g.found.byEmail.map((x) => x.id)).toEqual(["a"]); expect(g.found.byLinkedIn.map((x) => x.id)).toEqual(["b"])
    const unconfirmed = await (async () => { await createRequest({ kind: "access", email: "z@z.co" }); return (await rows("SELECT id FROM dsar_requests WHERE kind='access' ORDER BY created_at DESC LIMIT 1"))[0].id })()
    expect((await getRequest(unconfirmed)).found).toEqual({ byEmail: [], byLinkedIn: [] })
  })
  it("sends an access report to the confirmed address only, with no workspace named, and closes the request", async () => {
    await ins("a", "anna@fund.com", null); await db.query("INSERT INTO crm_people (org_id, investor_id) VALUES ('orgSecret', 'a'), ('orgTwo', 'a')")
    const id = await mk("access"); state.mails.length = 0
    expect(await sendAccess(id, "ops@sail.test")).toEqual({ rows: 1 })
    const m = state.mails[0]; expect(m.to).toBe("anna@fund.com"); expect(m.text).toContain('"first_name": "Anna"'); expect(m.text).toContain('"copiesHeldByWorkspaces": 2'); expect(m.text).not.toMatch(/orgSecret|orgTwo/)
    expect((await rows("SELECT status, handled_by FROM dsar_requests"))[0]).toMatchObject({ status: "done", handled_by: "ops@sail.test" })
    await expect(sendAccess(id, "ops@sail.test")).rejects.toThrow(/closed/)
  })
  it("an access report includes a LinkedIn candidate only when the operator ticks it", async () => {
    await ins("a", "anna@fund.com", null); await ins("b", "other@x.com", "https://www.linkedin.com/in/anna-b", "Bea")
    const id = await mk("access", "anna@fund.com", "https://linkedin.com/in/anna-b"); state.mails.length = 0
    expect(await sendAccess(id, "ops")).toEqual({ rows: 1 })
    const id2 = await mk("access", "anna@fund.com", "https://linkedin.com/in/anna-b"); state.mails.length = 0
    expect(await sendAccess(id2, "ops", ["b", "not-a-candidate"])).toEqual({ rows: 2 })
    expect(state.mails[0].text).not.toContain("not-a-candidate")
  })
  it("refuses an action before the address is confirmed, and an action of the wrong kind", async () => {
    await createRequest({ kind: "access", email: "z@z.co" }); const id = (await rows("SELECT id FROM dsar_requests"))[0].id
    await expect(sendAccess(id, "ops")).rejects.toMatchObject({ status: 409 })
    const id2 = await mk("restriction", "r@r.co")
    await expect(sendAccess(id2, "ops")).rejects.toThrow(/not an access/)
  })
  it("corrects only the named fields, resets hashes when an address changes, and tells the person", async () => {
    await ins("a", "anna@fund.com", null); await db.query("UPDATE investors SET hashed_at = now(), email_hash = 'x'")
    const id = await mk("rectification"); state.mails.length = 0
    await rectify(id, "ops", [], { first_name: "Anne", title: "Founder", source: "hacked", is_active: "false" })
    expect((await rows("SELECT first_name, title, source, is_active FROM investors"))[0]).toEqual({ first_name: "Anne", title: "Founder", source: "folk", is_active: true })
    expect(state.mails[0].to).toBe("anna@fund.com")
    const id2 = await mk("rectification", "anna@fund.com"); await rectify(id2, "ops", [], { email: "anne@new.com" })
    expect((await rows("SELECT email, hashed_at FROM investors"))[0]).toMatchObject({ email: "anne@new.com", hashed_at: null })
  })
  it("rectification needs a field and refuses an empty first name", async () => {
    await ins("a", "anna@fund.com", null); const id = await mk("rectification")
    await expect(rectify(id, "ops", [], {})).rejects.toThrow(/at least one field/)
    await expect(rectify(id, "ops", [], { first_name: " " })).rejects.toThrow(/first name/)
  })
  it("restriction keeps the record, takes it out of use, and blocks outreach to the person", async () => {
    await ins("a", "anna@fund.com", "https://www.linkedin.com/in/anna")
    const id = await mk("restriction"); await restrict(id, "ops", [])
    expect((await rows("SELECT is_active, restricted_at FROM investors"))[0]).toMatchObject({ is_active: false }); expect((await rows("SELECT restricted_at FROM investors"))[0].restricted_at).not.toBeNull()
    await expect(enforceEmailUse("Anna@Fund.com")).rejects.toBeInstanceOf(DirectoryUseError)
  })
  it("refusal and extension need a reason; an extension is allowed once, up to 60 days, and moves the due date", async () => {
    await ins("a", "anna@fund.com", null)
    const id = await mk("access")
    await expect(refuse(id, "ops", "no")).rejects.toThrow(/10 characters/)
    await expect(extend(id, "ops", 61, "complex request")).rejects.toThrow(/1 to 60/)
    await extend(id, "ops", 30, "complex request, several records")
    expect(Number((await rows("SELECT extended_to > due_at + interval '29 days' AS ok FROM dsar_requests"))[0].ok)).toBeTruthy()
    await expect(extend(id, "ops", 5, "again please soon")).rejects.toThrow(/already been extended/)
    await refuse(id, "ops", "We could not match you to a record")
    expect((await rows("SELECT status, refusal_reason FROM dsar_requests"))[0]).toMatchObject({ status: "refused", refusal_reason: "We could not match you to a record" })
  })
  it("the list masks the address and flags overdue requests", async () => {
    await mk("access", "anna@fund.com"); await db.exec("UPDATE dsar_requests SET due_at = now() - interval '1 day'")
    const [r] = await listRequests(); expect(r).toMatchObject({ email: "a***@fund.com", overdue: true, kind: "access" })
  })
})

describe("erasure", () => {
  const setup = async () => {
    await ins("a", "anna@fund.com", "https://www.linkedin.com/in/anna"); await ins("b", "other@x.com", "https://www.linkedin.com/in/anna-b", "Bea")
    await db.exec(`INSERT INTO investor_matches (investor_id) VALUES ('a'), ('b'); INSERT INTO crm_people (org_id, investor_id) VALUES ('orgOne', 'a'), ('orgTwo', 'a'), ('orgTwo', 'b'); INSERT INTO crm_entries (org_id, investor_id) VALUES ('orgOne', 'a'), ('orgOne', 'a'), ('orgOne', 'a');
      INSERT INTO match_outcome_events (investor_id) VALUES ('a'); INSERT INTO memberships VALUES ('u1', 'orgOne', 'workspace_owner'), ('u2', 'orgTwo', 'admin'), ('u3', 'orgTwo', 'member'); INSERT INTO profiles VALUES ('u1', 'one@own.test'), ('u2', 'two@own.test'), ('u3', 'three@own.test')`)
    return mk("erasure", "anna@fund.com", "https://linkedin.com/in/anna-b")
  }
  it("previews the counts per table and the workspaces to tell, and changes nothing", async () => {
    const id = await setup()
    const p = await erasePreview(id)
    expect(p).toMatchObject({ people: 1, wouldDelete: 0, wouldAnonymise: 1, workspacesToTell: 2 })
    expect(p.byTable.find((t) => t.table === "investor_matches")).toMatchObject({ fate: "delete", rows: 1 })
    expect(p.byTable.find((t) => t.table === "crm_people")).toMatchObject({ fate: "keep", owner: "workspace", rows: 2 })
    expect((await rows("SELECT first_name FROM investors WHERE id='a'"))[0].first_name).toBe("Anna"); expect(await rows("SELECT 1 FROM directory_tombstones")).toHaveLength(0)
  })
  it("will not erase without the confirmation, and refuses before the address is confirmed", async () => {
    const id = await setup()
    await expect(erase(id, "ops", [], false)).rejects.toThrow(/confirm/)
    await createRequest({ kind: "erasure", email: "z@z.co" }); const un = (await rows("SELECT id FROM dsar_requests WHERE status='verifying'"))[0].id
    await expect(erase(un, "ops", [], true)).rejects.toMatchObject({ status: 409 })
    expect((await rows("SELECT first_name FROM investors WHERE id='a'"))[0].first_name).toBe("Anna")
  })
  it("erases: suppression, tombstones, derived rows gone, the person a shell, workspaces told once, requester told, request closed", async () => {
    const id = await setup(); state.mails.length = 0
    expect(await erase(id, "ops@sail.test", [], true)).toMatchObject({ people: 1, deleted: 0, anonymised: 1, workspacesTold: 2 })
    expect(state.suppressed).toEqual([{ email: "anna@fund.com", reason: "erasure", source: "dsar" }])
    const t = await rows("SELECT email_hash, linkedin_hash, source, reason FROM directory_tombstones"); expect(t.length).toBeGreaterThanOrEqual(2); expect(t.every((x) => x.source === null && x.reason === "erasure")).toBe(true)
    expect(await rows("SELECT investor_id FROM investor_matches")).toEqual([{ investor_id: "b" }])
    expect(Number((await rows("SELECT count(*)::int n FROM crm_people WHERE investor_id='a'"))[0].n)).toBe(2)   // the workspaces' copies are untouched
    expect(Number((await rows("SELECT count(*)::int n FROM match_outcome_events"))[0].n)).toBe(1)             // aggregates survive
    expect((await rows("SELECT first_name, email, linkedin_url, person_linkedin_url, is_active, status FROM investors WHERE id='a'"))[0]).toEqual({ first_name: "Removed", email: null, linkedin_url: null, person_linkedin_url: null, is_active: false, status: "removed" })
    expect((await rows("SELECT first_name FROM investors WHERE id='b'"))[0].first_name).toBe("Bea")           // an unticked LinkedIn candidate is untouched
    const notices = await rows("SELECT org_id, records, mailed FROM directory_erasure_notices ORDER BY org_id"); expect(notices).toEqual([{ org_id: "orgOne", records: 3, mailed: 1 }, { org_id: "orgTwo", records: 1, mailed: 1 }])
    const ws = state.mails.filter((m) => m.via === "privacy-erasure-notice"); expect(ws.map((m) => m.to).sort()).toEqual(["one@own.test", "two@own.test"])
    expect(JSON.stringify(ws)).not.toMatch(/Anna|anna@|Berg/)
    expect(state.mails.find((m) => m.to === "anna@fund.com")).toBeTruthy()
    expect((await rows("SELECT status, handled_by FROM dsar_requests WHERE id=$1", [id]))[0]).toMatchObject({ status: "done", handled_by: "ops@sail.test" })
    await expect(erase(id, "ops", [], true)).rejects.toThrow(/closed/)
  })
  it("a ticked LinkedIn candidate is erased too; a person with no workspace reference is deleted outright", async () => {
    const id = await setup()
    expect(await erase(id, "ops", ["b", "ghost"], true)).toMatchObject({ people: 2, anonymised: 2 })
    await ins("c", "free@x.com", null, "Cy"); const id2 = await mk("erasure", "free@x.com")
    expect(await erase(id2, "ops", [], true)).toMatchObject({ people: 1, deleted: 1, anonymised: 0, workspacesTold: 0 })
    expect(await rows("SELECT 1 FROM investors WHERE id='c'")).toHaveLength(0)
  })
  it("erases and tombstones even when the address is not in the directory, so it cannot be added later", async () => {
    const id = await mk("erasure", "unknown@x.com")
    expect(await erase(id, "ops", [], true)).toMatchObject({ people: 0 })
    expect((await rows("SELECT email_hash FROM directory_tombstones"))[0].email_hash).toBe(hashEmail("unknown@x.com", "dsar-hash-key"))
  })
  it("a repeated notice is not mailed twice for the same request", async () => {
    const id = await setup(); await erase(id, "ops", [], true); state.mails.length = 0
    const { workspaceCopies } = await import("./erasure")
    expect(await workspaceCopies(["a"])).toEqual(new Map([["orgOne", 3], ["orgTwo", 1]]))
  })
})

describe("housekeeping", () => {
  it("wipes the details of a request closed more than 30 days ago, and expires unconfirmed ones", async () => {
    const id = await mk("access", "a@a.co"); await refuse(id, "ops", "Cannot verify identity here")
    await db.query("UPDATE dsar_requests SET closed_at = now() - interval '31 days' WHERE id = $1", [id])
    await createRequest({ kind: "access", email: "b@b.co" }); await db.exec("UPDATE dsar_requests SET verify_expires_at = now() - interval '1 day' WHERE status = 'verifying'")
    await db.exec("INSERT INTO dsar_requests (id, kind, status, requester_email_hash, due_at, closed_at) VALUES ('old', 'access', 'done', 'h', now() - interval '4 years', now() - interval '4 years')")
    expect(await expireRequests()).toEqual({ expired: 1, wiped: 1, deleted: 1 })
    expect((await rows("SELECT details_enc FROM dsar_requests")).every((r) => r.details_enc === null)).toBe(true)
  })
  it("sends one due digest a day and nothing when nothing is due", async () => {
    expect(await dueDigest()).toEqual({ sent: false, count: 0 })
    await mk("access", "a@a.co"); await db.exec("UPDATE dsar_requests SET due_at = now() + interval '3 days'"); state.mails.length = 0
    expect(await dueDigest()).toEqual({ sent: true, count: 1 }); expect(state.mails[0].to).toBe("vc@an-ker.de")
    expect(await dueDigest()).toEqual({ sent: false, count: 1 })
  })
})
