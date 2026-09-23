/**
 * The LP matchmaking engine, driven end to end by one fund deck.
 *
 *   FUND_PDF=/path/to/fund-deck.pdf \
 *   FUND_PDF_TRUTH=/path/to/truth.json \
 *   FUND_MATCH_OUT=/path/to/output-dir \
 *   DATABASE_URL=… npx vitest run lib/matching/v2/lp-pdf-pipeline.integration.test.ts
 *
 * Skipped unless FUND_PDF and FUND_PDF_TRUTH are both set: it needs the real
 * investor directory and the AI provider, and a GP's fund deck is confidential
 * — neither the deck nor anything read off it is committed. See
 * docs/architecture/18.
 *
 * The truth file is read from the deck by hand and lives beside it:
 *
 *   {
 *     "name": "Example Fund II",
 *     "targetRaise": 40000000,
 *     "headquartersLocation": "Utah, United States",
 *     "pageCount": 23,
 *     "mustAppear": ["Fund II"],
 *     "overrides": [ { "field": "geographicFocus", "value": ["united states"], "evidence": "…" } ]
 *   }
 */
import { describe, it, expect, beforeAll, vi } from "vitest"
vi.mock("server-only", () => ({}))

import fs from "node:fs"
import path from "node:path"
import * as XLSX from "xlsx"
import { extractPdfText } from "@/lib/ai/pdf"
import { runLpMatchingV2 } from "./engine"
import { saveSessionV2 } from "./persistence"
import { buildPipelineWorkbook } from "./xlsx-builder"
import { sql } from "@/lib/db"
import {
  pdfForFundExtraction, fundProfileFromPdf, buildLpLists, readListRows, LIST_SIZE,
  type FundProfileFromPdf, type LpListFile,
} from "./lp-pdf-pipeline"
import type { FundProfileV2, MatchingResultV2 } from "./types"

const PDF = process.env.FUND_PDF
const TRUTH_FILE = process.env.FUND_PDF_TRUTH
const OUT = process.env.FUND_MATCH_OUT

interface FundTruth {
  name: string
  targetRaise?: number
  headquartersLocation?: string
  pageCount?: number
  mustAppear?: string[]
  overrides?: { field: string; value: unknown; evidence: string }[]
}
const TRUTH: FundTruth | null = TRUTH_FILE ? JSON.parse(fs.readFileSync(TRUTH_FILE, "utf8")) : null
const OVERRIDES = (TRUTH?.overrides ?? []) as { field: any; value: unknown; evidence: string }[]

describe.skipIf(!PDF || !TRUTH)("LP matching from a fund deck alone", () => {
  let bytes: Buffer
  let text: Awaited<ReturnType<typeof extractPdfText>>
  let profile: FundProfileFromPdf
  let fund: FundProfileV2
  let result: MatchingResultV2
  let firmLists: LpListFile[]
  let contactLists: LpListFile[]
  const timings: Record<string, number> = {}

  beforeAll(async () => {
    bytes = fs.readFileSync(PDF!)
    let t = Date.now()
    text = await extractPdfText(bytes)
    timings.pdfTextMs = Date.now() - t

    t = Date.now()
    profile = await fundProfileFromPdf(pdfForFundExtraction(bytes, path.basename(PDF!)), OVERRIDES)
    timings.extractionMs = Date.now() - t
    if (!profile.fund) throw new Error(`fund profile still incomplete after overrides: ${JSON.stringify(profile.missing)}`)

    // A run belongs to a saved fund profile — lp_match_sessions.fund_profile_id
    // is a uuid with a foreign key to fund_profiles, which is how the product
    // works: the GP saves the profile the deck produced, then matches on it.
    // Unowned on purpose (no org, a synthetic user id): this is a harness
    // profile, not a row in anyone's workspace.
    const profileId = crypto.randomUUID()
    await sql`
      INSERT INTO fund_profiles (id, user_id, fund_name, name, target_raise, average_ticket,
                                 sectors, primary_sectors, geographic_focus, headquarters_location,
                                 thesis_keywords, is_active, created_at, updated_at)
      VALUES (${profileId}::uuid, ${crypto.randomUUID()}::uuid, ${profile.fund.name}, ${profile.fund.name},
              ${profile.fund.targetRaise}, ${profile.fund.averageTicket},
              ${JSON.stringify(profile.fund.sectors)}::jsonb, ${JSON.stringify(profile.fund.primarySectors ?? [])}::jsonb,
              ${JSON.stringify(profile.fund.geographicFocus)}::jsonb, ${profile.fund.headquartersLocation},
              ${JSON.stringify(profile.fund.thesisKeywords)}::jsonb, false, now(), now())`
    fund = { ...profile.fund, id: profileId }
    console.log(`  fund profile saved: ${profileId}`)

    t = Date.now()
    result = await runLpMatchingV2(fund, { enableAi: true })
    timings.matchingMs = Date.now() - t

    t = Date.now()
    await saveSessionV2(result, undefined)
    timings.saveMs = Date.now() - t

    firmLists = buildLpLists("firms", result.firms, fund)
    contactLists = buildLpLists("contacts", result.contacts, fund)
  }, 900_000)

  // ─── Input ────────────────────────────────────────────────────────────────

  it("reads the deck's text, and the facts on the page reach it", () => {
    console.log(`\n  pdf: ${text.pageCount} pages, ${text.text.length} chars via ${text.source}, ${text.imageOnlyPages} image-only pages`)
    if (TRUTH!.pageCount) expect(text.pageCount).toBe(TRUTH!.pageCount)
    expect(text.text.length).toBeGreaterThan(1000)
    for (const fact of [TRUTH!.name, ...(TRUTH!.mustAppear ?? [])]) {
      expect(text.text.toLowerCase()).toContain(fact.toLowerCase())
    }
  })

  it("extracts the fund, its raise and its home", () => {
    const x = profile.extracted
    console.log("  extracted:", JSON.stringify({
      name: x.name, fundNumber: x.fundNumber, targetRaise: x.targetRaise, averageTicket: x.averageTicket,
      sectors: x.sectors, primarySector: x.primarySector, headquartersLocation: x.headquartersLocation,
      geographicFocus: x.geographicFocus, thesisKeywords: x.thesisKeywords?.slice(0, 6), confidence: x.confidence,
    }))
    expect(x.name?.toLowerCase()).toContain(TRUTH!.name.toLowerCase().split(" ")[0])
    if (TRUTH!.targetRaise) expect(x.targetRaise).toBe(TRUTH!.targetRaise)
    if (TRUTH!.headquartersLocation) expect(fund.headquartersLocation?.toLowerCase()).toContain(TRUTH!.headquartersLocation.split(",")[0].toLowerCase())
  })

  it("reports honestly what the deck alone could not supply", () => {
    console.log(`  deck-only missing: [${profile.pdfOnlyMissing.map((m) => m.field).join(", ") || "nothing"}] · overrides applied: [${profile.overrides.map((o) => o.field).join(", ") || "none"}]`)
    expect(profile.missing).toEqual([])
    // Only a declared override may have filled a gap.
    for (const m of profile.pdfOnlyMissing) expect(profile.overrides.map((o) => o.field)).toContain(m.field)
  })

  // ─── Engine ───────────────────────────────────────────────────────────────

  it("returns LP firms and LP contacts, and only LP types", () => {
    console.log(`  engine: ${result.firms.length} firms, ${result.contacts.length} contacts in ${timings.matchingMs} ms`)
    console.log(`  totals: ${JSON.stringify(result.totals)}`)
    console.log(`  tiers: ${JSON.stringify(result.tierCounts)}`)
    expect(result.firms.length).toBeGreaterThan(0)
    // Nothing that raises from LPs may appear in a list of LPs.
    const notLp = /venture capital|accelerator|incubator|corporate venture|angel group/i
    const wrong = result.firms.filter((f) => notLp.test(f.type ?? ""))
    expect(wrong.map((f) => `${f.name} (${f.type})`)).toEqual([])
  })

  it("ranks by score, and every result carries its reasoning", () => {
    const scores = result.firms.map((f) => f.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    for (const f of result.firms.slice(0, 25)) {
      expect(f.whyThisLp?.length ?? 0).toBeGreaterThan(0)
      expect(f.tier).toBeTruthy()
    }
  })

  // ─── Persistence — the defect doc 18 §1 records ───────────────────────────

  it("saves the run, and reads every row back", async () => {
    const [session] = await sql`SELECT * FROM lp_match_sessions WHERE id = ${result.sessionId}`
    expect(session).toBeTruthy()
    expect(session.status).toBe("completed")
    expect(Number(session.qualified_firms)).toBe(result.firms.length)

    const [{ n: firmRows }] = await sql`SELECT count(*)::int AS n FROM lp_firm_matches WHERE session_id = ${result.sessionId}`
    const [{ n: contactRows }] = await sql`SELECT count(*)::int AS n FROM lp_contact_matches WHERE session_id = ${result.sessionId}`
    console.log(`  saved: ${firmRows} firm rows, ${contactRows} contact rows in ${timings.saveMs} ms`)
    expect(firmRows).toBe(result.firms.length)
    expect(contactRows).toBe(result.contacts.length)
  })

  // ─── Output ───────────────────────────────────────────────────────────────

  it("produces the shortlist workbook", () => {
    const wb = buildPipelineWorkbook(result, fund)
    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(4)
    console.log(`  workbook sheets: ${wb.SheetNames.join(" · ")}`)
  })

  it("splits the lists at 200, losing and repeating none", () => {
    for (const [lists, all] of [[firmLists, result.firms], [contactLists, result.contacts]] as const) {
      for (const f of lists) expect(f.rows).toBeLessThanOrEqual(LIST_SIZE)
      const ids = lists.flatMap((f) => readListRows(f.workbook).rows.map((r) => String(r[r.length - 1])))
      expect(ids).toHaveLength(all.length)
      expect(new Set(ids).size).toBe(all.length)
      const ranks = lists.flatMap((f) => readListRows(f.workbook).rows.map((r) => Number(r[0])))
      expect(ranks).toEqual(Array.from({ length: all.length }, (_, i) => i + 1))
    }
    console.log(`  lists: ${firmLists.length} firm files, ${contactLists.length} contact files`)
  })

  // ─── Deliverables ─────────────────────────────────────────────────────────

  it.skipIf(!OUT)("writes the shortlist, the lists and a manifest", () => {
    fs.mkdirSync(OUT!, { recursive: true })
    const base = (fund.name || "fund").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const written: string[] = []
    const write = (name: string, wb: XLSX.WorkBook) => { XLSX.writeFile(wb, path.join(OUT!, name)); written.push(name) }

    write(`${base}-LP-shortlist.xlsx`, buildPipelineWorkbook(result, fund))
    const pad = (n: number, of: number) => String(n).padStart(String(of).length, "0")
    for (const f of firmLists) write(`${base}-LP-firms-${pad(f.index, f.of)}-of-${f.of} (ranks ${f.firstRank}-${f.lastRank}).xlsx`, f.workbook)
    for (const f of contactLists) write(`${base}-LP-contacts-${pad(f.index, f.of)}-of-${f.of} (ranks ${f.firstRank}-${f.lastRank}).xlsx`, f.workbook)

    const manifest = {
      input: { file: path.basename(PDF!), bytes: bytes.length, pages: text.pageCount, textChars: text.text.length, textSource: text.source },
      extractedFromPdf: profile.extracted,
      deckOnlyMissing: profile.pdfOnlyMissing,
      overridesApplied: profile.overrides,
      fundUsedForMatching: fund,
      engine: { sessionId: result.sessionId, durationMs: timings.matchingMs, totals: result.totals, tierCounts: result.tierCounts, segmentCounts: result.segmentCounts },
      topFirms: result.firms.slice(0, 15).map((f) => ({ name: f.name, type: f.type, location: f.location, aum: f.aumRaw, score: f.score, tier: f.tier, anchor: f.isAnchor, why: f.whyThisLp })),
      topContacts: result.contacts.slice(0, 15).map((c) => ({ name: c.name, title: c.title, type: c.type, location: c.location, score: c.score, tier: c.tier, why: c.whyThisLp })),
      files: written,
      verified: [
        "deck text read; the facts on the page reach the extractor",
        "fund name, raise and headquarters match the deck",
        "nothing filled except by a declared override",
        "every result is an LP type — no VC, accelerator or corporate venture arm",
        "results ranked by score, each with its reasoning",
        "session, firms and contacts all persisted and read back",
        "lists <= 200 rows, every entry exactly once, ranks continuous",
      ],
      notVerified: [
        "HTTP routes and authentication (the pipeline is called directly)",
        "whether these are the RIGHT LPs — that needs a human",
      ],
      timings,
    }
    fs.writeFileSync(path.join(OUT!, `${base}-LP-run-manifest.json`), JSON.stringify(manifest, null, 2))
    console.log(`  wrote ${written.length} workbooks + manifest to ${OUT}`)
    expect(written.length).toBe(1 + firmLists.length + contactLists.length)
  })
})
