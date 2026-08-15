/**
 * Summit Venture Studio Fund II — Outreach Pipeline Orchestrator
 *
 * Coordinates all 4 steps:
 *   1. ENRICH  — enrichAll()    (lib/outreach/enrichment.ts)
 *   2. DRAFT   — draftAll()     (lib/outreach/emailDrafter.ts)
 *   3. EXPORT  — Excel via Python or SheetJS fallback
 *   4. HTML    — buildHtmlReviewUI()
 *
 * Also exports:
 *   - SVS_SENDER_BRIEF — canonical SenderBrief from the uploaded Excel
 *   - parseExcelProfiles() — reads "Curated Profiles" sheet into InvestorProfile[]
 *   - runPipeline() — top-level entry point
 */

import fs from "node:fs"
import path from "node:path"
import type {
  InvestorProfile,
  SenderBrief,
  PipelineResult,
  PipelineConfig,
  PipelineStats,
  PrimaryChannel,
} from "./types"
import { enrichAll } from "./enrichment"
import { draftAll } from "./emailDrafter"
import { buildXlsxInProcess, exportWithPython } from "./excelExporter"
import { buildHtmlReviewUI } from "./htmlReviewUI"
import { SENDER_PROFILE } from "./sender-profile"

// ─── Canonical sender brief ────────────────────────────────────────────────────
// Source: SVS_Fund_II_Curated_Outreach.xlsx → "Sender Brief" sheet

// Identity fields (name, LinkedIn, fund name) come from the configurable
// SENDER_PROFILE; the detailed pitch below is this fund's own story — replace it
// (or extend SENDER_PROFILE) when re-pointing at a different fund.
export const SVS_SENDER_BRIEF: SenderBrief = {
  senderName: SENDER_PROFILE.name,
  senderRole: "VP, Summit Venture Studio (Investment & Fundraising Lead, Winner Capital)",
  senderLinkedIn: SENDER_PROFILE.linkedin,
  senderTagline: "Adding value to each and every commitment and endeavor",
  senderBackground:
    "2x founder; AI/ML engineer; Medtech operator; Ambassador @ Liora; Investment & Fundraising Lead @ Winner Capital; VP @ Summit Venture Studio",

  fundName: SENDER_PROFILE.fundName,
  fundURL: "https://www.sv.studio",
  fundHQ: "Lehi, Utah (USA)",
  fundVehicle: "Class A Preferred Units",
  fundTarget: "$40M (up to $50M)",
  fundMinimum: "$1M",
  fundUnitPrice: "$1.00",
  fundISize: "$10M",
  fundIClose: "December 2022",
  fundIStatus: "Fully called and invested; results unrealized as portfolio companies mature",

  model:
    "Venture studio + fund (micro-private equity) commercializing university-originated software",
  thesis:
    "Sources de-risked, university-developed software assets before company formation; installs industry CEOs; SVS provides CTO, CFO, GTM, and ops; deploys capital on milestone achievement; builds companies for acquisition.",
  differentiators: [
    "200+ university and hospital partnerships providing deal flow outside traditional VC channels",
    "~1,000 opportunities screened per month via proprietary AI-driven triage",
    "Each company led by a proven industry CEO operator (founder-led revenue)",
    "~90% ownership at formation, ~50% ownership at exit",
    "Target exit timeline ~3 years (vs. traditional 7-10 yr VC cycle)",
    "$1-3M of prior non-dilutive R&D per asset reduces capital + tech risk",
    "Companies engineered for acquisition from inception, not long-duration optionality",
  ],
  lpQuote:
    "\"You're not just another early stage, SaaS VC\" - SVS Fund I anchor, Family Office CIO",
  voicePrinciples: [
    "Relationship before transaction - first contact does not pitch the fund line-item; it opens a conversation.",
    "Quiet credibility - reference one specific reason this investor was selected; no superlatives.",
    "No em-dashes, no hype, no generic compliments.",
    "Concrete proof points only when they earn the line (Fund I closed $10M, 200+ university partnerships, ~90% formation ownership).",
    "One clear ask: a 20-30 minute introductory call, not a commitment.",
  ],
}

// ─── Excel parser ─────────────────────────────────────────────────────────────

/**
 * Parse an XLSX file's "Curated Profiles" sheet into InvestorProfile[].
 * Uses the SheetJS library already in package.json.
 */
export function parseExcelProfiles(xlsxPath: string, limit?: number): InvestorProfile[] {
  // Dynamic import to avoid loading SheetJS in edge environments
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx")
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets["Curated Profiles"]
  if (!ws) throw new Error('Sheet "Curated Profiles" not found in workbook')

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 0,
    defval: "",
  })

  const profiles: InvestorProfile[] = []

  for (const row of rows.slice(0, limit)) {
    const id = Number(row["#"] ?? 0)
    if (!id) continue

    profiles.push({
      id,
      tier: (Number(row["Tier"] ?? 3) || 3) as 1 | 2 | 3,
      score: Number(row["Score"] ?? 0),
      name: String(row["Name"] ?? ""),
      titleRole: String(row["Title/Role"] ?? ""),
      lpType: String(row["LP Type"] ?? "Institutional"),
      tags: String(row["Tags"] ?? ""),
      location: String(row["Location"] ?? ""),
      email: String(row["Email"] ?? ""),
      linkedin: String(row["LinkedIn"] ?? ""),
      sectors: String(row["Sectors"] ?? ""),
      whyThisContact: String(row["Why This Contact"] ?? ""),
      inferredWebsite: String(row["Inferred Website"] ?? ""),
      crawlStatus: String(row["Crawl Status"] ?? ""),
      websiteTitle: String(row["Website Title"] ?? ""),
      investmentFocusExtracted: String(row["Investment Focus (extracted)"] ?? ""),
      metaDescription: String(row["Meta Description"] ?? ""),
      otherEmailsOnSite: String(row["Other Emails on Site"] ?? ""),
      crawlPathsTried: String(row["Crawl Paths Tried"] ?? ""),
    })
  }

  return profiles
}

// ─── Stats builder ────────────────────────────────────────────────────────────

function buildStats(result: Omit<PipelineResult, "stats" | "generatedAt">): PipelineStats {
  const { enriched, drafts } = result
  const total = enriched.length

  const byLPType: Record<string, number> = {}
  const byTier: Record<number, number> = {}
  const byChannel: Record<PrimaryChannel, number> = {
    linkedin: 0, email: 0, dual: 0, skip: 0,
  }

  let multiTouchCount = 0
  let scoreSum = 0
  let tier1Count = 0

  for (const p of enriched) {
    byLPType[p.lpType] = (byLPType[p.lpType] ?? 0) + 1
    byTier[p.tier] = (byTier[p.tier] ?? 0) + 1
    if (p.isMultiTouch) multiTouchCount++
    scoreSum += p.score
    if (p.score >= 60) tier1Count++
  }

  for (const d of drafts) {
    const ch = d.primaryChannel as PrimaryChannel
    byChannel[ch] = (byChannel[ch] ?? 0) + 1
  }

  return {
    total,
    batches: Math.ceil(total / 10),
    multiTouchCount,
    avgScore: total > 0 ? Math.round(scoreSum / total) : 0,
    byLPType,
    byTier,
    byChannel,
    tier1Count,
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Run the full 4-step outreach pipeline.
 *
 * @param profiles   Pre-loaded InvestorProfile[] (use parseExcelProfiles() to load)
 * @param config     Optional runtime config overrides
 * @param onProgress Optional progress callback (step, done, total, name)
 */
export async function runPipeline(
  profiles: InvestorProfile[],
  config: PipelineConfig = {},
  onProgress?: (step: string, done: number, total: number, name: string) => void
): Promise<PipelineResult> {
  const {
    outputDir = path.join(process.cwd(), "reports"),
    draftModel: _draftModel,
    enrichmentModel: _enrichmentModel,
  } = config

  fs.mkdirSync(outputDir, { recursive: true })

  // ── Step 1: Enrich ──────────────────────────────────────────────────────
  console.log("\n[Pipeline] Step 1: Profile Enrichment")
  const enriched = await enrichAll(
    profiles,
    SVS_SENDER_BRIEF,
    (done, total, name) => onProgress?.("enrich", done, total, name)
  )

  // ── Step 2: Draft ───────────────────────────────────────────────────────
  console.log("\n[Pipeline] Step 2: Email Drafting")
  const drafts = await draftAll(
    enriched,
    SVS_SENDER_BRIEF,
    (done, total, name) => onProgress?.("draft", done, total, name)
  )

  // ── Assemble result ─────────────────────────────────────────────────────
  const partialResult = { enriched, drafts, senderBrief: SVS_SENDER_BRIEF }
  const stats = buildStats(partialResult)
  const result: PipelineResult & { senderBrief: SenderBrief } = {
    ...partialResult,
    stats,
    generatedAt: new Date().toISOString(),
  }

  // ── Step 3: Excel export ────────────────────────────────────────────────
  console.log("\n[Pipeline] Step 3: Excel Export")
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-").replace("T", "_")
  const xlsxPath = path.join(outputDir, `svs-campaign-${ts}.xlsx`)

  // Try Python-backed export first (full formatting); fall back to SheetJS
  let excelPath: string
  try {
    const pyScript = path.join(process.cwd(), "scripts", "build_outreach_excel.py")
    if (fs.existsSync(pyScript)) {
      // Write JSON for Python script
      const jsonPath = path.join(outputDir, `_tmp_${ts}.json`)
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2))
      excelPath = await exportWithPython(result, xlsxPath)
      fs.unlinkSync(jsonPath)
    } else {
      throw new Error("Python script not found")
    }
  } catch (err) {
    console.warn("[Pipeline] Python export failed, using SheetJS fallback:", err)
    const buf = buildXlsxInProcess(result)
    fs.writeFileSync(xlsxPath, buf)
    excelPath = xlsxPath
  }
  console.log(`[Pipeline] Excel → ${excelPath}`)

  // ── Step 4: HTML review UI ──────────────────────────────────────────────
  console.log("\n[Pipeline] Step 4: HTML Review UI")
  const htmlPath = path.join(outputDir, `svs-campaign-${ts}.html`)
  const html = buildHtmlReviewUI(result)
  fs.writeFileSync(htmlPath, html, "utf8")
  console.log(`[Pipeline] HTML  → ${htmlPath}`)

  console.log("\n[Pipeline] Complete.")
  return result
}
