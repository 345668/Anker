/** Candidate detection stored against a real Postgres (PGlite) with the real migration: decisions survive, stale marking, nothing in the directory changes. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => state.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => state.q(t, v); return { sql: f } })
import { runDetection } from "./candidates"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const person = (id: string, first: string, last: string, email: string | null, firm: string | null, li: string | null = null) =>
  db.query("INSERT INTO investors (id, first_name, last_name, email, person_linkedin_url, firm_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,'{}')", [id, first, last, email, li, firm])
const firm = (id: string, name: string, website: string | null, source = "folk") => db.query("INSERT INTO investment_firms (id, name, website, source) VALUES ($1,$2,$3,$4)", [id, name, website, source])
const snapshot = async () => JSON.stringify([await rows("SELECT * FROM investors ORDER BY id"), await rows("SELECT * FROM investment_firms ORDER BY id")])

beforeAll(async () => {
  db = new PGlite()
  state.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE investors (id varchar PRIMARY KEY, first_name varchar, last_name varchar, email varchar, linkedin_url varchar, person_linkedin_url varchar, firm_id varchar, metadata jsonb DEFAULT '{}');
    CREATE TABLE investment_firms (id varchar PRIMARY KEY, name text, website text, source text); CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-16f-directory-candidates.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM investors; DELETE FROM investment_firms; DELETE FROM directory_candidates") })

describe("runDetection", () => {
  it("stores firm and person candidates, ordered, and changes no directory data", async () => {
    await firm("f1", "Spring Capital", "https://springcapital.com", "drop"); await firm("f2", "Spring Capital", "springcapital.com"); await firm("f3", "Unrelated Partners", null)
    await person("p1", "Anna", "Berg", "anna@fund.com", "f1"); await person("p2", "Anna", "Berg", "ANNA@fund.com", "f2"); await person("p3", "Ben", "Stein", "ben@x.com", "f3")
    const before = await snapshot()
    const r = await runDetection()
    expect(r.firms.found).toBe(1); expect(r.people.found).toBe(1)
    const c = await rows("SELECT kind, a_id, b_id, tier, status, suggest FROM directory_candidates ORDER BY kind")
    expect(c).toEqual([{ kind: "firm", a_id: "f1", b_id: "f2", tier: "probable", status: "open", suggest: "same" }, { kind: "person", a_id: "p1", b_id: "p2", tier: "certain", status: "open", suggest: "same" }])
    expect(await snapshot()).toBe(before)
  })
  it("a firm pair is probable at the shared person's firms too (people at both firms)", async () => {
    await firm("a", "Kindred Capital", "https://kindred.vc"); await firm("b", "Kindred Capital VC", "https://kindred.vc")
    await person("p1", "Kim", "Lee", "kim@kindred.vc", "a"); await person("p2", "Kim", "Lee", "kim@kindred.vc", "b")
    await runDetection()
    const c = (await rows("SELECT evidence, tier FROM directory_candidates WHERE kind='firm'"))[0]
    expect(c.evidence.sharedPeople).toBe(1); expect(c.tier).toBe("probable")
  })
  it("running again changes nothing, and a person's decision survives every run", async () => {
    await firm("f1", "Spring Capital", "https://springcapital.com"); await firm("f2", "Spring Capital", "springcapital.com")
    await runDetection()
    await db.exec("UPDATE directory_candidates SET status = 'distinct', decided_by = 'ops@sail.test', decided_at = now(), reason = 'two funds' WHERE kind = 'firm'")
    await runDetection(); await runDetection()
    expect(await rows("SELECT status, decided_by, reason FROM directory_candidates")).toEqual([{ status: "distinct", decided_by: "ops@sail.test", reason: "two funds" }])
    expect(await rows("SELECT id FROM directory_candidates")).toHaveLength(1)
  })
  it("an open candidate that is no longer found goes stale, and comes back open if it is found again", async () => {
    await firm("f1", "Spring Capital", "https://springcapital.com"); await firm("f2", "Spring Capital", "springcapital.com")
    await runDetection()
    await db.exec("UPDATE investment_firms SET name = 'Autumn Capital' WHERE id = 'f2'")
    const r = await runDetection()
    expect(r.firms.stale).toBe(1); expect((await rows("SELECT status FROM directory_candidates"))[0].status).toBe("stale")
    await db.exec("UPDATE investment_firms SET name = 'Spring Capital' WHERE id = 'f2'")
    await runDetection()
    expect((await rows("SELECT status FROM directory_candidates"))[0].status).toBe("open")
  })
  it("a decided pair is not marked stale when the evidence goes away", async () => {
    await firm("f1", "Spring Capital", null); await firm("f2", "Spring Capital", null)
    await runDetection(); await db.exec("UPDATE directory_candidates SET status = 'related', parent_id = 'f1'")
    await db.exec("UPDATE investment_firms SET name = 'Other Name' WHERE id = 'f2'")
    await runDetection()
    expect(await rows("SELECT status, parent_id FROM directory_candidates")).toEqual([{ status: "related", parent_id: "f1" }])
  })
  it("anonymised people and generic-size groups are left out", async () => {
    await person("p1", "Anna", "Berg", "a@b.co", null); await person("p2", "Anna", "Berg", "a@b.co", null)
    await db.exec("UPDATE investors SET metadata = '{\"anonymised\": true}' WHERE id = 'p2'")
    expect((await runDetection()).people.found).toBe(0)
  })
})
