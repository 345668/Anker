/**
 * The founder matchmaking engine, driven end to end by one PDF.
 *
 *   FOUNDER_PDF=/path/to/deck.pdf \
 *   FOUNDER_PDF_TRUTH=/path/to/truth.json \
 *   FOUNDER_MATCH_OUT=/path/to/output-dir \
 *   DATABASE_URL=… npx vitest run lib/matching/v2/pdf-pipeline.integration.test.ts
 *
 * Skipped unless both are set: it needs the real investor database and the AI
 * provider, and a founder's deck is confidential — neither the deck nor
 * anything read off it is committed. See docs/architecture/09.
 *
 * The truth file is read from the deck by hand, not from any model, and lives
 * beside the deck:
 *
 *   {
 *     "name": "Example Athletics",          // matched case-insensitively
 *     "stage": "pre-seed",
 *     "askAmount": 1000000,
 *     "pageCount": 14,
 *     "mustAppear": ["RAISING $2MM", "SAFE"],   // strings the text layer must carry
 *     "overrides": [                             // only for what the deck omits
 *       { "field": "location", "value": "United States", "evidence": "…" }
 *     ]
 *   }
 *
 * Assertions are on facts a correct extraction must get, not on wording.
 */
import { describe, it, expect, beforeAll, vi } from "vitest"
vi.mock("server-only", () => ({}))

import fs from "node:fs"
import path from "node:path"
import * as XLSX from "xlsx"
import { extractPdfText } from "@/lib/ai/pdf"
import { sql } from "@/lib/db"
import { runFounderMatching } from "./founder-engine"
import { saveRun, type RunReceipt } from "./founder-runs"
import { buildFounderWorkbook } from "./founder-xlsx"
import { FOUNDER_MIN_SCORE } from "./founder-scoring"
import { tierFor } from "./types"
import {
  pdfForExtraction, profileFromPdf, buildInvestorLists, buildGroupLists, readListRows,
  LIST_SIZE, type ProfileFromPdf, type ListFile,
} from "./pdf-pipeline"
import { resolveGeo } from "../normalize/geo"
import type { FounderMatchingResult } from "./founder-types"

const PDF = process.env.FOUNDER_PDF
const OUT = process.env.FOUNDER_MATCH_OUT
/**
 * "<orgId>:<userId>" — persists the run, the way the LP test does (doc 20
 * §2.2). Off by default so the standard run stays read-only.
 */
const PERSIST = process.env.FOUNDER_PERSIST_SCOPE
const TRUTH_FILE = process.env.FOUNDER_PDF_TRUTH

interface DeckTruth {
  name: string
  stage: string
  askAmount: number
  pageCount?: number
  mustAppear?: string[]
  /** Declared overrides for what the deck omits — never silently merged. */
  overrides?: { field: string; value: string; evidence: string }[]
}

const TRUTH: DeckTruth | null = TRUTH_FILE ? JSON.parse(fs.readFileSync(TRUTH_FILE, "utf8")) : null
const OVERRIDES = (TRUTH?.overrides ?? []) as { field: any; value: string; evidence: string }[]

describe.skipIf(!PDF || !TRUTH)("founder matching from a PDF alone", () => {
  let bytes: Buffer
  let text: Awaited<ReturnType<typeof extractPdfText>>
  let profile: ProfileFromPdf
  let result: FounderMatchingResult
  let firmLists: ListFile[]
  let peopleLists: ListFile[]
  const groups = () => result.groups ?? []
  const independents = () => result.independents ?? []
  const timings: Record<string, number> = {}
  let receipt: RunReceipt | null = null

  beforeAll(async () => {
    bytes = fs.readFileSync(PDF!)
    let t = Date.now()
    text = await extractPdfText(bytes)
    timings.pdfTextMs = Date.now() - t

    t = Date.now()
    profile = await profileFromPdf(pdfForExtraction(bytes, path.basename(PDF!)), OVERRIDES)
    timings.extractionMs = Date.now() - t
    if (!profile.startup) throw new Error(`profile still incomplete after overrides: ${JSON.stringify(profile.missing)}`)

    t = Date.now()
    result = await runFounderMatching(profile.startup)
    timings.matchingMs = Date.now() - t

    firmLists = buildGroupLists(groups(), profile.startup)
    peopleLists = buildInvestorLists("people", independents(), profile.startup)

    if (PERSIST) {
      const [orgId, userId] = PERSIST.split(":")
      t = Date.now()
      receipt = await saveRun(result, profile.startup!, { orgId, userId })
      timings.saveMs = Date.now() - t
      console.log(`  saved run ${receipt.runId}: ${receipt.groups} groups, ${receipt.independents} independents, ${receipt.shown.recorded} match_shown events`)
    }
  }, 900_000)

  // ─── Input: the PDF itself ────────────────────────────────────────────────

  it("reads the deck's text layer, and the facts on the page reach it", () => {
    console.log(`\n  pdf: ${text.pageCount} pages, ${text.text.length} chars via ${text.source}, ${text.imageOnlyPages} image-only pages`)
    // Every page of this deck carries text (55–197 words each, measured with
    // pdfjs directly). Before the fix in lib/ai/pdf.ts this read 0 characters
    // and 14 image-only pages — for this deck and every other PDF.
    if (TRUTH!.pageCount) expect(text.pageCount).toBe(TRUTH!.pageCount)
    expect(text.source).toBe("pdfjs")
    expect(text.imageOnlyPages).toBe(0)
    expect(text.text.length).toBeGreaterThan(8000)
    for (const fact of [TRUTH!.name, ...(TRUTH!.mustAppear ?? [])]) {
      expect(text.text.toLowerCase()).toContain(fact.toLowerCase())
    }
  })

  // ─── Extraction: PDF → profile ───────────────────────────────────────────

  it("extracts the company, stage and ask correctly", () => {
    const x = profile.extracted
    console.log("  extracted:", JSON.stringify({
      name: x.name, stage: x.stage, askAmount: x.askAmount, preMoneyValuation: x.preMoneyValuation,
      location: x.location, sectors: x.sectors, confidence: x.confidence,
      path: x.notes?.startsWith("AI extraction was unavailable") ? "heuristic fallback" : "AI",
    }))
    expect(x.name?.toLowerCase()).toContain(TRUTH!.name.toLowerCase())
    expect(x.stage).toBe(TRUTH!.stage)
    expect(x.askAmount).toBe(TRUTH!.askAmount)
    expect(x.sectors?.length ?? 0).toBeGreaterThan(0)
  })

  it("does not invent a location the deck never states", () => {
    // A specific city would be a hallucination. A country-level value is only
    // acceptable because the deck names its market as US organisations.
    const loc = profile.extracted.location
    if (loc) expect(loc).toMatch(/united states|\busa?\b|north america/i)
    console.log(`  location from PDF: ${loc ?? "(none — correctly left empty)"}`)
  })

  it("reports honestly what a PDF alone could not supply", () => {
    const missingFromPdf = profile.pdfOnlyMissing.map((m) => m.field)
    console.log(`  PDF-only missing: [${missingFromPdf.join(", ") || "nothing"}] · overrides applied: [${profile.overrides.map((o) => o.field).join(", ") || "none"}]`)
    // Whatever the PDF lacked, only a declared override may have filled it.
    expect(profile.missing).toEqual([])
    for (const f of missingFromPdf) expect(profile.overrides.map((o) => o.field)).toContain(f)
  })

  // ─── Engine (v3, docs/architecture/11 §8 acceptance) ─────────────────────

  it("returns firm groups and independent investors, every one above the floor", () => {
    console.log(`  engine ${result.engineVersion}: ${groups().length} firm groups, ${independents().length} independents in ${timings.matchingMs} ms (qualified before cap ${JSON.stringify(result.qualifiedBeforeCap)}, AI rationales ${result.totals.aiEnrichmentsApplied})`)
    console.log(`  semantic: ${result.semantic?.status}${result.semantic?.reason ? ` — ${result.semantic.reason}` : ""} · emails verified: ${JSON.stringify(result.emailVerification)}`)
    expect(result.engineVersion).toBe("founder-v3")
    expect(groups().length).toBeGreaterThan(0)
    for (const g of groups()) expect(g.firm.score).toBeGreaterThanOrEqual(FOUNDER_MIN_SCORE)
    for (const p of independents()) expect(p.score).toBeGreaterThanOrEqual(FOUNDER_MIN_SCORE)
  })

  it("reports whether semantic matching ran, and uses it when it did (§8.8)", () => {
    expect(["ok", "unavailable"]).toContain(result.semantic?.status)
    if (result.semantic?.status === "ok") {
      expect(groups().some((g) => (g.firm.components?.thesis.semantic ?? 0) > 0)).toBe(true)
    }
  })

  it("puts vertical specialists first: the sports/health share falls as rank falls (§8.1)", () => {
    const vertical = (g: (typeof result.groups & {})[number]) => (g.firm.sectors ?? []).some((s) => s === "sports" || s === "healthcare")
    const all = groups()
    const edges = [0, 50, 200, 1000, 2000, 5000, all.length].filter((n, i, a) => n <= all.length && (i === 0 || n > a[i - 1]))
    const bands = edges.slice(1).map((end, i) => {
      const slice = all.slice(edges[i], end)
      return { ranks: `${edges[i] + 1}-${end}`, share: slice.filter(vertical).length / slice.length }
    })
    console.log("  vertical share by band:", bands.map((b) => `${b.ranks}: ${Math.round(b.share * 100)}%`).join(" · "))
    // Doc 11 §8.1 (revised): ≥ 95% of the top 200 are vertical, the top band is
    // the highest, and the last band is under half the top band.
    const top200 = all.slice(0, 200)
    expect(top200.filter(vertical).length / top200.length).toBeGreaterThanOrEqual(0.95)
    expect(bands[0].share).toBe(Math.max(...bands.map((b) => b.share)))
    if (bands.length > 2) expect(bands[bands.length - 1].share).toBeLessThan(bands[0].share / 2)
  })

  it("makes only specialists at the right stage Champions (§8.2)", () => {
    const champions = groups().filter((g) => g.firm.tier === "champion" && g.scoreFrom === "firm")
    console.log(`  champions: ${champions.length}`)
    for (const g of champions) {
      expect(g.firm.components!.thesis.value).toBeGreaterThanOrEqual(0.75)
      expect(g.firm.components!.stage.value).toBe(1)
    }
  })

  it("never gives a European or African firm a same-country score for a US startup (§8.3)", () => {
    const wrong = groups().filter((g) => {
      const c = resolveGeo(g.firm.location).country
      return ["CH", "NL", "PL", "FI", "IE", "NG"].includes(c ?? "") && g.firm.components!.geography.value === 1
    })
    expect(wrong.map((g) => `${g.firm.name} (${g.firm.location})`)).toEqual([])
  })

  it("breaks ties by evidence, not by name, in the top 200 (§8.5)", () => {
    const key = (g: (typeof result.groups & {})[number]) => {
      const f = g.firm as any
      return `${f.score}|${(f.semanticValue ?? 0).toFixed(6)}|${(f.qualityValue ?? 0).toFixed(6)}`
    }
    const counts = new Map<string, number>()
    const shown = new Map<number, number>()
    for (const g of groups().slice(0, 200)) {
      counts.set(key(g), (counts.get(key(g)) ?? 0) + 1)
      shown.set(g.firm.score, (shown.get(g.firm.score) ?? 0) + 1)
    }
    const worst = Math.max(0, ...counts.values())
    console.log(`  top-200: largest group sharing the full ranking key: ${worst}; sharing a displayed score: ${Math.max(0, ...shown.values())}`)
    expect(worst).toBeLessThanOrEqual(3)
  })

  it("groups people correctly: ≤ 3 per firm, their own firm, nobody twice (§8.6)", () => {
    const seen = new Set<string>()
    for (const g of groups()) {
      const people = [g.primary, ...g.alternates].filter(Boolean)
      expect(people.length).toBeLessThanOrEqual(3)
      for (const p of people) {
        expect(String(p!.firmId)).toBe(String(g.firm.id))
        expect(seen.has(p!.id)).toBe(false)
        seen.add(p!.id)
      }
    }
    for (const p of independents()) expect(seen.has(p.id)).toBe(false)
    expect(new Set(groups().map((g) => g.firm.id)).size).toBe(groups().length)
  })

  it("assigns every result the tier its score earns", () => {
    const wrong = [...groups().map((g) => g.firm), ...independents()].filter((e) => e.tier !== tierFor(e.score))
    expect(wrong.map((e) => `${e.name}: ${e.score} → ${e.tier}`)).toEqual([])
  })

  it("never labels an address Verified unless a provider confirmed it", () => {
    const people = [...groups().flatMap((g) => [g.primary, ...g.alternates]), ...independents()].filter(Boolean)
    for (const p of people) if (p!.emailStatus === "valid") expect(p!.emailVerified).toBe(true)
    const verified = people.filter((p) => p!.emailStatus === "valid").length
    if (!result.emailVerification?.providerConfigured) expect(verified).toBe(0)
  })

  // ─── Output ──────────────────────────────────────────────────────────────

  it("produces the product's shortlist workbook", () => {
    const wb = buildFounderWorkbook(result, profile.startup!)
    expect(wb.SheetNames).toEqual(["Summary", "Lead Candidates", "Firm Groups", "Independent Investors", "Ready to Email", "Import Selection"])
  })

  it("splits groups and independents into lists of at most 200, losing and repeating none", () => {
    for (const [lists, all] of [[firmLists, groups().map((g) => g.firm)], [peopleLists, independents()]] as const) {
      for (const f of lists) expect(f.rows).toBeLessThanOrEqual(LIST_SIZE)
      const ids = lists.flatMap((f) => readListRows(f.workbook).rows.map((r) => String(r[r.length - 1])))
      expect(ids).toHaveLength(all.length)
      expect(new Set(ids).size).toBe(all.length)
      const ranks = lists.flatMap((f) => readListRows(f.workbook).rows.map((r) => Number(r[0])))
      expect(ranks).toEqual(Array.from({ length: all.length }, (_, i) => i + 1))
    }
    console.log(`  lists: ${firmLists.length} firm-group files, ${peopleLists.length} independent files`)
  })

  // ─── Persistence (doc 20 §2.2) ───────────────────────────────────────────

  it.skipIf(!PERSIST)("saves the run, its results and what the founder was shown", async () => {
    const [run] = await sql`SELECT * FROM founder_match_runs WHERE id = ${receipt!.runId}`
    expect(run).toBeTruthy()
    expect(run.engine_version).toBe("founder-v3")
    expect(run.options.weights).toBe(result.weightSource ?? "expert")

    const [{ n: groupRows }] = await sql`SELECT count(*)::int AS n FROM founder_match_results WHERE run_id = ${receipt!.runId} AND kind = 'group'`
    expect(groupRows).toBe(groups().length)

    // The write that failed silently from matching v3 until doc 17.
    expect(receipt!.shown.failed).toBeNull()
    const [{ n: events }] = await sql`
      SELECT count(*)::int AS n FROM match_outcome_events
       WHERE event_type = 'match_shown' AND source = 'founder_match' AND metadata->>'runId' = ${receipt!.runId}`
    expect(events).toBe(receipt!.shown.recorded)
    expect(events).toBeGreaterThan(0)
    console.log(`  persisted: ${groupRows} group rows, ${events} match_shown events`)
  })

  // ─── Write the deliverables ──────────────────────────────────────────────

  it.skipIf(!OUT)("writes the shortlist, the lists and a manifest", () => {
    fs.mkdirSync(OUT!, { recursive: true })
    const base = (profile.startup!.name || "startup").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const written: string[] = []
    const write = (name: string, wb: XLSX.WorkBook) => {
      const p = path.join(OUT!, name)
      XLSX.writeFile(wb, p)
      written.push(name)
    }
    write(`${base}-shortlist.xlsx`, buildFounderWorkbook(result, profile.startup!))
    const pad = (n: number, of: number) => String(n).padStart(String(of).length, "0")
    for (const f of firmLists) write(`${base}-firm-groups-${pad(f.index, f.of)}-of-${f.of} (ranks ${f.firstRank}-${f.lastRank}).xlsx`, f.workbook)
    for (const f of peopleLists) write(`${base}-independents-${pad(f.index, f.of)}-of-${f.of} (ranks ${f.firstRank}-${f.lastRank}).xlsx`, f.workbook)

    const top = (list: typeof result.firms) => list.slice(0, 15).map((e) => ({ name: e.name, type: e.type, score: e.score, tier: e.tier, location: e.location, why: e.whyMatch, gates: e.gates }))
    const manifest = {
      input: { file: path.basename(PDF!), bytes: bytes.length, pages: text.pageCount, imageOnlyPages: text.imageOnlyPages, textChars: text.text.length, textSource: text.source },
      extractedFromPdf: profile.extracted,
      pdfOnlyMissing: profile.pdfOnlyMissing,
      overridesApplied: profile.overrides,
      profileUsedForMatching: profile.startup,
      engine: { durationMs: timings.matchingMs, totals: result.totals, tierCounts: result.tierCounts, segmentCounts: result.segmentCounts },
      topFirmGroups: groups().slice(0, 15).map((g) => ({ firm: g.firm.name, score: g.firm.score, tier: g.firm.tier, location: g.firm.location, why: g.firm.whyMatch, primary: g.primary && { name: g.primary.name, title: g.primary.title, emailStatus: g.primary.emailStatus ?? null } })),
      topIndependents: top(independents()),
      semantic: result.semantic,
      qualifiedBeforeCap: result.qualifiedBeforeCap,
      emailVerification: result.emailVerification,
      files: written,
      extraction: {
        provider: profile.extracted.notes?.startsWith("AI extraction was unavailable") ? "heuristic fallback" : "AI",
        confidence: profile.extracted.confidence,
        notes: profile.extracted.notes,
      },
      verified: [
        "PDF text layer read (pdfjs); key facts present in text",
        "name, stage and ask match the deck",
        "no invented location",
        "engine v3: every result >= the floor (40), tier matches score",
        "vertical (sports/health) share highest in ranks 1-50 and falling by band",
        "every firm-scored Champion has thesis >= 0.75 and exact stage",
        "no CH/NL/PL/FI/IE/NG firm scored as same-country",
        "<= 3 firms share any score in the top 200",
        "grouping: <= 3 people per firm, all from that firm, nobody twice",
        "no address labelled Verified without a provider",
        "lists <= 200 rows, every entry exactly once, ranks continuous",
      ],
      notVerified: [
        "HTTP routes and authentication (the pipeline is called directly)",
        "session caching (needs a real workspace to own the session)",
        "match QUALITY beyond stage fit — whether these are the right investors needs a human",
      ],
      timings,
    }
    fs.writeFileSync(path.join(OUT!, `${base}-run-manifest.json`), JSON.stringify(manifest, null, 2))
    console.log(`  wrote ${written.length} workbooks + manifest to ${OUT}`)
    expect(written.length).toBe(1 + firmLists.length + peopleLists.length)
  })
})
