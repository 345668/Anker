/**
 * The guard on erasure: every table a migration creates with a workspace, fund or owner key must be in the registry (so it is exported and erased)
 * or in EXCLUDED with a reason. A new table that is in neither fails here, in CI, before it can leak through a "complete" erasure.
 */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { RULES, EXCLUDED } from "./registry"
import SNAPSHOT from "./keyed-tables.snapshot.json"

/** Rule tables with no workspace or fund key of their own: they hang off a parent through a join in the rule. */
const CHILD_TABLES = new Set(["deal_room_documents", "deal_room_access_grants", "deal_room_audit_events", "deal_room_milestones", "deal_room_nda_agreements", "deal_room_notes", "deal_room_questions", "pitch_deck_analyses", "deal_rooms", "lp_portal_access_log", "syndicates", "memberships", "organizations", "funds", "workspace_decks"])

const KEYS = ["org_id", "fund_id", "workspace_id", "owner_user_id"]
const DIR = "scripts/migrations"

function keyedTables(): Map<string, string[]> {
  const found = new Map<string, Set<string>>()
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "")
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s*\(([\s\S]*?)\n?\)\s*;/gi)) {
      for (const k of KEYS) if (new RegExp(`(^|[\\s,(])${k}\\s+(text|uuid|varchar|integer|bigint)`, "i").test(m[2])) (found.get(m[1]) ?? found.set(m[1], new Set()).get(m[1])!).add(k)
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_0-9]+)"?/gi)) {
      if (KEYS.includes(m[2])) (found.get(m[1]) ?? found.set(m[1], new Set()).get(m[1])!).add(m[2])
    }
  }
  return new Map([...found].map(([t, k]) => [t, [...k]]))
}

describe("the erasure registry covers every workspace-keyed table", () => {
  const known = new Set([...RULES.map((r) => r.table), ...EXCLUDED.map((e) => e.table)])
  it("the live-schema snapshot is real (it is not passing because it is empty)", () => {
    const snap = SNAPSHOT.tables as Record<string, string[]>
    expect(Object.keys(snap).length).toBeGreaterThan(60)
    for (const must of ["crm_entries", "deal_opportunities", "journal_entries", "investments", "intake_submissions", "ai_calls"]) expect(snap[must], must).toBeTruthy()
  })
  it("every table in the live database keyed by a workspace, fund or owner is in the registry or the exclusions", () => {
    const missing = Object.entries(SNAPSHOT.tables).filter(([t]) => !known.has(t)).map(([t, k]) => `${t} (${(k as string[]).join(", ")})`)
    expect(missing, `Classify these in lib/tenant/registry.ts: add a rule to export and erase them, or an EXCLUDED entry with the reason:\n${missing.join("\n")}`).toEqual([])
  })
  it("a table that a migration creates with such a key is classified too (catches a new table before the snapshot is retaken)", () => {
    const missing = [...keyedTables()].filter(([t]) => !known.has(t) && !(t in (SNAPSHOT.tables as Record<string, string[]>))).map(([t, k]) => `${t} (${k.join(", ")})`)
    expect(missing, `Classify these in lib/tenant/registry.ts:\n${missing.join("\n")}`).toEqual([])
  })
  it("every rule names a real BASE table in the live schema: not a view (cannot be deleted from) and not a typo (would silently match nothing)", () => {
    const base = new Set((SNAPSHOT as any).baseTables as string[])
    expect(base.size).toBeGreaterThan(100)
    expect(RULES.filter((r) => !base.has(r.table)).map((r) => r.table)).toEqual([])
  })
  it("every keyed rule table is in the keyed snapshot too", () => {
    const live = new Set(Object.keys(SNAPSHOT.tables))
    // Child and member tables are keyed by a parent or user id, not by a workspace key, so only the keyed ones can be checked here.
    const unknownKeyed = RULES.filter((r) => r.scope !== "member" && !live.has(r.table) && !CHILD_TABLES.has(r.table)).map((r) => r.table)
    expect(unknownKeyed).toEqual([])
  })
  it("a table is not both ruled and excluded, and rules do not repeat a table (except the two-key tables)", () => {
    const ruled = RULES.map((r) => r.table)
    expect(ruled.filter((t) => EXCLUDED.some((e) => e.table === t))).toEqual([])
    const dup = ruled.filter((t, i) => ruled.indexOf(t) !== i)
    expect(dup).toEqual([])
  })
  it("every rule is parameterised: no literal ids, only $1, $2 and $3", () => {
    for (const r of RULES) {
      expect(r.where, r.table).not.toMatch(/'[^']*'/)
      for (const p of r.where.match(/\$\d+/g) ?? []) expect(["$1", "$2", "$3"]).toContain(p)
      expect(r.table).toMatch(/^[a-z_0-9]+$/)
    }
  })
  it("the workspace and its fund are deleted last, children before parents", () => {
    const order = RULES.map((r) => r.table)
    expect(order.slice(-3)).toEqual(["memberships", "funds", "organizations"])
    expect(order.indexOf("deal_rooms")).toBeGreaterThan(order.indexOf("deal_room_notes"))
    expect(order.indexOf("deal_opportunities")).toBeGreaterThan(order.indexOf("deal_rooms"))
    expect(order.indexOf("journal_entries")).toBeLessThan(order.indexOf("funds"))
  })
  it("retained and anonymised rules say why and how, and never retain a customer's content", () => {
    for (const r of RULES.filter((x) => x.retain)) { expect(r.retain!.length).toBeGreaterThan(20); expect(r.table).toMatch(/^billing_/) }
    for (const r of RULES.filter((x) => x.anonymize)) expect(r.anonymize).toMatch(/workspace_id = NULL/)
  })
  it("the shared directory and the do-not-contact lists can never be erased", () => {
    for (const t of ["investors", "email_suppressions", "li_suppressions", "outreach_consents"]) expect(RULES.map((r) => r.table)).not.toContain(t)
  })
})
