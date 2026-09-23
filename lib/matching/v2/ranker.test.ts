/**
 * The ranker against a real Postgres (docs/architecture/17 §7).
 *
 * Label assembly is the part that can quietly go wrong — joining the wrong
 * way turns silence into evidence — so it is tested against the actual tables
 * rather than a mock.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values),
    { unsafe: (query: string, values: unknown[] = []) => state.query(query, values) },
  ),
}))

import { assembleLabels, activeWeights, deactivateFitted, fitRanker, rankerState, EXPERT_WEIGHTS } from "./ranker"
import { ENGINE_VERSION } from "./founder-scoring"
import { COMPONENT_KEYS } from "./ranker-fit"

let db: PGlite
const NOW = new Date("2026-09-23T12:00:00Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

/** A result payload shaped like the engine's, with the components the fit reads. */
function payload(value: number, primaryId: string | null) {
  const components = Object.fromEntries(COMPONENT_KEYS.map((k) => [k, { value, points: value }]))
  return JSON.stringify({ firm: { id: "f", components }, primary: primaryId ? { id: primaryId } : null })
}

beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
  await db.exec(`
    CREATE TABLE founder_match_runs (id text PRIMARY KEY, org_id text, user_id text, options jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE founder_match_results (run_id text, kind text, rank int, entity_id text, firm_id text, score real, tier text, name text, payload jsonb);
    CREATE TABLE crm_entries (id text PRIMARY KEY, user_id text, firm_id text, investor_id text, stage text, added_at timestamptz, last_contacted_at timestamptz);
    CREATE TABLE match_outcome_events (id text PRIMARY KEY, user_id text, event_type text, source text, subject_id text, firm_id text, investor_id text, created_at timestamptz DEFAULT now());
    CREATE TABLE matching_weight_history (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, scope text, engine text,
      weights jsonb NOT NULL, previous_weights jsonb, trigger_type text, signal_counts jsonb, metrics jsonb,
      is_active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
  `)
})
afterAll(async () => db.close())

beforeEach(async () => {
  await db.exec("DELETE FROM founder_match_results; DELETE FROM founder_match_runs; DELETE FROM crm_entries; DELETE FROM match_outcome_events; DELETE FROM matching_weight_history;")
  await db.query("INSERT INTO founder_match_runs (id, org_id, user_id, options, created_at) VALUES ($1,$2,$3,'{}'::jsonb,$4)",
    ["run-1", "org-1", "u-1", daysAgo(40)])
})

async function shown(entityId: string, value = 0.8, primaryId: string | null = null, rank = 1) {
  await db.query("INSERT INTO founder_match_results (run_id, kind, rank, entity_id, firm_id, score, tier, name, payload) VALUES ('run-1','group',$1,$2,$2,80,'priority_a','Firm',$3::jsonb)",
    [rank, entityId, payload(value, primaryId)])
}
async function crm(firmId: string | null, stage: string, contactedAt: string | null, investorId: string | null = null) {
  await db.query("INSERT INTO crm_entries (id, user_id, firm_id, investor_id, stage, added_at, last_contacted_at) VALUES (gen_random_uuid()::text,'u-1',$1,$2,$3,$4,$5)",
    [firmId, investorId, stage, daysAgo(40), contactedAt])
}

describe("label assembly", () => {
  it("counts a contacted-and-replied firm as a positive", async () => {
    await shown("firm-1")
    await crm("firm-1", "responded", daysAgo(10))
    const { examples } = await assembleLabels({ now: NOW })
    expect(examples).toHaveLength(1)
    expect(examples[0]).toMatchObject({ label: 1, orgId: "org-1", entityId: "firm-1" })
    expect(examples[0].features).toHaveLength(COMPONENT_KEYS.length)
  })

  it("counts three weeks of silence after contact as a negative", async () => {
    await shown("firm-2")
    await crm("firm-2", "contacted", daysAgo(30))
    const { examples } = await assembleLabels({ now: NOW })
    expect(examples.map((e) => e.label)).toEqual([0])
  })

  it("excludes an investor the founder never approached", async () => {
    await shown("firm-3")
    await shown("firm-4", 0.8, null, 2)
    await crm("firm-3", "queued", null)
    const { examples, shown: seen } = await assembleLabels({ now: NOW })
    expect(examples).toEqual([])
    expect(seen).toBe(2) // both were shown; neither says anything about the ranking
  })

  it("reads a reply recorded against the person, not the firm", async () => {
    await shown("firm-5", 0.8, "person-9")
    await crm(null, "contacted", daysAgo(2), "person-9")
    await db.query("INSERT INTO match_outcome_events (id, user_id, event_type, source, subject_id, firm_id, investor_id) VALUES (gen_random_uuid()::text,'u-1','replied','crm_entry','s1',NULL,'person-9')")
    const { examples } = await assembleLabels({ now: NOW })
    expect(examples.map((e) => e.label)).toEqual([1])
  })

  it("counts a firm once per workspace, and lets the reply win over the silence", async () => {
    await db.query("INSERT INTO founder_match_runs (id, org_id, user_id, options, created_at) VALUES ('run-2','org-1','u-1','{}'::jsonb,$1)", [daysAgo(5)])
    await shown("firm-6")
    await db.query("INSERT INTO founder_match_results (run_id, kind, rank, entity_id, firm_id, score, tier, name, payload) VALUES ('run-2','group',1,'firm-6','firm-6',80,'priority_a','Firm',$1::jsonb)", [payload(0.8, null)])
    await crm("firm-6", "contacted", daysAgo(30))
    await crm("firm-6", "committed", daysAgo(3))
    const { examples } = await assembleLabels({ now: NOW })
    expect(examples).toHaveLength(1)
    expect(examples[0].label).toBe(1)
  })

  it("ignores another workspace's runs when counting workspaces", async () => {
    await db.query("INSERT INTO founder_match_runs (id, org_id, user_id, options, created_at) VALUES ('run-3','org-2','u-2','{}'::jsonb,$1)", [daysAgo(9)])
    await db.query("INSERT INTO founder_match_results (run_id, kind, rank, entity_id, firm_id, score, tier, name, payload) VALUES ('run-3','group',1,'firm-7','firm-7',80,'priority_a','Firm',$1::jsonb)", [payload(0.5, null)])
    await crm("firm-7", "responded", daysAgo(4)) // u-1's CRM, not u-2's
    const { examples } = await assembleLabels({ now: NOW })
    expect(examples).toEqual([])
  })
})

describe("what ranks today", () => {
  it("falls back to the expert weights when nothing is active", async () => {
    const active = await activeWeights()
    expect(active.source).toBe("expert")
    expect(active.weights).toEqual(EXPERT_WEIGHTS)
    expect(active.fittedAt).toBeNull()
  })

  it("uses an active fitted set, and rolls back on request", async () => {
    const fitted = { thesis: 30, stage: 25, checkSize: 15, geography: 12, lead: 5, investorType: 5, quality: 8 }
    await db.query("INSERT INTO matching_weight_history (id, engine, weights, is_active) VALUES ('w-1',$1,$2::jsonb,true)", [ENGINE_VERSION, JSON.stringify(fitted)])
    expect(await activeWeights()).toMatchObject({ source: "fitted:w-1", weights: fitted })
    expect(await deactivateFitted()).toBe(1)
    expect((await activeWeights()).source).toBe("expert")
  })

  it("refuses stored weights that do not sum to 100", async () => {
    await db.query("INSERT INTO matching_weight_history (id, engine, weights, is_active) VALUES ('w-2',$1,$2::jsonb,true)",
      [ENGINE_VERSION, JSON.stringify({ thesis: 400, stage: 20, checkSize: 15, geography: 12, lead: 5, investorType: 4, quality: 4 })])
    expect((await activeWeights()).source).toBe("expert")
  })
})

describe("fitRanker", () => {
  it("records the refusal and keeps the expert weights when there is no evidence", async () => {
    const report = await fitRanker({ now: NOW, triggerType: "test" })
    expect(report.activate).toBe(false)
    expect(report.blockedBy).toContain("not enough data: 0 of 200")
    expect(report.summary).toMatch(/Expert weights kept/)
    const rows = await db.query<any>("SELECT * FROM matching_weight_history")
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].is_active).toBe(false)
    expect(rows.rows[0].weights).toEqual(EXPERT_WEIGHTS) // the row still says what is ranking
    expect(rows.rows[0].metrics.blockedBy).toContain("not enough data")
    expect((await activeWeights()).source).toBe("expert")
  })

  it("reports the state an owner would read", async () => {
    await shown("firm-8")
    await crm("firm-8", "contacted", daysAgo(30))
    const state = await rankerState()
    expect(state.engine).toBe(ENGINE_VERSION)
    expect(state.active.source).toBe("expert")
    expect(state.labels).toMatchObject({ examples: 1, positive: 0, negative: 1, workspaces: 1, shown: 1 })
    expect(state.guardsMet).toBe(false)
    expect(state.blockedBy).toContain("1 of 200")
  })
})
