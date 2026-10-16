/**
 * The guard on erasure of directory persons: every column that holds a directory person's id must be classified in the person registry. A new table that is not fails here, in CI,
 * before it can leave data behind a "complete" erasure.
 */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { PERSON_REFS } from "./person-registry"
import SNAPSHOT from "./person-refs.snapshot.json"

const known = new Set(PERSON_REFS.map((r) => `${r.table}.${r.column}`))
const DIR = "scripts/migrations"
/** Declared by an old migration but absent from the live schema (checked 2026-10-16), so there is nothing to classify. */
const NOT_LIVE = new Set(["contacts.investor_id"])
function migrationRefs(): string[] {
  const out: string[] = []
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "")
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s*\(([\s\S]*?)\n?\)\s*;/gi))
      for (const c of m[2].matchAll(/(?:^|[\s,(])([a-z_]*investor_id)\s+(?:text|uuid|varchar|integer|bigint)/gi)) out.push(`${m[1]}.${c[1]}`)
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_]*investor_id)"?/gi)) out.push(`${m[1]}.${m[2]}`)
  }
  return out
}

describe("the person registry covers every directory-person reference", () => {
  it("the live-schema snapshot is real", () => {
    expect(SNAPSHOT.refs.length).toBeGreaterThanOrEqual(15)
    expect(SNAPSHOT.refs).toContain("crm_people.investor_id")
  })
  it("every column in the live schema is classified", () => {
    const missing = SNAPSHOT.refs.filter((r) => !known.has(r))
    expect(missing, `Classify these in lib/directory/person-registry.ts:\n${missing.join("\n")}`).toEqual([])
  })
  it("every registry entry exists in the live schema (not a typo or a view)", () => {
    const stale = [...known].filter((r) => !SNAPSHOT.refs.includes(r))
    expect(stale, `Not in the snapshot (typo, view, or retake with scripts/snapshot-person-refs.mjs): ${stale.join(", ")}`).toEqual([])
  })
  it("a table or column that a migration adds is classified too, even before the snapshot is retaken", () => {
    const missing = [...new Set(migrationRefs())].filter((r) => !known.has(r) && !SNAPSHOT.refs.includes(r) && !NOT_LIVE.has(r))
    expect(missing, `Classify these in lib/directory/person-registry.ts:\n${missing.join("\n")}`).toEqual([])
  })
  it("only platform-owned derived rows are deleted; a workspace's rows are never deleted by an erasure", () => {
    for (const r of PERSON_REFS) { if (r.fate === "delete") expect(r.owner, `${r.table}`).toBe("platform"); if (r.owner === "workspace") expect(r.fate, `${r.table}`).toBe("keep") }
    expect(new Set(PERSON_REFS.map((r) => `${r.table}.${r.column}`)).size).toBe(PERSON_REFS.length)
  })
})
