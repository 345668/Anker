/** The source register against a real Postgres (PGlite) with the real migration: backfill, import gate, email and LinkedIn use gate. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ sql: vi.fn(), audits: [] as any[] }))
vi.mock("@/lib/db", () => ({ sql: state.sql }))
vi.mock("@/lib/audit/audit-log", () => ({ logAudit: async (e: any) => { state.audits.push(e) } }))
import { registerSource, importBlockedReason, enforceEmailUse, enforceLinkedInUse, DirectoryUseError, _resetGateCache, getSource } from "./sources"

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE investors (id serial PRIMARY KEY, email text, linkedin_url text, person_linkedin_url text, source text);
    CREATE TABLE investment_firms (id serial PRIMARY KEY, name text, source text);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);
    INSERT INTO investors (email, linkedin_url, source) VALUES ('a@old.com', 'https://www.linkedin.com/in/anna', 'folk'), ('b@vendor.com', 'https://www.linkedin.com/in/ben', 'drop:2026-10-13'),
      ('c@lic.com', 'https://www.linkedin.com/in/cara', 'csv:licensed'), ('d@none.com', NULL, NULL);
    INSERT INTO investment_firms (name, source) VALUES ('Fund', 'folk'), ('Other', 'seed-x');`)
  await db.exec(readFileSync("scripts/migrations/2026-10-16-directory-sources.sql", "utf8"))
  state.sql.mockImplementation(async (s: TemplateStringsArray, ...v: unknown[]) => (await db.query(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v)).rows)
}, 30000)
afterAll(async () => db.close())
beforeEach(() => { state.audits.length = 0; _resetGateCache() })
const flag = async (on: boolean) => { await db.query("UPDATE platform_flags SET enabled = $1 WHERE key = 'directory_use_gate'", [on]); _resetGateCache() }

describe("migration and backfill", () => {
  it("registers every existing source as unreviewed with no invented licence, and records the vendor sample as restricted", async () => {
    const rows = (await db.query("SELECT source, status, licence_summary, permitted_use FROM directory_sources ORDER BY source")).rows as any[]
    const by = Object.fromEntries(rows.map((r) => [r.source, r]))
    for (const s of ["folk", "seed-x", "csv:licensed", "unknown"]) expect(by[s]).toMatchObject({ status: "unreviewed", licence_summary: null, permitted_use: ["internal_matching"] })
    expect(by["drop:2026-10-13"]).toMatchObject({ status: "restricted", permitted_use: ["internal_matching"] })
  })
  it("is safe to run twice", async () => {
    await db.exec(readFileSync("scripts/migrations/2026-10-16-directory-sources.sql", "utf8"))
    expect(Number(((await db.query("SELECT count(*)::int AS n FROM directory_sources WHERE source = 'drop:2026-10-13'")).rows[0] as any).n)).toBe(1)
  })
  it("ships with the gate flag off", async () => expect(((await db.query("SELECT enabled FROM platform_flags WHERE key = 'directory_use_gate'")).rows[0] as any).enabled).toBe(false))
})

describe("register and import gate", () => {
  it("refuses an unregistered source and a withdrawn one, allows a registered one", async () => {
    expect(await importBlockedReason("brand-new")).toMatch(/not in the directory source register/)
    await registerSource({ source: "brand-new", kind: "partner_list", licenceSummary: "Partner agreed in writing", permittedUse: ["internal_matching", "outreach_email"], reviewedBy: "ops" })
    expect(await importBlockedReason("brand-new")).toBeNull()
    await db.query("UPDATE directory_sources SET status = 'withdrawn' WHERE source = 'brand-new'")
    expect(await importBlockedReason("brand-new")).toMatch(/withdrawn/)
  })
  it("requires a licence summary, valid uses and a known kind; never loosens a restricted source", async () => {
    const base = { source: "x1", kind: "seed", licenceSummary: "ok", permittedUse: ["resale"], reviewedBy: "ops" }
    await expect(registerSource({ ...base, licenceSummary: " " })).rejects.toThrow(/licence summary/)
    await expect(registerSource({ ...base, permittedUse: [] })).rejects.toThrow(/permitted use/i)
    await expect(registerSource({ ...base, permittedUse: ["spam"] })).rejects.toThrow(/permitted use/i)
    await expect(registerSource({ ...base, kind: "bogus" })).rejects.toThrow(/kind/)
    await expect(registerSource({ ...base, source: "drop:2026-10-13", permittedUse: ["internal_matching", "outreach_email"] })).rejects.toThrow(/restricted/)
    expect(await getSource("drop:2026-10-13")).toMatchObject({ status: "restricted", permitted_use: ["internal_matching"] })
  })
})

describe("use gate on email and LinkedIn", () => {
  it("warns only for an unreviewed source while the flag is off, with an audit entry that has no address", async () => {
    await expect(enforceEmailUse("A@old.com")).resolves.toBeUndefined()
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({ action: "directory.use_gate_would_block", metadata: { purpose: "outreach_email", sources: ["folk"] } })
    expect(JSON.stringify(state.audits[0])).not.toMatch(/old\.com/)
  })
  it("refuses the vendor sample at once for email and LinkedIn, flag off or on", async () => {
    for (const on of [false, true]) {
      await flag(on)
      await expect(enforceEmailUse("b@vendor.com")).rejects.toBeInstanceOf(DirectoryUseError)
      await expect(enforceLinkedInUse("https://www.linkedin.com/in/ben/")).rejects.toBeInstanceOf(DirectoryUseError)
    }
  })
  it("refuses an unreviewed source once the flag is on", async () => {
    await flag(true)
    await expect(enforceEmailUse("a@old.com")).rejects.toMatchObject({ code: "directory_use_blocked" })
    await expect(enforceLinkedInUse("https://linkedin.com/in/anna")).rejects.toBeInstanceOf(DirectoryUseError)
    await flag(false)
  })
  it("allows a source whose licence permits the use, and addresses that are not directory people", async () => {
    await registerSource({ source: "csv:licensed", kind: "partner_list", licenceSummary: "Licensed", permittedUse: ["internal_matching", "outreach_email", "outreach_linkedin"], reviewedBy: "ops" })
    await flag(true)
    await expect(enforceEmailUse("c@lic.com")).resolves.toBeUndefined()
    await expect(enforceLinkedInUse("https://www.linkedin.com/in/cara")).resolves.toBeUndefined()
    await expect(enforceEmailUse("stranger@else.com")).resolves.toBeUndefined()
    await expect(enforceLinkedInUse("https://www.linkedin.com/in/nobody")).resolves.toBeUndefined()
    await flag(false)
  })
  it("a withdrawn source is refused even for a person it shares with a licensed one only when no source allows it", async () => {
    await db.query("INSERT INTO investors (email, source) VALUES ('c@lic.com', 'drop:2026-10-13')")
    await flag(true)
    await expect(enforceEmailUse("c@lic.com")).resolves.toBeUndefined() // the licensed source still allows it
    await db.query("DELETE FROM investors WHERE source = 'drop:2026-10-13' AND email = 'c@lic.com'")
    await flag(false)
  })
  it("a failure of the check never blocks a send", async () => {
    await db.exec("ALTER TABLE directory_sources RENAME TO ds_tmp")
    await expect(enforceEmailUse("b@vendor.com")).resolves.toBeUndefined()
    await db.exec("ALTER TABLE ds_tmp RENAME TO directory_sources")
  })
})
