import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))

import { importLabels, clearLabels, loadEvaluationSet } from "./labels"
import { decideFactor, evaluateWorkspace, factorList, FactorError } from "./factors-admin"
import { loadFactorSettings, loadShadowContext, invalidateFactorSettings } from "./shadow-load"
import { normalizeFirmName } from "@/lib/matching/v2/dedup"

let db: PGlite
const FP = "11111111-1111-1111-1111-111111111111", SESSION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", OLD = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const A = { orgId: "org-a", userId: "alice" }

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec("CREATE TABLE organizations(id text PRIMARY KEY, kind text, fund_id text); CREATE TABLE memberships(user_id text, org_id text, persona text);")
  await db.exec(readFileSync("scripts/create-lp-tables.sql", "utf8"))
  for (const f of ["2026-04-25-matching-v2", "2026-09-11-matching-profile-contract"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  await db.exec("ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS expected_ticket_usd float8; ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS expected_ticket_usd float8, ADD COLUMN IF NOT EXISTS factor_capacity int;")
  await db.exec("INSERT INTO organizations VALUES ('org-a','fund',NULL),('org-b','fund',NULL);")
  for (const f of ["2026-10-19-lp-match-workspace", "2026-10-19c-lp-match-explain-feedback", "2026-10-19d-lp-match-run-options", "2026-10-19e-lp-match-jobs", "2026-10-19f-lp-match-status-check", "2026-10-19g-lp-match-one-open-run", "2026-10-19h-lp-shadow-factors"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  await db.exec("CREATE TABLE crm_entries(id serial PRIMARY KEY, org_id text, firm_id text, investor_id text, stage text); CREATE TABLE linkedin_connections(owner_id text, linkedin_url text, company text, degree int); CREATE TABLE linkedin_mutuals(owner_id text, person_url text);")
})
afterAll(async () => db.close())
beforeEach(async () => {
  invalidateFactorSettings()
  await db.exec(`DELETE FROM lp_eval_labels; DELETE FROM lp_match_feedback; DELETE FROM lp_firm_matches; DELETE FROM lp_contact_matches; DELETE FROM lp_match_sessions; DELETE FROM fund_profiles; DELETE FROM crm_entries; DELETE FROM linkedin_connections; DELETE FROM linkedin_mutuals; DELETE FROM memberships;
    UPDATE lp_scoring_factors SET status = 'shadow', decided_by = NULL, decided_at = NULL, note = NULL, evidence = NULL;
    INSERT INTO fund_profiles(id,name,user_id,org_id,is_active) VALUES ('${FP}','Fund A','alice','org-a',true);`)
})

/** A run with `n` firms where proximity separates the fits and the base score hardly does. */
async function run(id: string, n: number, factors = true) {
  const r = rng(99)
  await db.query(`INSERT INTO lp_match_sessions(id,fund_profile_id,fund_name,user_id,org_id,status,created_at) VALUES ($1,$2,'Fund A','alice','org-a','completed',now())`, [id, FP])
  const labels: string[] = []
  for (let i = 0; i < n; i++) {
    const fit = i % 2, base = 50 + fit * 3 + r() * 20, rel = fit ? (r() < 0.8 ? 1 : 0) : (r() < 0.1 ? 1 : 0)
    const sf = factors ? JSON.stringify({ recent_activity: { value: r() < 0.5 ? 1 : 0, weight: 6, applied: false }, emerging_manager_appetite: { value: null, weight: 5, applied: false }, relationship_proximity: { value: rel, weight: 8, applied: false }, data_confidence: { value: 0.5, weight: 4, applied: false } }) : null
    await db.query(`INSERT INTO lp_firm_matches(id,session_id,fund_profile_id,firm_id,firm_name,score,base_score,tier,shadow_factors) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5::numeric,$7::numeric,'priority_a',$6::jsonb)`, [id, FP, `F${i}`, `Firm ${i}`, base, sf, base])
    labels.push(`Firm ${i}, ${fit ? "fit" : "not fit"}`)
  }
  return labels.join("\n")
}

describe("saving a labelled list", () => {
  it("looks names up in the run, takes keys as they are, replaces a label for the same LP, and says what it could not place", async () => {
    await run(SESSION, 4)
    const r = await importLabels(A, SESSION, FP, "name,label\nFirm 0, fit\nfirm 1,not fit\nfirm:F9,yes\nNobody, fit\nFirm 2,unsure\n")
    expect(r).toMatchObject({ saved: 3, unresolved: ["Nobody"], skipped: ["Firm 2,unsure"] })
    const rows = (await db.query<any>("SELECT entity_key, label, source FROM lp_eval_labels ORDER BY entity_key")).rows
    expect(rows).toEqual([{ entity_key: "firm:F0", label: "fit", source: "founder_set" }, { entity_key: "firm:F1", label: "not_fit", source: "founder_set" }, { entity_key: "firm:F9", label: "fit", source: "founder_set" }])
    await importLabels(A, SESSION, FP, "Firm 0, not fit")
    expect((await db.query<any>("SELECT label FROM lp_eval_labels WHERE entity_key = 'firm:F0'")).rows[0].label).toBe("not_fit")
    expect(await clearLabels("org-a", FP)).toBe(3)
    expect(await clearLabels("org-a", FP)).toBe(0)
  })
  it("one workspace's labels are not another's", async () => {
    await run(SESSION, 4)
    await importLabels(A, SESSION, FP, "Firm 0, fit")
    expect((await db.query<any>("SELECT count(*)::int n FROM lp_eval_labels WHERE org_id = 'org-b'")).rows[0].n).toBe(0)
    expect((await loadEvaluationSet("org-b", SESSION, FP)).labelled).toBe(0)
  })
})

describe("gathering the labelled LPs of a run", () => {
  it("uses the list first and the verdicts given in the app second, and counts a run that has no factor values", async () => {
    await run(SESSION, 6)
    await db.exec(`INSERT INTO lp_match_feedback(org_id,session_id,match_kind,match_id,entity_key,verdict) VALUES
      ('org-a','${SESSION}','firm','x','firm:F0','not_a_fit'), ('org-a','${SESSION}','firm','x','firm:F1','fit'), ('org-a','${SESSION}','firm','x','firm:F2','already_known')`)
    await importLabels(A, SESSION, FP, "Firm 0, fit")                                  // the list overrides the verdict for F0
    const set = await loadEvaluationSet("org-a", SESSION, FP)
    const by = Object.fromEntries(set.firms.map((r) => [r.key, r]))
    expect(by["firm:F0"]).toMatchObject({ label: 1, source: "founder_set" })
    expect(by["firm:F1"]).toMatchObject({ label: 1, source: "feedback" })
    expect(by["firm:F2"]).toBeUndefined()                                                // "already known" is not a judgement of fit
    expect(set.firms[0].values.relationship_proximity).not.toBeUndefined()
    await run(OLD, 3, false)
    await importLabels(A, OLD, FP, "Firm 0, fit\nFirm 1, not fit")
    const old = await loadEvaluationSet("org-a", OLD, FP)
    expect(old).toMatchObject({ inRun: 2, withoutFactors: 2 })                          // F0 and F1 are labelled and in the run; F2's "already known" is no judgement; none carries factor values
  })
})

describe("the evaluation and the decision", () => {
  it("says it needs more labels, then recommends the factor that the labels support, and promoting records the evidence", async () => {
    await run(SESSION, 60)
    const none = await evaluateWorkspace("org-a", FP)
    expect(none.firms!.blocked).toMatch(/Not enough labels/)
    expect(none.labelled).toBe(0)
    const text = (await db.query<any>("SELECT firm_name, (firm_id::text) f FROM lp_firm_matches ORDER BY firm_id")).rows.map((r: any, i: number) => `${r.firm_name}, ${Number(String(r.f).slice(1)) % 2 ? "fit" : "not fit"}`).join("\n")
    await importLabels(A, SESSION, FP, text)
    const ev = await evaluateWorkspace("org-a", FP)
    expect(ev.error).toBeNull()
    expect(ev.firms!.n).toBe(60)
    const prox = ev.firms!.factors.find((f) => f.key === "relationship_proximity")!
    expect(prox.verdict).toBe("promote")
    expect(ev.firms!.factors.find((f) => f.key === "emerging_manager_appetite")!.verdict).toBe("keep_shadow")   // never known: cannot be judged
    expect((await loadFactorSettings(0)).relationship_proximity.status).toBe("shadow")
    const r = await decideFactor("org-a", FP, { key: "relationship_proximity", status: "promoted", note: "Measured on 60 labels." }, "owner@example.com")
    expect(r).toEqual({ status: "promoted", weight: 8, overridden: false })
    const f = (await factorList()).find((x) => x.key === "relationship_proximity")!
    expect(f).toMatchObject({ status: "promoted", decidedBy: "owner@example.com", note: "Measured on 60 labels." })
    expect(f.evidence.firms.factor).toMatchObject({ key: "relationship_proximity", verdict: "promote" })
    expect(f.evidence.overridden).toBe(false)
    expect((await loadFactorSettings(0)).relationship_proximity).toEqual({ status: "promoted", weight: 8 })   // and the engine reads it
  })
  it("refuses to promote a factor the labels do not support, unless the owner writes down why", async () => {
    await run(SESSION, 60)
    const text = (await db.query<any>("SELECT firm_name, firm_id FROM lp_firm_matches")).rows.map((r: any) => `${r.firm_name}, ${Number(String(r.firm_id).slice(1)) % 2 ? "fit" : "not fit"}`).join("\n")
    await importLabels(A, SESSION, FP, text)
    await expect(decideFactor("org-a", FP, { key: "emerging_manager_appetite", status: "promoted" }, "o")).rejects.toThrow(/does not recommend promoting it: Known for only 0%/)
    await expect(decideFactor("org-a", FP, { key: "emerging_manager_appetite", status: "promoted", override: true, note: "short" }, "o")).rejects.toMatchObject({ status: 400 })
    expect((await loadFactorSettings(0)).emerging_manager_appetite.status).toBe("shadow")
    const r = await decideFactor("org-a", FP, { key: "emerging_manager_appetite", status: "promoted", override: true, note: "We want first-time-fund backers even without data yet." }, "o")
    expect(r.overridden).toBe(true)
    expect((await factorList()).find((x) => x.key === "emerging_manager_appetite")!.evidence.overridden).toBe(true)
  })
  it("returning to measuring or retiring needs no evidence; weights and keys are checked", async () => {
    await decideFactor("org-a", FP, { key: "data_confidence", status: "retired", note: "not useful" }, "o")
    expect((await factorList()).find((x) => x.key === "data_confidence")!.status).toBe("retired")
    expect((await loadFactorSettings(0)).data_confidence.status).toBe("retired")
    await decideFactor("org-a", FP, { key: "data_confidence", status: "shadow", weight: 2 }, "o")
    expect((await loadFactorSettings(0)).data_confidence).toEqual({ status: "shadow", weight: 2 })
    await expect(decideFactor("org-a", FP, { key: "data_confidence", status: "shadow", weight: 99 }, "o")).rejects.toMatchObject({ status: 400 })
    await expect(decideFactor("org-a", FP, { key: "nope", status: "shadow" }, "o")).rejects.toBeInstanceOf(FactorError)
    await expect(decideFactor("org-a", FP, { key: "data_confidence", status: "weird" as any }, "o")).rejects.toMatchObject({ status: 400 })
  })
  it("says so when the newest run was saved before the factors existed", async () => {
    await run(OLD, 6, false)
    await importLabels(A, OLD, FP, "Firm 0, fit\nFirm 1, not fit")
    expect((await evaluateWorkspace("org-a", FP)).error).toMatch(/saved before the extra factors existed/)
  })
})

describe("what the engine is given about the team's relationships", () => {
  it("reads settings with defaults for a missing row, and the team's connections, mutuals and warm contacts, saying 'no graph' when none were imported", async () => {
    await db.exec("DELETE FROM lp_scoring_factors WHERE key = 'data_confidence'")
    const s = await loadFactorSettings(0)
    expect(s.data_confidence).toEqual({ status: "shadow", weight: 4 })
    const none = await loadShadowContext({ orgId: "org-a" }, { fundNumber: 2, fundIPriorLpFirmIds: ["F1"], fundIPriorContactEmails: ["P@x.com"] })
    expect(none).toMatchObject({ fundNumber: 2, connectionsByFirm: null, connectionSlugs: null, mutualTargets: null })
    expect([...none.priorLpFirmIds]).toEqual(["F1"]); expect([...none.priorContactEmails]).toEqual(["p@x.com"])
    await db.exec(`INSERT INTO memberships VALUES ('alice','org-a','vc'),('bob','org-b','vc');
      INSERT INTO linkedin_connections VALUES ('alice','https://www.linkedin.com/in/pat-one','Alpha Capital LLC',1),('alice','https://www.linkedin.com/in/second-degree','Alpha Capital LLC',2),('bob','https://www.linkedin.com/in/bobs','Other Fund',1);
      INSERT INTO linkedin_mutuals VALUES ('alice','https://www.linkedin.com/in/target-person'),('bob','https://www.linkedin.com/in/bobs-target');
      INSERT INTO crm_entries(org_id,firm_id,investor_id,stage) VALUES ('org-a','F7',NULL,'meeting'),('org-a','F8',NULL,'queued'),('org-b','F9',NULL,'meeting');`)
    const ctx = await loadShadowContext({ orgId: "org-a" }, {})
    expect(ctx.connectionSlugs).toEqual(new Set(["in/pat-one"]))                       // first degree only, and only this workspace's members
    expect(ctx.connectionsByFirm!.get(normalizeFirmName("Alpha Capital LLC"))).toBe(1)   // by the same normalised name the engine uses for firms
    expect(ctx.mutualTargets).toEqual(new Set(["in/target-person"]))
    expect([...ctx.warmFirmIds]).toEqual(["F7"])                                        // a queued entry is not warm; another workspace's is not ours
  })
})
