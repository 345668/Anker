/** Hash fill, tombstones, the sweep and the purge of a withdrawn source, against a real Postgres (PGlite) with the real migrations. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => {
  const f: any = (s: TemplateStringsArray, ...v: unknown[]) => state.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v)
  f.unsafe = (text: string, v: unknown[] = []) => state.q(text, v)
  return { sql: f }
})
process.env.DIRECTORY_HASH_KEY = "test-key-1"
import { fillHashes, isTombstoned, sweepTombstoned, purgeWithdrawn, eraseRows, ensureCanary, HashKeyMismatchError, INVESTOR_REFS, runMaintenance } from "./maintenance"
import { hashEmail, hashLinkedIn } from "./identity"
import { PERSON_REFS } from "./person-registry"

let db: PGlite
const K = "test-key-1"
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const ins = (id: string, email: string | null, li: string | null, source: string, first = "Anna") =>
  db.query("INSERT INTO investors (id, first_name, last_name, email, linkedin_url, person_linkedin_url, source, title, bio, metadata) VALUES ($1,$2,'Berg',$3,NULL,$4,$5,'Partner','bio','{}')", [id, first, email, li, source])

beforeAll(async () => {
  db = new PGlite()
  state.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE investors (id varchar PRIMARY KEY, first_name varchar NOT NULL, last_name varchar, email varchar, phone varchar, title varchar, linkedin_url varchar, person_linkedin_url varchar, twitter_url varchar, avatar varchar,
      bio text, address varchar, folk_id varchar, folk_custom_fields jsonb, investment_thesis text, recent_investments text, embedding text, metadata jsonb DEFAULT '{}', status varchar, is_active boolean DEFAULT true, source varchar, created_at timestamp DEFAULT now(), updated_at timestamp);
    CREATE TABLE investment_firms (id serial PRIMARY KEY, name text, source text);
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);`)
  for (const [t, c] of INVESTOR_REFS) await db.exec(`CREATE TABLE IF NOT EXISTS ${t} (${c} text)`)
  await db.exec(readFileSync("scripts/migrations/2026-10-16-directory-sources.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-16b-directory-tombstones.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-16f-directory-candidates.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  process.env.DIRECTORY_HASH_KEY = K
  await db.exec("DELETE FROM investors; DELETE FROM directory_candidates; DELETE FROM directory_tombstones; DELETE FROM directory_hash_meta; UPDATE directory_sources SET purged_at = NULL")
  for (const [t] of INVESTOR_REFS) await db.exec(`DELETE FROM ${t}`)
})

describe("fillHashes and the canary", () => {
  it("hashes email and profile for every row, once, and reports nothing left", async () => {
    await ins("a", "Anna@Fund.com", "https://www.linkedin.com/in/anna", "s1"); await ins("b", null, null, "s1", "Ben")
    expect(await fillHashes()).toEqual({ hashed: 2, more: false })
    const [a] = await rows("SELECT email_hash, linkedin_hashes FROM investors WHERE id='a'")
    expect(a.email_hash).toBe(hashEmail("anna@fund.com", K)); expect(a.linkedin_hashes).toEqual([hashLinkedIn("https://linkedin.com/in/anna", K)])
    const [b] = await rows("SELECT email_hash, linkedin_hashes, hashed_at FROM investors WHERE id='b'")
    expect(b.email_hash).toBeNull(); expect(b.linkedin_hashes).toBeNull(); expect(b.hashed_at).not.toBeNull()
    expect(await fillHashes()).toEqual({ hashed: 0, more: false })
  })
  it("stops at its time budget and resumes", async () => {
    for (let i = 0; i < 5; i++) await ins(`r${i}`, `p${i}@x.com`, null, "s1")
    let t = 0
    const r1 = await fillHashes({ batch: 2, budgetMs: 1, now: () => (t += 5) })
    expect(r1.more).toBe(true); expect(r1.hashed).toBe(2)
    expect((await fillHashes({ batch: 2 })).more).toBe(false)
    expect(Number((await rows("SELECT count(*)::int n FROM investors WHERE hashed_at IS NULL"))[0].n)).toBe(0)
  })
  it("refuses to hash or compare under a different key than the one that wrote the canary", async () => {
    await ensureCanary(K)
    process.env.DIRECTORY_HASH_KEY = "another-key"
    await expect(fillHashes()).rejects.toBeInstanceOf(HashKeyMismatchError)
    await expect(isTombstoned({ email: "a@b.co" })).rejects.toBeInstanceOf(HashKeyMismatchError)
  })
})

describe("tombstones", () => {
  it("a global tombstone stops the person from any source, by email or by profile; a source-scoped one only for its source", async () => {
    await ensureCanary(K)
    await db.query("INSERT INTO directory_tombstones (email_hash, reason) VALUES ($1, 'erasure')", [hashEmail("gone@x.com", K)])
    await db.query("INSERT INTO directory_tombstones (linkedin_hash, reason) VALUES ($1, 'objection')", [hashLinkedIn("https://linkedin.com/in/nope", K)])
    await db.query("INSERT INTO directory_tombstones (email_hash, source, reason) VALUES ($1, 'vendor', 'batch_withdrawn')", [hashEmail("v@x.com", K)])
    expect(await isTombstoned({ email: "GONE@x.com", source: "any" })).toBe(true)
    expect(await isTombstoned({ linkedinUrl: "https://www.linkedin.com/in/nope/", source: "any" })).toBe(true)
    expect(await isTombstoned({ email: "v@x.com", source: "vendor" })).toBe(true)
    expect(await isTombstoned({ email: "v@x.com", source: "licensed" })).toBe(false)
    expect(await isTombstoned({ email: "fine@x.com" })).toBe(false)
    expect(await isTombstoned({})).toBe(false)
  })
  it("an expired tombstone no longer applies", async () => {
    await ensureCanary(K)
    await db.query("INSERT INTO directory_tombstones (email_hash, reason, expires_at) VALUES ($1, 'bounce_hard', now() - interval '1 day')", [hashEmail("old@x.com", K)])
    expect(await isTombstoned({ email: "old@x.com" })).toBe(false)
  })
  it("holds no name or plain address", async () => {
    await ensureCanary(K)
    await db.query("INSERT INTO directory_tombstones (email_hash, reason) VALUES ($1, 'erasure')", [hashEmail("secret@x.com", K)])
    expect(JSON.stringify(await rows("SELECT * FROM directory_tombstones"))).not.toMatch(/secret|x\.com/)
  })
})

describe("sweep", () => {
  it("removes a re-added person who matches a tombstone, keeps everyone else, and is idempotent", async () => {
    await ins("a", "gone@x.com", null, "s2"); await ins("b", "keep@x.com", null, "s2", "Bo"); await ins("c", null, "https://linkedin.com/in/gone-li", "s2", "Cy")
    await fillHashes()
    await db.query("INSERT INTO directory_tombstones (email_hash, reason) VALUES ($1, 'erasure')", [hashEmail("gone@x.com", K)])
    await db.query("INSERT INTO directory_tombstones (linkedin_hash, reason) VALUES ($1, 'objection')", [hashLinkedIn("https://linkedin.com/in/gone-li", K)])
    expect(await sweepTombstoned()).toEqual({ removed: 2, deleted: 2, anonymised: 0 })
    expect((await rows("SELECT id FROM investors ORDER BY id")).map((r) => r.id)).toEqual(["b"])
    expect((await sweepTombstoned()).removed).toBe(0)
  })
  it("a source-scoped tombstone sweeps only that source", async () => {
    await ins("a", "dup@x.com", null, "vendor"); await ins("b", "dup@x.com", null, "licensed", "Same")
    await fillHashes()
    await db.query("INSERT INTO directory_tombstones (email_hash, source, reason) VALUES ($1, 'vendor', 'batch_withdrawn')", [hashEmail("dup@x.com", K)])
    await sweepTombstoned()
    expect((await rows("SELECT id FROM investors")).map((r) => r.id)).toEqual(["b"])
  })
})

describe("eraseRows", () => {
  it("deletes an unreferenced person and anonymises one that a deal or CRM copy refers to", async () => {
    await ins("free", "f@x.com", "https://linkedin.com/in/f", "s3"); await ins("used", "u@x.com", "https://linkedin.com/in/u", "s3", "Uma")
    await db.query("INSERT INTO deals (investor_id) VALUES ('used')")
    await fillHashes()
    expect(await eraseRows(["free", "used"])).toEqual({ deleted: 1, anonymised: 1 })
    expect(await rows("SELECT id FROM investors WHERE id='free'")).toHaveLength(0)
    const [u] = await rows("SELECT * FROM investors WHERE id='used'")
    expect(u).toMatchObject({ first_name: "Removed", last_name: null, email: null, linkedin_url: null, person_linkedin_url: null, title: null, bio: null, is_active: false, status: "removed", email_hash: null, linkedin_hashes: null })
    expect(u.metadata).toEqual({ anonymised: true })
  })
  it("a table that holds a workspace's record of the person keeps the person as a shell; a derived table is cleared and does not keep the person alive", async () => {
    for (const r of PERSON_REFS) {
      await db.query("DELETE FROM investors"); await ins("x", "x@x.com", null, "s3")
      await db.query(`INSERT INTO ${r.table} (${r.column}) VALUES ('x')`)
      const out = await eraseRows(["x"])
      if (r.fate === "keep") expect(out, `${r.table}.${r.column}`).toEqual({ deleted: 0, anonymised: 1 })
      else { expect(out, `${r.table}.${r.column}`).toEqual({ deleted: 1, anonymised: 0 }); expect(await rows(`SELECT 1 FROM ${r.table}`), `${r.table} cleared`).toHaveLength(0) }
      await db.query(`DELETE FROM ${r.table}`)
    }
  })
  it("a candidate pair that names an erased person goes with them, and one that does not stays", async () => {
    await ins("x", "x@x.com", null, "s3"); await ins("y", "y@x.com", null, "s3", "Yan"); await ins("z", "z@x.com", null, "s3", "Zed")
    await db.exec("INSERT INTO directory_candidates (kind, a_id, b_id, tier) VALUES ('person', 'x', 'y', 'certain'), ('person', 'y', 'z', 'probable'), ('firm', 'x', 'z', 'probable')")
    await eraseRows(["x"])
    expect((await rows("SELECT a_id, b_id, kind FROM directory_candidates ORDER BY a_id")).map((r) => `${r.kind}:${r.a_id}-${r.b_id}`)).toEqual(["firm:x-z", "person:y-z"])
  })
  it("anonymises rather than deletes when the reference check cannot run (a missing table)", async () => {
    await ins("x", "x@x.com", null, "s3")
    await db.exec("ALTER TABLE outreaches RENAME TO outreaches_gone")
    try { expect(await eraseRows(["x"])).toEqual({ deleted: 0, anonymised: 1 }) } finally { await db.exec("ALTER TABLE outreaches_gone RENAME TO outreaches") }
  })
})

describe("purge of a withdrawn source", () => {
  const withdraw = (src: string, daysAgo: number) => db.query("INSERT INTO directory_sources (source, status, withdrawn_at, permitted_use) VALUES ($1, 'withdrawn', now() - make_interval(days => $2), '{}') ON CONFLICT (source) DO UPDATE SET status='withdrawn', withdrawn_at = EXCLUDED.withdrawn_at", [src, daysAgo])
  it("waits for the hold, then tombstones the source's people and removes them", async () => {
    await ins("a", "a@v.com", "https://linkedin.com/in/a", "wv"); await ins("b", "b@v.com", null, "wv", "Bo"); await ins("k", "k@k.com", null, "licensed", "Kim")
    await db.query("INSERT INTO deals (investor_id) VALUES ('b')")
    await withdraw("wv", 10)
    expect(await purgeWithdrawn()).toEqual([])
    expect(Number((await rows("SELECT count(*)::int n FROM investors"))[0].n)).toBe(3)
    await withdraw("wv", 31)
    const [r] = await purgeWithdrawn()
    expect(r).toMatchObject({ source: "wv", people: 2, tombstones: 3, deleted: 1, anonymised: 1 })
    expect((await rows("SELECT id, first_name FROM investors ORDER BY id")).map((x) => x.id + ":" + x.first_name)).toEqual(["b:Removed", "k:Kim"])
    expect((await rows("SELECT purged_at FROM directory_sources WHERE source='wv'"))[0].purged_at).not.toBeNull()
    // the same people can come back from a licensed source, but not from the withdrawn one
    expect(await isTombstoned({ email: "a@v.com", source: "wv" })).toBe(true)
    expect(await isTombstoned({ email: "a@v.com", source: "licensed" })).toBe(false)
    // run again: nothing more to do
    expect(await purgeWithdrawn()).toEqual([])
  })
  it("runMaintenance hashes first, then sweeps and purges", async () => {
    await ins("a", "a@v.com", null, "wv2"); await withdraw("wv2", 40)
    const r = await runMaintenance({ budgetMs: 5000 })
    expect(r.hashes).toEqual({ hashed: 1, more: false }); expect(r.purged.find((x) => x.source === "wv2")).toMatchObject({ source: "wv2", people: 1, tombstones: 1 })
  })
})
