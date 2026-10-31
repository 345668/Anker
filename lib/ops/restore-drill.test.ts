// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { runDrill, neonApi, judge, IMPORTANT_TABLES, TOLERANCE } from "../../scripts/lib/restore-drill.mjs"

/** docs/architecture/59 R4: the drill logic against two real databases (PGlite stands for production and for the restored branch) and a fake Neon. */
const NOW = Date.parse("2026-10-31T12:00:00Z"), HOUR = 3600_000
let prodDb: PGlite
const mk = async () => {
  const db = new PGlite()
  await db.exec(`CREATE TABLE organizations(id int, created_at timestamptz DEFAULT now()); CREATE TABLE memberships(id int, created_at timestamptz DEFAULT now()); CREATE TABLE crm_entries(id int, created_at timestamptz DEFAULT now()); CREATE TABLE schema_migrations(name text);
    INSERT INTO schema_migrations VALUES ('a'), ('b');`)
  return db
}
const fill = (db: PGlite, t: string, n: number, minutesAgo: number) => db.exec(`INSERT INTO ${t} SELECT g, '${new Date(NOW - minutesAgo * 60_000).toISOString()}' FROM generate_series(1, ${n}) g`)
const q = (db: PGlite) => async (text: string, params: unknown[] = []) => (await db.query(text, params as any[])).rows as any[]
const fakeApi = (log: string[], over: Record<string, unknown> = {}) => ({ createBranch: async () => { log.push("create"); return { branchId: "br-1", uri: "postgres://x" } }, deleteBranch: async (id: string) => { log.push("delete " + id) }, ...over })
const run = (branch: PGlite | null, log: string[], over: Record<string, unknown> = {}) => {
  const records: any[] = []
  return runDrill({ api: fakeApi(log, over.api as any), prod: q(prodDb), connect: () => ({ query: branch ? q(branch) : async () => { throw new Error("connection refused") }, close: async () => { log.push("close") } }), record: async (r: any) => { records.push(r) }, now: () => NOW, sleep: async () => {}, attempts: 3, ...(over.run as any) }).then((row: any) => ({ row, records }))
}
beforeAll(async () => { prodDb = await mk() })
afterAll(async () => prodDb.close())

describe("the judgement of one table", () => {
  it("rows written since the point in time may be missing from the branch, a little slack either way, nothing else", () => {
    expect(judge("t", 1000, 940, 60).ok).toBe(true)          // 60 written in the last hour
    expect(judge("t", 1000, 1000, 60).ok).toBe(true)         // nothing deleted either
    expect(judge("t", 1000, 700, 60).ok).toBe(false)         // 240 rows gone
    expect(judge("t", 1000, 1100, 0).ok).toBe(false)         // more than production has
    expect(judge("t", 5, 0, 0).ok).toBe(true)                // tiny tables: the floor of 10
    expect(judge("t", 100000, 99100, 0).ok).toBe(true); expect(judge("t", 100000, 98900, 0).ok).toBe(false)   // 1%
    expect(TOLERANCE).toEqual({ relative: 0.01, floor: 10 }); expect(IMPORTANT_TABLES.length).toBe(20)
  })
})

describe("the drill", () => {
  it("passes on a whole restore, records counts and timings, and always deletes the branch", async () => {
    await prodDb.exec("DELETE FROM organizations; DELETE FROM memberships; DELETE FROM crm_entries")
    for (const t of ["organizations", "memberships", "crm_entries"]) { await fill(prodDb, t, 500, 300); await fill(prodDb, t, 40, 20) }       // 40 rows written in the last hour
    const branch = await mk(); for (const t of ["organizations", "memberships", "crm_entries"]) await fill(branch, t, 500, 300)
    const log: string[] = [], { row, records } = await run(branch, log)
    expect(row).toMatchObject({ passed: true, tablesChecked: 3, tablesOff: 0, ageMin: 60, seconds: 0 }); expect(row.detail.queries).toEqual({ organizations: 500, migrationsRecorded: 2, columns: expect.any(Number) })
    expect(log).toEqual(["create", "close", "delete br-1"]); expect(records).toHaveLength(1); expect(row.detail.branchDeleted).toBe(true)
    expect(JSON.stringify(row)).not.toMatch(/postgres:\/\/|password/)       // no connection string or secret in what is recorded
    await branch.close()
  })
  it("fails and says which table is off when the restored copy is missing data, and still deletes the branch", async () => {
    const branch = await mk(); for (const t of ["organizations", "memberships"]) await fill(branch, t, 500, 300); await fill(branch, "crm_entries", 200, 300)
    const log: string[] = [], { row } = await run(branch, log)
    expect(row.passed).toBe(false); expect(row.tablesOff).toBe(1); expect(row.detail.tables.find((t: any) => !t.ok)).toMatchObject({ table: "crm_entries", prod: 540, restored: 200 }); expect(log.at(-1)).toBe("delete br-1"); await branch.close()
  })
  it("a branch that answers but is empty fails", async () => {
    const branch = await new PGlite().exec("CREATE TABLE organizations(id int); CREATE TABLE schema_migrations(name text)").then(async () => { const d = new PGlite(); await d.exec("CREATE TABLE organizations(id int, created_at timestamptz); CREATE TABLE memberships(id int, created_at timestamptz); CREATE TABLE crm_entries(id int, created_at timestamptz); CREATE TABLE schema_migrations(name text)"); return d })
    const { row } = await run(branch, []); expect(row.passed).toBe(false); await branch.close()
  })
  it("a branch that never accepts connections fails after the retries, with the reason, and is deleted", async () => {
    const log: string[] = [], { row } = await run(null, log)
    expect(row.passed).toBe(false); expect(row.detail.error).toMatch(/did not accept connections.*connection refused/); expect(log).toEqual(["create", "close", "delete br-1"])
  })
  it("a failed branch creation records the failure and has nothing to delete", async () => {
    const log: string[] = [], { row, records } = await run(null, log, { api: { createBranch: async () => { throw new Error("Neon answered 422: point in time is outside the history window") } } })
    expect(row.passed).toBe(false); expect(row.detail.error).toMatch(/history window/); expect(log).toEqual([]); expect(records).toHaveLength(1)
  })
  it("a branch that cannot be deleted is never reported as a pass, and says where to remove it", async () => {
    const branch = await mk(); const log: string[] = []
    const { row } = await run(branch, log, { api: { deleteBranch: async () => { throw new Error("Neon answered 500") } } })
    expect(row.passed).toBe(false); expect(row.detail.branchDeleted).toBe(false); expect(row.detail.deleteError).toMatch(/500/); await branch.close()
  })
})

describe("the Neon calls", () => {
  it("create a read-only branch at a point in time and delete it; the key is only in the Authorization header", async () => {
    const calls: any[] = []
    const fetchImpl: any = async (url: string, init: any) => { calls.push({ url, ...init }); return { ok: true, status: 200, json: async () => (init.method === "POST" ? { branch: { id: "br-9" }, connection_uris: [{ connection_uri: "postgres://u:p@h/db" }] } : {}) } }
    const api = neonApi({ apiKey: "SECRET-KEY-123", projectId: "proj-1", fetchImpl })
    expect(await api.createBranch({ name: "n", parentTimestamp: "2026-10-31T11:00:00.000Z" })).toEqual({ branchId: "br-9", uri: "postgres://u:p@h/db" })
    await api.deleteBranch("br-9")
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://console.neon.tech/api/v2/projects/proj-1/branches" }); expect(JSON.parse(calls[0].body)).toEqual({ branch: { name: "n", parent_timestamp: "2026-10-31T11:00:00.000Z" }, endpoints: [{ type: "read_only" }] })
    expect(calls[1]).toMatchObject({ method: "DELETE", url: "https://console.neon.tech/api/v2/projects/proj-1/branches/br-9" })
    for (const c of calls) { expect(c.headers.Authorization).toBe("Bearer SECRET-KEY-123"); expect(c.url + (c.body ?? "")).not.toContain("SECRET-KEY") }
  })
  it("an error says what Neon answered without echoing the key, and a response without a connection address is explained", async () => {
    const bad = neonApi({ apiKey: "SECRET-KEY-123", projectId: "p", fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: "forbidden" }) }) as any })
    await expect(bad.createBranch({ name: "n", parentTimestamp: "t" })).rejects.toThrow(/403.*forbidden/); await expect(bad.createBranch({ name: "n", parentTimestamp: "t" }).catch((e) => e.message)).resolves.not.toContain("SECRET")
    const none = neonApi({ apiKey: "k", projectId: "p", fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ branch: { id: "x" } }) }) as any })
    await expect(none.createBranch({ name: "n", parentTimestamp: "t" })).rejects.toThrow(/history window/)
  })
})
