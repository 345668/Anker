/**
 * Saving a founder run, and saying what was recorded (docs/architecture/20 §4).
 *
 * The regression this file exists for: from matching v3 until doc 17, every
 * match_shown insert failed the CHECK constraint, every failure became a
 * console warning, and the platform reported healthy runs while the ranker's
 * evidence sat at zero. Both halves are tested here — the run still saves when
 * recording fails, and the failure is reported rather than swallowed.
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

import { saveRun } from "./founder-runs"
import type { FounderMatchingResult, StartupProfile } from "./founder-types"

let db: PGlite
const scope = { orgId: "org-1", userId: "u-1" }

const entity = (i: number, score: number) => ({
  id: `firm-${i}`, kind: "firm", name: `Investor ${i}`, type: "VC", location: "United States",
  sectors: ["sports"], stages: ["pre-seed"], website: null, linkedin: null, email: null,
  score, tier: "champion", whyMatch: "fit", reasons: [], tags: [], factors: {} as any,
  stage: "identified" as any, segments: [],
})

const result = (groups = 3): FounderMatchingResult => ({
  sessionId: "run-1",
  engineVersion: "founder-v3",
  weightSource: "expert",
  groups: Array.from({ length: groups }, (_, i) => ({
    firm: entity(i, 90 - i) as any,
    primary: { ...entity(1000 + i, 90 - i), kind: "person", firmId: `firm-${i}` } as any,
    alternates: [], scoreFrom: "firm" as const, peopleScored: 1,
  })),
  independents: [{ ...entity(500, 70), kind: "person" } as any],
  firms: [], contacts: [],
  totals: { rawFirms: 10, rawContacts: 10, qualifiedFirms: groups, qualifiedContacts: 1 } as any,
  tierCounts: {} as any, segmentCounts: {} as any, funnel: {} as any, durationMs: 100,
} as unknown as FounderMatchingResult)

const startup = { id: "s1", name: "Test Co", stage: "pre-seed", askAmount: 1_000_000 } as StartupProfile

/** The tables a run touches; `sourceCheck` is what the defect turned on. */
async function schema(sourceCheck: string) {
  await db.exec(`
    DROP TABLE IF EXISTS match_outcome_events;
    DROP TABLE IF EXISTS founder_match_results;
    DROP TABLE IF EXISTS founder_match_runs;
    CREATE TABLE founder_match_runs (
      id text PRIMARY KEY, org_id text, user_id text, profile_version_id text, engine_version text,
      options jsonb, startup jsonb, totals jsonb, tier_counts jsonb, segment_counts jsonb,
      funnel jsonb, semantic jsonb, exclusions jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE founder_match_results (
      run_id text, kind text, rank int, entity_id text, firm_id text, score real,
      tier text, name text, email_status text, payload jsonb);
    CREATE TABLE match_outcome_events (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text,
      event_type text NOT NULL, source text NOT NULL CHECK (source IN (${sourceCheck})),
      subject_id text, firm_id text, investor_id text, match_score int,
      metadata jsonb, created_at timestamptz DEFAULT now());
  `)
}

beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
})
afterAll(async () => db.close())

describe("saveRun", () => {
  beforeEach(async () => { await schema("'crm_entry','lp_firm_match','lp_contact_match','outreach','founder_match'") })

  it("saves the run, its results and what the founder was shown", async () => {
    const receipt = await saveRun(result(3), startup, scope)
    expect(receipt).toMatchObject({ runId: "run-1", groups: 3, independents: 1 })
    expect(receipt.shown).toEqual({ recorded: 3, failed: null })

    const runs = (await db.query<any>("SELECT * FROM founder_match_runs")).rows
    expect(runs).toHaveLength(1)
    expect(runs[0].options.weights).toBe("expert")

    const rows = (await db.query<any>("SELECT kind, count(*)::int n FROM founder_match_results GROUP BY kind ORDER BY kind")).rows
    expect(rows).toEqual([{ kind: "group", n: 3 }, { kind: "independent", n: 1 }])

    const events = (await db.query<any>("SELECT * FROM match_outcome_events ORDER BY match_score DESC")).rows
    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({ event_type: "match_shown", source: "founder_match", user_id: "u-1", firm_id: "firm-0" })
    expect(events[0].metadata).toMatchObject({ runId: "run-1", rank: 1, orgId: "org-1" })
  })

  it("records the run's own recording status, so a run says whether it was observed", async () => {
    await saveRun(result(2), startup, scope)
    const [row] = (await db.query<any>("SELECT totals FROM founder_match_runs")).rows
    expect(row.totals).toMatchObject({ shownRecorded: 2, shownFailed: null })
  })

  it("caps what it records at showTop", async () => {
    const receipt = await saveRun(result(5), startup, scope, { showTop: 2 })
    expect(receipt.shown.recorded).toBe(2)
    expect((await db.query<any>("SELECT count(*)::int n FROM match_outcome_events")).rows[0].n).toBe(2)
  })

  // ─── The defect ───────────────────────────────────────────────────────────

  describe("when the events table refuses the run's own source", () => {
    beforeEach(async () => { await schema("'crm_entry','lp_firm_match','lp_contact_match','outreach'") })

    it("still saves the run and its results", async () => {
      const receipt = await saveRun(result(3), startup, scope)
      expect((await db.query<any>("SELECT count(*)::int n FROM founder_match_runs")).rows[0].n).toBe(1)
      expect((await db.query<any>("SELECT count(*)::int n FROM founder_match_results")).rows[0].n).toBe(4)
      expect(receipt.groups).toBe(3)
    })

    it("reports the failure instead of swallowing it", async () => {
      const receipt = await saveRun(result(3), startup, scope)
      expect(receipt.shown.recorded).toBe(0)
      expect(receipt.shown.failed).toMatch(/constraint|check/i)

      // And the run's own row says it was not observed — the count that sat at
      // zero for weeks is now visible on the run that produced it.
      const [row] = (await db.query<any>("SELECT totals FROM founder_match_runs")).rows
      expect(row.totals.shownRecorded).toBe(0)
      expect(row.totals.shownFailed).toBeTruthy()
    })
  })
})
