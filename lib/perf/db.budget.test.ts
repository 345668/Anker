// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@vercel/blob", () => ({ del: vi.fn(async () => {}), list: vi.fn(async () => ({ blobs: [] })) }))
import { buildDatabase } from "../../scripts/db/build-local.mjs"
import { enabled, within, SCALE } from "./budget"

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock("@/lib/db", () => { const f: any = async (s: TemplateStringsArray, ...v: unknown[]) => (await h.db.query(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v)).rows; f.unsafe = async (text: string, params: unknown[] = []) => (await h.db.query(text, params)).rows; return { sql: f } })
import { usageThisMonth } from "@/lib/entitlements"
import { resolveScope, buildExport, countRows } from "@/lib/tenant/executor"

// docs/architecture/59 R5, the database half: the real schema (built from the baseline), production-size rows, the real functions. Off unless RUN_BUDGET=1.
const BUDGET = { usage: 1_000, scope: 1_000, export: 7_500, counts: 1_000 }   // measured 2026-10-30: usage 7, scope 1, counts 54, export 3,726 ms; twice that, never below the 1,000 ms floor
describe.skipIf(!enabled())("the scale budget: the database at production size", () => {
  beforeAll(async () => {
    const { db, failed } = await buildDatabase("memory"); expect(failed).toEqual([]); h.db = db
    await db.exec(`INSERT INTO organizations (id, kind, name, slug, owner_user_id, created_by) SELECT 'w' || g, 'company', 'Workspace ' || g, 'ws-' || g, 'u' || g, 'u' || g FROM generate_series(0, ${SCALE.workspaces - 1}) g`)
    // A year of AI calls across 200 workspaces, a few thousand of them this month.
    await db.exec(`INSERT INTO ai_calls (id, created_at, task, provider, ok, workspace_id, cost_usd, cost_state) SELECT g, now() - ((g % 365) || ' days')::interval - ((g % 86400) || ' seconds')::interval, 'assistant_chat', 'qwen', true, 'w' || (g % ${SCALE.workspaces}), 0.004, 'exact' FROM generate_series(1, ${SCALE.callsPerYear}) g`)
    await db.exec(`INSERT INTO usage_events (org_id, cost_center, unit, qty, unit_cost, cost_usd, cost_state, source) SELECT 'w' || (g % ${SCALE.workspaces}), 'workspace:w' || (g % ${SCALE.workspaces}), 'asr_second', 30, 0.00003, 0.0009, 'exact', 'budget' FROM generate_series(1, 100000) g`)
    // One large workspace: a CRM of 100,000 contacts.
    await db.exec(`INSERT INTO crm_entries (org_id, source, display_name) SELECT 'w0', 'manual', 'Contact ' || g FROM generate_series(1, 100000) g`)
  }, 600_000)
  afterAll(async () => { await h.db?.close() })
  it("usageThisMonth over a year of calls (it runs before every AI request)", async () => {
    const u = await within("usageThisMonth, a year of AI calls", BUDGET.usage, () => usageThisMonth("w0")); expect(u.aiSpendUsd).toBeGreaterThan(0)
  })
  it("resolving a workspace's scope and counting its rows (the dry run of an erasure)", async () => {
    const s = (await within("resolveScope", BUDGET.scope, () => resolveScope("w0")))!; expect(s.orgId).toBe("w0")
    const c = await within("countRows, one large workspace", BUDGET.counts, () => countRows(s)); expect(c.find((x) => x.table === "crm_entries")?.count).toBe(100000)
  }, 120_000)
  it("exporting a workspace with 100,000 contacts", async () => {
    const s = (await resolveScope("w0"))!, out = await within("buildExport, 100,000 contacts", BUDGET.export, () => buildExport(s))
    expect(out.manifest.tables.find((t: any) => t.table === "crm_entries").rows).toBe(100000)
  }, 300_000)
})
