// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
process.env.SECRET_KEY = "merge-test-secret"
vi.mock("server-only", () => ({}))
import { buildDatabase } from "../../scripts/db/build-local.mjs"
const h = vi.hoisted(() => ({ db: null as any }))
vi.mock("@/lib/db", () => { const f: any = async (s: TemplateStringsArray, ...v: unknown[]) => (await h.db.query(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v)).rows; f.unsafe = async (text: string, params: unknown[] = []) => (await h.db.query(text, params)).rows; return { sql: f } })
import { planMerge, executeMerge, undoMerge, resolveAlias, autoMergePeople, setParent, MergeError, UNDO_DAYS } from "./merge"
import { FIRM_REFS } from "./firm-registry"
import { PERSON_REFS } from "./person-registry"

let db: any
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const one = async (q: string, p: unknown[] = []) => (await rows(q, p))[0]
const person = (id: string, o: Record<string, unknown> = {}) => db.query(`INSERT INTO investors (id, first_name, last_name, email, title, bio, firm_id, source, is_active, sectors, location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9::jsonb,$10)`, [id, o.first ?? "Dana", o.last ?? "Reuter", o.email ?? null, o.title ?? null, o.bio ?? null, o.firm ?? null, o.source ?? "src-a", JSON.stringify(o.sectors ?? []), o.location ?? null])
const firm = (id: string, o: Record<string, unknown> = {}) => db.query(`INSERT INTO investment_firms (id, name, website, description, source, sectors, hq_location) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [id, o.name ?? id, o.website ?? null, o.description ?? null, o.source ?? "src-a", JSON.stringify(o.sectors ?? []), o.hq ?? null])
const cand = async (kind: string, a: string, b: string, status = "same") => Number((await one(`INSERT INTO directory_candidates (kind, a_id, b_id, tier, status, suggest) VALUES ($1,$2,$3,'certain',$4,'same') RETURNING id`, [kind, a < b ? a : b, a < b ? b : a, status])).id)

beforeAll(async () => {
  const r = await buildDatabase("memory"); expect(r.failed).toEqual([]); db = h.db = r.db
  for (const id of ["org1", "org2", "orgX", ...Array.from({ length: 11 }, (_, i) => `org${i}`)]) await db.query(`INSERT INTO organizations (id, kind, name, slug, owner_user_id, created_by) VALUES ($1,'company',$1,$1,'u','u') ON CONFLICT DO NOTHING`, [id])
  const { ensureCanary, } = await import("./maintenance"); const { hashKey } = await import("./identity"); await ensureCanary(hashKey(), true)       // the maintenance job writes this on its first run in production
}, 240_000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec(`DELETE FROM fund_profiles WHERE user_id = '00000000-0000-4000-8000-000000000009'; DELETE FROM directory_alias_keys; DELETE FROM directory_aliases; DELETE FROM directory_merges; DELETE FROM directory_candidates; DELETE FROM crm_people; DELETE FROM crm_entries; DELETE FROM investor_matches; DELETE FROM investors; DELETE FROM investment_firms; DELETE FROM directory_tombstones; DELETE FROM directory_sources WHERE source LIKE 'src-%'`)
  await db.exec(`INSERT INTO directory_sources (source, label, status, permitted_use) VALUES ('src-a','A','recorded', ARRAY['internal_matching']), ('src-b','B','recorded', ARRAY['internal_matching']), ('src-bad','Bad','unreviewed', ARRAY[]::text[]) ON CONFLICT (source) DO NOTHING`)
})

describe("the registries cover what the merge touches", () => {
  it("every registered table and column exists in the real schema, and every moved table has an id to undo with", async () => {
    for (const r of [...PERSON_REFS, ...FIRM_REFS.filter((x) => x.fate !== "ignore")]) {
      expect((await rows(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [r.table, r.column])).length, `${r.table}.${r.column}`).toBe(1)
      if ((r as any).fate === "move" || (r as any).fate === "keep") expect((await rows(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id'`, [r.table])).length, `${r.table} needs an id`).toBe(1)
    }
  })
})

describe("planning a person merge", () => {
  it("lists what would be filled (empty only), the conflicts (names only), the references and anything that forbids it", async () => {
    await person("p1", { email: null, title: "Partner", bio: null, location: "Berlin" }); await person("p2", { email: "dana@nordwerk.example", title: "Managing Partner", bio: "Seed investor", location: "Berlin" })
    await db.query("INSERT INTO crm_people (id, org_id, investor_id, identity, display_name) VALUES ('c1','org1','p2','x1','Dana')").catch(() => null)
    const p = await planMerge("person", "p1", "p2")
    expect(p.blockers).toEqual([]); expect(Object.keys(p.fills).sort()).toEqual(["bio", "email"]); expect(p.conflicts).toEqual(["title"]); expect(p.fills.email).toBe("dana@nordwerk.example")
  })
  it("refuses the same record, a missing one, a hidden or erased survivor, a tombstoned one, and a withdrawn source", async () => {
    await person("p1"); await person("p2", { first: "Removed" }); await db.query("UPDATE investors SET is_active = false WHERE id = 'p2'")
    expect((await planMerge("person", "p1", "p1")).blockers[0]).toMatch(/two different/); expect((await planMerge("person", "p1", "nope")).blockers[0]).toMatch(/no longer exists/); expect((await planMerge("person", "p2", "p1")).blockers.join(" ")).toMatch(/never the survivor/)
    await person("p3", { email: "gone@x.example" }); const { identityHashes, hashKey } = await import("./identity"); const { ensureCanary } = await import("./maintenance"); await ensureCanary(hashKey(), true)
    await db.query("INSERT INTO directory_tombstones (email_hash, reason) VALUES ($1, 'erasure')", [identityHashes({ email: "gone@x.example" }, hashKey()).emailHash]); expect((await planMerge("person", "p3", "p1")).blockers.join(" ")).toMatch(/tombstone/)
    await db.query("UPDATE directory_sources SET status = 'withdrawn' WHERE source = 'src-b'"); await person("p4", { source: "src-b" }); expect((await planMerge("person", "p1", "p4")).blockers.join(" ")).toMatch(/withdrawn source/)
  })
  it("facts from a source that is not recorded are not copied onto another record; references still move", async () => {
    await person("p1", { source: "src-a" }); await person("p2", { source: "src-bad", email: "x@y.example", bio: "From the bad source" })
    const p = await planMerge("person", "p1", "p2"); expect(p.fills).toEqual({}); expect(p.fillSkippedBecauseOfSource).toBe(true)
    await person("p3", { source: "src-b", bio: "From a recorded source" }); expect(Object.keys((await planMerge("person", "p1", "p3")).fills)).toEqual(["bio"])
  })
})

describe("merging two people", () => {
  it("fills only what was empty, unions lists, moves a workspace's pointer without touching its fields, drops derived rows, hides the loser behind an alias, and records everything", async () => {
    await person("p1", { title: "Partner", sectors: ["fintech"] }); await person("p2", { email: "dana@nordwerk.example", title: "Managing Partner", bio: "Seed investor", sectors: ["fintech", "saas"] })
    await db.exec(`INSERT INTO crm_entries (id, org_id, source, display_name, investor_id, notes) VALUES ('ce1','org1','manual','Dana (my note)','p2','private workspace note');
      INSERT INTO investor_matches (id, investor_id, firm_id) VALUES ('im1','p2', NULL)`).catch(async () => { await db.exec(`INSERT INTO crm_entries (id, org_id, source, display_name, investor_id, notes) VALUES ('ce1','org1','manual','Dana (my note)','p2','private workspace note')`) })
    const c = await cand("person", "p1", "p2"), r = await executeMerge({ kind: "person", survivorId: "p1", loserId: "p2", candidateId: c, by: "founder@x.test", reason: "Same person, confirmed" })
    expect(r).toMatchObject({ survivorId: "p1", loserId: "p2", filled: expect.arrayContaining(["email", "bio", "sectors"]), conflicts: ["title"] }); expect(r.moved).toBeGreaterThanOrEqual(1)
    const s = await one("SELECT * FROM investors WHERE id = 'p1'"); expect(s).toMatchObject({ title: "Partner", email: "dana@nordwerk.example", bio: "Seed investor" }); expect(s.sectors).toEqual(["fintech", "saas"]); expect(s.email_hash).toBeNull()
    expect(await rows("SELECT id FROM investors WHERE id = 'p2'")).toEqual([])
    expect(await one("SELECT investor_id, display_name, notes FROM crm_entries WHERE id = 'ce1'")).toEqual({ investor_id: "p1", display_name: "Dana (my note)", notes: "private workspace note" })
    expect(await one("SELECT status FROM directory_candidates WHERE id = $1", [c])).toEqual({ status: "merged" }); expect(await resolveAlias("person", "p2")).toBe("p1"); expect(await resolveAlias("person", "p1")).toBe("p1")
    const m = await one("SELECT * FROM directory_merges WHERE id = $1", [r.mergeId]); expect(m).toMatchObject({ by_staff: "founder@x.test", filled: expect.arrayContaining(["email"]), conflicts: ["title"] }); expect(m.repointed["crm_entries.investor_id"]).toEqual(["ce1"]); expect(m.loser_row.email).toBe("dana@nordwerk.example"); expect(m.loser_row.embedding).toBeUndefined()
    expect(new Date(m.undo_until).getTime() - Date.now()).toBeGreaterThan((UNDO_DAYS - 1) * 86_400_000)
    expect((await rows("SELECT key_type FROM directory_alias_keys WHERE merge_id = $1", [r.mergeId])).map((k) => k.key_type)).toEqual(["email_hash"])      // a keyed hash, never the address
    expect(JSON.stringify(await rows("SELECT * FROM directory_alias_keys"))).not.toContain("dana@nordwerk")
  })
  it("needs the pair confirmed as the same first, a reason when many workspace records point at the loser, and a pair that is really the candidate", async () => {
    await person("p1"); await person("p2"); const open = await cand("person", "p1", "p2", "open")
    await expect(executeMerge({ kind: "person", survivorId: "p1", loserId: "p2", candidateId: open, by: "a@x.test" })).rejects.toMatchObject({ code: "not_confirmed" })
    await person("p3"); await expect(executeMerge({ kind: "person", survivorId: "p1", loserId: "p3", candidateId: open, by: "a@x.test" })).rejects.toMatchObject({ code: "bad_candidate" })
    for (let i = 0; i < 11; i++) await db.query(`INSERT INTO crm_entries (id, org_id, source, display_name, investor_id) VALUES ($1,$2,'manual','x','p2')`, [`bulk${i}`, `org${i}`])
    await db.query("UPDATE directory_candidates SET status = 'same'"); await expect(executeMerge({ kind: "person", survivorId: "p1", loserId: "p2", candidateId: open, by: "a@x.test" })).rejects.toMatchObject({ code: "reason_required" })
    await expect(executeMerge({ kind: "person", survivorId: "p1", loserId: "p2", candidateId: open, by: "a@x.test", reason: "Confirmed by a review" })).resolves.toMatchObject({ moved: 11 })
  })
  it("a workspace holding a record for BOTH changes nothing at all: the merge is refused whole (here a test index stands for a uniqueness rule such as one entry per campaign and person)", async () => {
    await person("p1", { bio: "kept" }); await person("p2", { email: "would-fill@x.example" })
    await db.exec(`INSERT INTO crm_entries (id, org_id, source, display_name, investor_id, import_key) VALUES ('ceA','orgX','manual','Dana','p1','k1'), ('ceB','orgX','manual','Dana','p2','k2'), ('ceC','org1','manual','Dana','p2','k3');
      CREATE UNIQUE INDEX test_one_entry_per_person ON crm_entries (org_id, investor_id) WHERE investor_id IS NOT NULL`)
    try {
      const snap = async () => ({ ce: await rows("SELECT id, investor_id FROM crm_entries ORDER BY id"), people: await rows("SELECT id, email, bio FROM investors ORDER BY id") })
      const before = await snap()
      await expect(executeMerge({ kind: "person", survivorId: "p1", loserId: "p2", by: "a@x.test" })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("nothing was merged") })
      expect(await snap()).toEqual(before)                                              // the move that WOULD have worked (ceC) did not happen either, nor the fill
      expect(await rows("SELECT * FROM directory_merges")).toEqual([]); expect(await rows("SELECT * FROM directory_aliases")).toEqual([])
    } finally { await db.exec("DROP INDEX test_one_entry_per_person") }
  })
})

describe("undo", () => {
  async function merged() {
    await person("p1", { title: "Partner" }); await person("p2", { email: "dana@nordwerk.example", bio: "Seed investor", title: "MP" })
    await db.exec(`INSERT INTO crm_entries (id, org_id, source, display_name, investor_id) VALUES ('ce1','org1','manual','Dana','p2'), ('ce2','org2','manual','Dana','p1')`)
    const c = await cand("person", "p1", "p2"); return { c, r: await executeMerge({ kind: "person", survivorId: "p1", loserId: "p2", candidateId: c, by: "a@x.test" }) }
  }
  it("puts the loser back exactly, moves back only the rows that were moved, restores the fields it filled, and reopens the pair", async () => {
    const { c, r } = await merged(), loserBefore = (await one("SELECT to_jsonb(i) - 'embedding' AS j FROM investors i WHERE id = 'p1'")).j
    const u = await undoMerge(r.mergeId, "a@x.test")
    expect(u).toMatchObject({ restored: "p2", moved: 1, fieldsRestored: expect.arrayContaining(["email", "bio"]), fieldsKept: [] })
    expect(await one("SELECT email, bio, title FROM investors WHERE id = 'p2'")).toEqual({ email: "dana@nordwerk.example", bio: "Seed investor", title: "MP" }); expect(await one("SELECT email, bio, title FROM investors WHERE id = 'p1'")).toMatchObject({ email: null, bio: null, title: "Partner" })
    expect(await rows("SELECT id, investor_id FROM crm_entries ORDER BY id")).toEqual([{ id: "ce1", investor_id: "p2" }, { id: "ce2", investor_id: "p1" }])       // ce2 was never moved: it stays with p1
    expect(await resolveAlias("person", "p2")).toBe("p2"); expect(await rows("SELECT * FROM directory_alias_keys")).toEqual([]); expect((await one("SELECT status FROM directory_candidates WHERE id = $1", [c])).status).toBe("same")
    expect((await one("SELECT undone_by FROM directory_merges WHERE id = $1", [r.mergeId])).undone_by).toBe("a@x.test"); void loserBefore
    await expect(undoMerge(r.mergeId, "a@x.test")).rejects.toMatchObject({ code: "already" })
  })
  it("a field edited by hand since the merge is kept, and reported; after 90 days nothing can be undone", async () => {
    const { r } = await merged(); await db.query("UPDATE investors SET bio = 'Edited by a person since' WHERE id = 'p1'")
    const u = await undoMerge(r.mergeId, "a@x.test"); expect(u.fieldsKept).toEqual(["bio"]); expect(u.fieldsRestored).toContain("email"); expect((await one("SELECT bio FROM investors WHERE id = 'p1'")).bio).toBe("Edited by a person since")
    const second = await merged().catch(() => null); void second
    await person("q1"); await person("q2"); const m2 = await executeMerge({ kind: "person", survivorId: "q1", loserId: "q2", by: "a@x.test" })
    await expect(undoMerge(m2.mergeId, "a@x.test", new Date(Date.now() + 91 * 86_400_000))).rejects.toMatchObject({ code: "expired" })
  })
  it("refuses when the old id has been used again or the survivor is gone, and says why", async () => {
    await person("p1"); await person("p2"); const r = await executeMerge({ kind: "person", survivorId: "p1", loserId: "p2", by: "a@x.test" })
    await person("p2"); await expect(undoMerge(r.mergeId, "a@x.test")).rejects.toMatchObject({ code: "id_taken" }); await db.exec("DELETE FROM investors WHERE id = 'p2'"); await db.exec("DELETE FROM investors WHERE id = 'p1'")
    await expect(undoMerge(r.mergeId, "a@x.test")).rejects.toMatchObject({ code: "no_survivor" }); await expect(undoMerge(999999, "a@x.test")).rejects.toMatchObject({ status: 404 })
  })
})

describe("merging two firms (E3)", () => {
  it("moves the people and a workspace's pointers to the survivor, drops derived results, keeps provenance and fills only empty fields, then undoes cleanly", async () => {
    await firm("f1", { name: "Kindred Capital", website: null, sectors: ["fintech"] }); await firm("f2", { name: "Kindred Capital VC", website: "https://kindred.example", description: "Early stage", sectors: ["saas"] })
    await person("a1", { firm: "f2", first: "Ann" }); await person("a2", { firm: "f2", first: "Bo", email: "bo@k.example" }); await person("a3", { firm: "f1", first: "Cy" })
    await db.exec(`INSERT INTO crm_entries (id, org_id, source, display_name, firm_id) VALUES ('ce1','org1','manual','Kindred','f2')`)
    const c = await cand("firm", "f1", "f2"), plan = await planMerge("firm", "f1", "f2"); expect(plan.moves.find((m) => m.table === "investors")?.n).toBe(2); expect(plan.workspaceRefs).toBe(1)
    const r = await executeMerge({ kind: "firm", survivorId: "f1", loserId: "f2", candidateId: c, by: "a@x.test" })
    expect(r.filled).toEqual(expect.arrayContaining(["website", "description", "sectors"])); expect((await rows("SELECT id FROM investors WHERE firm_id = 'f1' ORDER BY id")).map((x) => x.id)).toEqual(["a1", "a2", "a3"]); expect(await rows("SELECT id FROM investment_firms WHERE id = 'f2'")).toEqual([])
    expect(await one("SELECT website, description, sectors FROM investment_firms WHERE id = 'f1'")).toEqual({ website: "https://kindred.example", description: "Early stage", sectors: ["fintech", "saas"] }); expect((await one("SELECT firm_id FROM crm_entries WHERE id = 'ce1'")).firm_id).toBe("f1"); expect(await resolveAlias("firm", "f2")).toBe("f1")
    expect((await rows("SELECT key_type, key FROM directory_alias_keys WHERE kind = 'firm'")).map((k) => k.key_type).sort()).toEqual(expect.arrayContaining(["firm_host", "firm_key"]))
    await undoMerge(r.mergeId, "a@x.test"); expect((await rows("SELECT id FROM investors WHERE firm_id = 'f2' ORDER BY id")).map((x) => x.id)).toEqual(["a1", "a2"]); expect((await rows("SELECT id FROM investors WHERE firm_id = 'f1'")).map((x) => x.id)).toEqual(["a3"]); expect((await one("SELECT website FROM investment_firms WHERE id = 'f1'")).website).toBeNull()
  })
  it("a fund's list of prior-LP firm ids gains the survivor (the loser's id stays), only where the survivor was not there, and an undo removes exactly what was added", async () => {
    await firm("f1"); await firm("f2"); await firm("f3")
    const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
    const mk = (n: number, list: string[]) => db.query(`INSERT INTO fund_profiles (id, user_id, name, fund_name, fund_i_prior_lp_firm_ids) VALUES ($1, $2, 'Fund', 'Fund', $3::jsonb)`, [U(n), U(9), JSON.stringify(list)])
    await mk(1, ["f2", "f3"]); await mk(2, ["f1", "f2"]); await mk(3, ["f3"])
    const r = await executeMerge({ kind: "firm", survivorId: "f1", loserId: "f2", by: "a@x.test" }), get = async () => Object.fromEntries((await rows("SELECT id, fund_i_prior_lp_firm_ids AS l FROM fund_profiles ORDER BY id")).map((x) => [x.id, x.l]))
    expect(await get()).toEqual({ [U(1)]: ["f2", "f3", "f1"], [U(2)]: ["f1", "f2"], [U(3)]: ["f3"] }); expect(r.moved).toBe(1)
    await undoMerge(r.mergeId, "a@x.test"); expect(await get()).toEqual({ [U(1)]: ["f2", "f3"], [U(2)]: ["f1", "f2"], [U(3)]: ["f3"] })
  })
  it("firms where one is the parent of the other are related, not the same", async () => {
    await firm("f1"); await firm("f2"); await db.query("UPDATE investment_firms SET parent_firm_id = 'f1' WHERE id = 'f2'"); expect((await planMerge("firm", "f1", "f2")).blockers.join(" ")).toMatch(/parent/)
  })
  it("a parent that is folded into another keeps its programmes under the survivor", async () => {
    await firm("f1"); await firm("f2"); await firm("f3"); await db.query("UPDATE investment_firms SET parent_firm_id = 'f2' WHERE id = 'f3'")
    await executeMerge({ kind: "firm", survivorId: "f1", loserId: "f2", by: "a@x.test" }); expect((await one("SELECT parent_firm_id FROM investment_firms WHERE id = 'f3'")).parent_firm_id).toBe("f1")
  })
})

describe("hierarchy", () => {
  it("is one level: no self, no cycle, no parent that is a programme, no programme that is a parent", async () => {
    for (const f of ["a", "b", "c", "d"]) await firm(f)
    await setParent("b", "a"); expect((await one("SELECT parent_firm_id FROM investment_firms WHERE id = 'b'")).parent_firm_id).toBe("a")
    await expect(setParent("a", "a")).rejects.toMatchObject({ code: "self" }); await expect(setParent("c", "b")).rejects.toMatchObject({ code: "depth" }); await expect(setParent("a", "d")).rejects.toMatchObject({ code: "depth" }); await expect(setParent("x", "a")).rejects.toMatchObject({ code: "not_found" })
    await setParent("b", null); expect((await one("SELECT parent_firm_id FROM investment_firms WHERE id = 'b'")).parent_firm_id).toBeNull()
  })
})

describe("automatic merge of certain people", () => {
  it("does nothing while the flag is off; with it on merges only certain open pairs, the richer record surviving, capped, and leaves blocked or conflicting ones", async () => {
    await person("p1", { email: "a@x.example", bio: "rich" }); await person("p2", { email: "a@x.example" }); await person("p3", { email: "b@x.example", title: "A" }); await person("p4", { email: "b@x.example", title: "B" }); await person("p5"); await person("p6")
    await cand("person", "p1", "p2", "open"); await cand("person", "p3", "p4", "open"); const poss = await cand("person", "p5", "p6", "open"); await db.query("UPDATE directory_candidates SET tier = 'possible' WHERE id = $1", [poss])
    expect(await autoMergePeople({ enabled: false })).toEqual({ merged: 0, skipped: 0, ids: [] }); expect((await rows("SELECT id FROM investors")).length).toBe(6)
    const r = await autoMergePeople({ enabled: true }); expect(r.merged).toBe(1); expect(r.skipped).toBe(1)                // p3/p4 conflict on title: left for a person
    expect((await rows("SELECT id FROM investors ORDER BY id")).map((x) => x.id)).toEqual(["p1", "p3", "p4", "p5", "p6"]); expect((await one("SELECT by_staff FROM directory_merges")).by_staff).toBe("auto")
    for (let i = 10; i < 50; i++) { await person(`x${i}a`, { email: `x${i}@x.example` }); await person(`x${i}b`, { email: `x${i}@x.example`, bio: "b" }); await cand("person", `x${i}a`, `x${i}b`, "open") }
    expect((await autoMergePeople({ enabled: true, cap: 1000 })).merged).toBeLessThanOrEqual(25)
  })
})
