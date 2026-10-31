/**
 * The guard on firm merges: every column that holds a directory firm's id must be classified in the firm registry. A new table that is not fails here, in CI, before a merge can leave a
 * reference behind (docs/architecture/55, E3). The twin of person-registry.coverage.test.ts.
 */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { FIRM_REFS, FIRM_LIST_REFS, BACKUP_PREFIXES } from "./firm-registry"
import SNAPSHOT from "./firm-refs.snapshot.json"

const known = new Set([...FIRM_REFS, ...FIRM_LIST_REFS].map((r) => `${r.table}.${r.column}`))
const DIR = "scripts/migrations"
function migrationRefs(): string[] {
  const out: string[] = []
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "")
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s*\(([\s\S]*?)\n?\)\s*;/gi))
      for (const c of m[2].matchAll(/(?:^|[\s,(])((?:[a-z_]*_)?firm_ids?)\s+(?:text|uuid|varchar|integer|bigint|jsonb)/gi)) out.push(`${m[1]}.${c[1]}`)
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?((?:[a-z_]*_)?firm_ids?)"?(?![a-z_])/gi)) out.push(`${m[1]}.${m[2]}`)
  }
  return out.filter((r) => !BACKUP_PREFIXES.some((p) => r.startsWith(p)))
}
/** Declared by a migration but absent from the live schema or a view or a table that is no longer there (checked 2026-11-01), so there is nothing to classify. */
const NOT_LIVE = new Set<string>(["crm_migration_plan.firm_id"])

describe("the firm registry covers every directory-firm reference", () => {
  it("the live-schema snapshot is real", () => { expect(SNAPSHOT.refs.length).toBeGreaterThanOrEqual(15); expect(SNAPSHOT.refs).toContain("investors.firm_id") })
  it("every column in the live schema is classified", () => {
    const missing = SNAPSHOT.refs.filter((r) => !known.has(r))
    expect(missing, `Classify these in lib/directory/firm-registry.ts:\n${missing.join("\n")}`).toEqual([])
  })
  it("every registry entry exists in the live schema (not a typo or a view)", () => {
    const stale = [...known].filter((r) => !SNAPSHOT.refs.includes(r))
    expect(stale, `Not in the snapshot (typo, view, or retake with scripts/snapshot-firm-refs.mjs): ${stale.join(", ")}`).toEqual([])
  })
  it("a table or column that a migration adds is classified too, even before the snapshot is retaken", () => {
    const missing = [...new Set(migrationRefs())].filter((r) => !known.has(r) && !SNAPSHOT.refs.includes(r) && !NOT_LIVE.has(r))
    expect(missing, `Classify these in lib/directory/firm-registry.ts:\n${missing.join("\n")}`).toEqual([])
  })
  it("only the directory's own derived rows are dropped; a workspace's rows are always moved; no entry repeats", () => {
    for (const r of FIRM_REFS) { if (r.fate === "drop") expect(r.owner, r.table).toBe("platform"); if (r.owner === "workspace") expect(r.fate, r.table).toBe("move") }
    expect(new Set([...FIRM_REFS, ...FIRM_LIST_REFS].map((r) => `${r.table}.${r.column}`)).size).toBe(FIRM_REFS.length + FIRM_LIST_REFS.length)
  })
})
