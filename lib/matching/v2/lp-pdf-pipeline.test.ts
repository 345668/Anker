/**
 * LP matchmaking: inputs, outputs, and the schema the engine writes into
 * (docs/architecture/18 §6).
 *
 * The persistence test is the important one. Both LP engines scored correctly
 * and then threw on their first insert, because the tables were missing 49 of
 * the columns the code names. That defect is reproduced here — the legacy
 * tables exactly as production had them — and the migration is what makes it
 * pass.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import fs from "node:fs"
import path from "node:path"
vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values),
    { unsafe: (query: string, values: unknown[] = []) => state.query(query, values) },
  ),
}))

import { buildLpLists, chunkInvestors, LP_CONTACT_LIST_HEADERS, LP_FIRM_LIST_HEADERS, LIST_SIZE, rankLps, readListRows } from "./lp-pdf-pipeline"
import { saveSessionV2 } from "./persistence"
import { fundReadiness } from "@/lib/matching/profile-readiness"
import type { MatchingResultV2, ScoredContactV2, ScoredFirmV2 } from "./types"

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** Directory ids are uuids, and the match tables are typed for them. */
const uuidFor = (kind: string, i: number) =>
  `${kind === "f" ? "f" : "c"}0000000-0000-4000-8000-${String(i).padStart(12, "0")}`

function firm(i: number, score: number): ScoredFirmV2 {
  return {
    firmId: uuidFor("f", i), name: `Family Office ${String(i).padStart(5, "0")}`,
    normalizedName: `familyoffice${i}`, type: "Family Office", location: "United States",
    aumRaw: "$500M", aumUsd: 500_000_000, sectors: ["software", "healthcare"],
    website: "https://lp.example", linkedin: null, description: "A single family office.",
    score, tier: "champion", factors: { lpType: 90, aum: 80, sector: 70, geography: 60, thesis: 50, contact: 40 } as any,
    reasons: ["Backs venture studios"], whyThisLp: "Invests in university spinout strategies.",
    tags: ["ANCHOR"], segments: ["anchor_prospects"] as any, stage: "identified" as any, isAnchor: true,
  }
}

function contact(i: number, score: number): ScoredContactV2 {
  return {
    investorId: uuidFor("c", i), name: `Partner ${String(i).padStart(5, "0")}`,
    title: "Chief Investment Officer", type: "Family Office", location: "United States",
    email: `p${i}@lp.example`, emailVerified: false, linkedin: null, sectors: ["software"],
    bio: "Allocates to emerging managers.", score, tier: "A" as any,
    factors: { lpType: 90, aum: 0, sector: 70, geography: 60, thesis: 50, contact: 80 } as any,
    reasons: ["Allocates to emerging managers"], whyThisLp: "Has backed first-time funds.",
    tags: [], segments: ["decision_makers"] as any, stage: "identified" as any,
    isHnwAngel: false, hnwSignals: [],
  }
}

// ─── Output: the lists ──────────────────────────────────────────────────────

describe("buildLpLists", () => {
  const fund = { name: "Test Fund II" }

  it("keeps the ranking order, splits at 200, and numbers ranks across files", () => {
    const firms = Array.from({ length: 450 }, (_, i) => firm(i, 100 - i / 10))
    const files = buildLpLists("firms", firms, fund)
    expect(files.map((f) => [f.index, f.of, f.firstRank, f.lastRank, f.rows])).toEqual([
      [1, 3, 1, 200, 200], [2, 3, 201, 400, 200], [3, 3, 401, 450, 50],
    ])
    const rows = files.flatMap((f) => readListRows(f.workbook).rows)
    expect(rows.map((r) => Number(r[0]))).toEqual(Array.from({ length: 450 }, (_, i) => i + 1))
    // Every firm exactly once, in ranked order, keyed for a CRM import.
    expect(rows.map((r) => String(r[r.length - 1]))).toEqual(rankLps(firms).map((f) => `firm:${f.firmId}`))
    expect(new Set(rows.map((r) => String(r[r.length - 1]))).size).toBe(450)
  })

  it("carries what a GP needs to decide, for firms and for people", () => {
    const [file] = buildLpLists("firms", [firm(1, 95)], fund)
    const { headers, rows } = readListRows(file.workbook)
    expect(headers).toEqual([...LP_FIRM_LIST_HEADERS])
    const row = Object.fromEntries(headers.map((h, i) => [h, rows[0][i]]))
    expect(row).toMatchObject({
      Rank: 1, Score: 95, Firm: "Family Office 00001", "LP type": "Family Office",
      AUM: "$500.0M", Anchor: "Anchor", "Why this LP": "Invests in university spinout strategies.",
    })

    const [people] = buildLpLists("contacts", [contact(1, 88)], fund)
    const p = readListRows(people.workbook)
    expect(p.headers).toEqual([...LP_CONTACT_LIST_HEADERS])
    expect(Object.fromEntries(p.headers.map((h, i) => [h, p.rows[0][i]]))).toMatchObject({
      Name: "Partner 00001", Title: "Chief Investment Officer", Email: "p1@lp.example", "Anker ID": `contact:${uuidFor("c", 1)}`,
    })
  })

  it("produces no files for no matches, and never more than 200 rows in one", () => {
    expect(buildLpLists("firms", [], fund)).toEqual([])
    const files = buildLpLists("contacts", Array.from({ length: 201 }, (_, i) => contact(i, 50)), fund)
    expect(files).toHaveLength(2)
    for (const f of files) expect(f.rows).toBeLessThanOrEqual(LIST_SIZE)
  })

  it("keeps the engine's order where scores tie, so ranks agree with the workbook", () => {
    // Same score, engine order B then A. A name tiebreak would swap them here
    // and disagree with the shortlist workbook and the saved rows.
    const tied = [{ ...firm(2, 80), name: "Zeta Office" }, { ...firm(1, 80), name: "Alpha Office" }]
    const [file] = buildLpLists("firms", tied, fund)
    expect(readListRows(file.workbook).rows.map((r) => r[3])).toEqual(["Zeta Office", "Alpha Office"])
  })

  it("splits without losing or repeating anything, for any size", () => {
    const items = Array.from({ length: 1007 }, (_, i) => i)
    const chunks = chunkInvestors(items, 200)
    expect(chunks.flat()).toEqual(items)
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 200, 200, 200, 7])
  })
})

// ─── Input: what the deck must supply ───────────────────────────────────────

describe("fund readiness", () => {
  const complete = {
    name: "Test Fund II", targetRaise: 40_000_000, sectors: ["software"],
    headquartersLocation: "Utah, United States", geographicFocus: ["united states"],
  }

  it("accepts a complete profile", () => expect(fundReadiness(complete)).toEqual([]))

  it("names exactly what a deck left out", () => {
    expect(fundReadiness({ ...complete, geographicFocus: [] }).map((i) => i.field)).toEqual(["geographicFocus"])
    expect(fundReadiness({ ...complete, targetRaise: 0 }).map((i) => i.field)).toEqual(["targetRaise"])
    expect(fundReadiness({ name: "", targetRaise: null, sectors: [], headquartersLocation: null, geographicFocus: [] }).map((i) => i.field))
      .toEqual(["name", "targetRaise", "sectors", "headquartersLocation", "geographicFocus"])
  })
})

// ─── The defect: the engine's columns against the real schema ───────────────

const SESSION_ID = "aaaaaaaa-0000-4000-8000-000000000001"
const FUND_PROFILE_ID = "bbbbbbbb-0000-4000-8000-000000000002"

describe("saveSessionV2 against the migrated schema", () => {
  let db: PGlite

  const result = (): MatchingResultV2 => ({
    sessionId: SESSION_ID, fundProfileId: FUND_PROFILE_ID, fundName: "Test Fund II",
    firms: [firm(1, 95), firm(2, 90)], contacts: [contact(1, 88), contact(2, 80)],
    totals: {
      rawFirms: 18982, rawContacts: 47275, qualifiedFirms: 2, qualifiedContacts: 2,
      contactsWithEmail: 2, anchorCandidates: 1, aiEnrichmentsApplied: 0, duplicatesMerged: 0,
    } as any,
    tierCounts: { champion: 1, A: 1, B: 0, C: 0 } as any,
    segmentCounts: {} as any, funnel: {} as any, durationMs: 1234,
  } as MatchingResultV2)

  beforeAll(async () => {
    db = new PGlite()
    state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
    // The tables exactly as production had them before the repair: 8, 16 and
    // 13 columns. This is the shape every LP run failed against.
    await db.exec(`
      CREATE TABLE lp_match_sessions (
        id uuid PRIMARY KEY, fund_profile_id uuid, algorithm text,
        total_firms_matched int, total_contacts_matched int, filters_applied jsonb,
        status text, created_at timestamptz DEFAULT now());
      CREATE TABLE lp_firm_matches (
        id uuid PRIMARY KEY, session_id uuid, firm_id uuid, firm_name text, score numeric(5,2),
        tier text, tier_label text, factor_sector int, factor_stage int, factor_geography int,
        factor_fund_size int, factor_track_record int, reasoning jsonb, status text, notes text,
        created_at timestamptz DEFAULT now());
      CREATE TABLE lp_contact_matches (
        id uuid PRIMARY KEY, session_id uuid, firm_match_id uuid, contact_id uuid, contact_name text,
        contact_email text, contact_title text, contact_linkedin text, score numeric(5,2),
        is_decision_maker boolean, status text, notes text, created_at timestamptz DEFAULT now());
    `)
  })
  afterAll(async () => db.close())
  beforeEach(async () => { await db.exec("DELETE FROM lp_match_sessions; DELETE FROM lp_firm_matches; DELETE FROM lp_contact_matches;") })

  it("fails on the legacy schema — the defect this migration repairs", async () => {
    await expect(saveSessionV2(result(), "u-1")).rejects.toThrow(/fund_name|column/i)
  })

  it("saves the session, every firm and every contact once migrated", async () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "scripts/migrations/2026-09-23-lp-matching-repair.sql"), "utf8")
    await db.exec(migration)

    await saveSessionV2(result(), "u-1")

    const session = (await db.query<any>("SELECT * FROM lp_match_sessions")).rows
    expect(session).toHaveLength(1)
    expect(session[0]).toMatchObject({
      id: SESSION_ID, fund_name: "Test Fund II", qualified_firms: 2, qualified_contacts: 2,
      anchor_candidates: 1, engine_version: "v2", status: "completed", user_id: "u-1", duration_ms: 1234,
    })

    const firms = (await db.query<any>("SELECT * FROM lp_firm_matches ORDER BY score DESC")).rows
    expect(firms.map((f) => f.firm_name)).toEqual(["Family Office 00001", "Family Office 00002"])
    expect(firms[0]).toMatchObject({
      fund_profile_id: FUND_PROFILE_ID, firm_type: "Family Office", firm_aum_usd: 500000000,
      why_this_lp: "Invests in university spinout strategies.", stage: "identified", tier: "champion",
    })
    expect(firms[0].tags).toEqual(["ANCHOR"])

    const contacts = (await db.query<any>("SELECT * FROM lp_contact_matches ORDER BY score DESC")).rows
    expect(contacts.map((c) => c.contact_name)).toEqual(["Partner 00001", "Partner 00002"])
    expect(contacts[0]).toMatchObject({
      investor_id: uuidFor("c", 1), contact_title: "Chief Investment Officer",
      contact_email: "p1@lp.example", factor_contact_quality: 80, stage: "identified",
    })
  })

  it("marks a session failed rather than leaving it running", async () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "scripts/migrations/2026-09-23-lp-matching-repair.sql"), "utf8")
    await db.exec(migration)
    const broken = { ...result(), firms: [{ ...firm(1, 95), score: "not a number" as any }] }
    await expect(saveSessionV2(broken as MatchingResultV2, "u-1")).rejects.toThrow()
    const [row] = (await db.query<any>("SELECT status FROM lp_match_sessions")).rows
    expect(row.status).toBe("failed")
  })
})
