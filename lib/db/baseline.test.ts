// @vitest-environment node
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { buildDatabase } from "../../scripts/db/build-local.mjs"

/** docs/architecture/59 section 4 (R2) and 75: a database built from nothing equals production as it was recorded, or the differences are listed. */
describe("the schema baseline", () => {
  it("builds from nothing, and what it builds equals the production schema recorded with it", async () => {
    const date = readdirSync("db/baseline").filter((f) => f.endsWith(".schema.json")).sort().at(-1)!.replace(".schema.json", "")
    const want: { tables: Record<string, { columns: string[]; indexes: string[] }> } = JSON.parse(readFileSync(`db/baseline/${date}.schema.json`, "utf8"))
    const { db, failed, newer } = await buildDatabase("memory")
    expect(failed, `migrations newer than the baseline that fail on top of it: ${JSON.stringify(failed)}`).toEqual([])
    const cols = (await db.query("SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position")).rows as any[]
    const idx = (await db.query("SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname")).rows as any[]
    const got: Record<string, { columns: string[]; indexes: string[] }> = {}
    for (const c of cols) (got[c.table_name] ??= { columns: [], indexes: [] }).columns.push(`${c.column_name}:${c.data_type}:${c.is_nullable === "YES" ? "null" : "notnull"}`)
    for (const i of idx) (got[i.tablename] ??= { columns: [], indexes: [] }).indexes.push(i.indexname)
    // Migrations newer than the baseline are applied on top, so the build may hold more than the recorded production schema; it must never hold less.
    const missingTables = Object.keys(want.tables).filter((t) => !got[t])
    const missingColumns = Object.entries(want.tables).flatMap(([t, v]) => (got[t] ? v.columns.filter((c) => !got[t].columns.includes(c)).map((c) => `${t}.${c}`) : []))
    const missingIndexes = Object.entries(want.tables).flatMap(([t, v]) => (got[t] ? v.indexes.filter((i) => !got[t].indexes.includes(i)).map((i) => `${t}.${i}`) : []))
    expect({ missingTables, missingColumns, missingIndexes }).toEqual({ missingTables: [], missingColumns: [], missingIndexes: [] })
    if (newer.length === 0) expect(Object.keys(got).sort()).toEqual(Object.keys(want.tables).sort())       // nothing newer: exactly the same set of tables
    await db.close()
  }, 120000)
  it("records the migrations production had applied, so only newer ones are applied on top", () => {
    const date = readdirSync("db/baseline").filter((f) => f.endsWith(".ledger.json")).sort().at(-1)!
    const ledger = JSON.parse(readFileSync(`db/baseline/${date}`, "utf8"))
    expect(ledger.applied.length).toBeGreaterThan(100)
    expect(ledger.applied).toContain("2026-10-21-investor-legal.sql")
  })
})
