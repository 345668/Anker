/**
 * Internal one-shot: run the full Winner Capital LP pipeline locally and
 * write XLSX + DOCX artifacts.  Dev-only (NODE_ENV !== "production" gate).
 *
 * Steps mirror what the dashboard does when a manager uploads a fund deck
 * and clicks "Extract fund profile" then "Run LP analysis" then "Run
 * matching":
 *   1. Read /tmp/wc-deck.pdf  (+ thesis + track-record as data-room)
 *   2. extractFundProfile() — fund profile JSON
 *   3. analyzeFundDeck()    — 6-lens LP critique with claimsReviewed
 *   4. runLpMatchingV2()    — scores 18k firms, ranks LPs
 *   5. buildPipelineWorkbook() → XLSX
 *   6. fundDeckScoresToMarkdown() → markdownToDocxBuffer → DOCX
 * Returns the artifact paths.
 */
import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import { randomUUID } from "node:crypto"
import { describeFilters, parseFilters } from "@/lib/matching/filters"
import path from "node:path"
import { extractFundProfile, type ExtractedFundFields } from "@/lib/ai/fund-deck-extractor"
import { analyzeFundDeck, fundDeckScoresToMarkdown } from "@/lib/ai/fund-deck-analyzer"
import { runLpMatchingV2 } from "@/lib/matching/v2"
import { buildPipelineWorkbook, workbookToBuffer } from "@/lib/matching/v2/xlsx-builder"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Body (all optional):
 *   enableAi   run the matching engine's AI rationale pass (top 25 firms +
 *              top 25 contacts). Default false, as before.
 *   persist    save the match session AND promote the top LPs into the CRM.
 *              Default false, so the documented artifact-only behaviour is
 *              unchanged for anyone already calling this.
 *   top        how many LPs to promote when persisting (default 50, max 200 —
 *              saveToCrm caps at MAX_SAVE regardless).
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Dev-only route." }, { status: 403 })
  }

  const body = await req.json().catch(() => ({} as any))
  const enableAi = body?.enableAi === true
  const persist = body?.persist === true
  const top = Math.max(1, Math.min(200, Number(body?.top ?? 50)))
  const filters = parseFilters(body?.filters)

  const log: string[] = []
  const t0 = Date.now()
  function step(msg: string) { log.push(`[t+${Math.round((Date.now() - t0) / 1000)}s] ${msg}`) }

  try {
    step("reading uploads")
    const deck = await fs.readFile("/tmp/wc-deck.pdf")
    const thesis = await fs.readFile("/tmp/wc-thesis.pdf").catch(() => null)
    const trackXlsx = await fs.readFile("/tmp/wc-track.xlsx").catch(() => null)

    step("OCR the deck via Qwen-VL-OCR once, reuse the text for both extract + analyze")
    const { ocrPdfBuffer } = await import("@/lib/ai/pdf-ocr")
    const ocrDeck = await ocrPdfBuffer(deck, { tag: "wc-pipeline-deck", maxPages: 15 })
    step(`deck OCR: ${ocrDeck.pagesSucceeded}/${ocrDeck.pageCount} pages OK, ${ocrDeck.totalChars} chars`)
    let ocrThesis = { pagesSucceeded: 0, pageCount: 0, totalChars: 0, text: "" } as Awaited<ReturnType<typeof ocrPdfBuffer>>
    if (thesis) {
      ocrThesis = await ocrPdfBuffer(thesis, { tag: "wc-pipeline-thesis", maxPages: 15 })
      step(`thesis OCR: ${ocrThesis.pagesSucceeded}/${ocrThesis.pageCount} pages OK, ${ocrThesis.totalChars} chars`)
    }

    step(`Extract fund profile from pre-OCR'd text (deck + thesis)`)
    const pitchDeck = {
      name: "WC Investor Deck March '26.pdf",
      contentType: "application/pdf",
      base64: deck.toString("base64"),
      text: ocrDeck.text,
    }
    const dataRoom: any[] = []
    if (thesis) dataRoom.push({ name: "Winner Capital Consumer AI Thesis March 2026.pdf", contentType: "application/pdf", base64: thesis.toString("base64"), text: ocrThesis.text })
    if (trackXlsx) dataRoom.push({ name: "Track Record.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: trackXlsx.toString("base64") })
    const extracted: ExtractedFundFields = await extractFundProfile(pitchDeck, dataRoom, {})
    step(`Extracted: name=${extracted.name} target=${extracted.targetRaise} sectors=${(extracted.sectors ?? []).join(",")}`)

    step("Run LP analyst review via the unified pdf-vision dispatcher (handles Qwen + OCR)")
    // analyzeFundDeck's local path only has Anthropic + Ollama branches; for Qwen
    // we drive analyzePdfDocuments directly with the same 6-lens prompt the
    // analyzer would use, then normalise via parseScoreResponse.
    const { analyzePdfDocuments } = await import("@/lib/ai/pdf-vision")
    const { extractJsonObject } = await import("@/lib/ai/json-extract")
    const sixLensPrompt = `You are a senior LP analyst at a fund-of-funds reviewing a venture-capital fund's pitch deck. Apply the EMERGING-MANAGER lens (Fund I-IV).

Score the deck on a strict 0-10 scale across these 6 dimensions: gp_background, sector_focus, market_analysis, thesis_vs_trends, unit_economics_check, claims_verification.

Return STRICT JSON only (no markdown fences, no preamble):
{
  "scores": { "gp_background": 0-10, "sector_focus": 0-10, "market_analysis": 0-10, "thesis_vs_trends": 0-10, "unit_economics_check": 0-10, "claims_verification": 0-10 },
  "comments": { "gp_background": "...", "sector_focus": "...", "market_analysis": "...", "thesis_vs_trends": "...", "unit_economics_check": "...", "claims_verification": "..." },
  "overall": <weighted 0-100>,
  "grade": "A|B|C|D|F",
  "missing": ["..."],
  "strengths": ["...", "..."],
  "redFlags": ["..."],
  "lpObjections": ["3-6 sharp first-call questions"],
  "claimsReviewed": [{"claim":"...","category":"track_record|market_size|team_credential|portfolio_outcome|thesis_evidence|other","verifiable":"public|private_audit|unverifiable","status":"plausible|suspicious|contradicted","comment":"..."}],
  "thesisAlignment": "1-2 sentences",
  "notes": "1-2 sentences"
}

CRITICAL: Source every claim and score from the deck text below. If a fact is not in the deck, return null and lower confidence. Do not infer the firm name from the filename.`
    const dispatch = await analyzePdfDocuments(
      [{ name: "WC Investor Deck March '26.pdf", contentType: "application/pdf", base64: deck.toString("base64"), text: ocrDeck.text }],
      sixLensPrompt,
      { maxTokens: 6000, tag: "wc-pipeline-analyzer" },
    )
    let scores: any = { overall: 0, grade: "F", scores: {}, comments: {}, strengths: [], redFlags: [], lpObjections: [], claimsReviewed: [], notes: dispatch.error || "no output" }
    if (dispatch.text) {
      const parsed = extractJsonObject(dispatch.text, "wc-pipeline-analyzer")
      if (parsed) scores = parsed
    }
    step(`Critique overall=${scores.overall} grade=${scores.grade} provider=${dispatch.provider}`)

    // Resolve the destination workspace up front when persisting: the fund needs a
    // real fund_profiles row before matching, because lp_match_sessions.fund_profile_id
    // is a uuid — a synthetic `wc-<timestamp>` id fails on save AFTER the expensive
    // work is done.
    let persistScope: { orgId: string; userId: string; workspace: string } | null = null
    let fundProfileId: string | null = null
    if (persist) {
      const { sql } = await import("@/lib/db")
      const owners = await sql`
        SELECT m.user_id, m.org_id, o.name
          FROM memberships m
          JOIN organizations o ON o.id = m.org_id AND o.archived_at IS NULL
         WHERE m.persona = 'vc' AND m.org_role IN ('workspace_owner','admin','member')
      `
      if (owners.length !== 1) {
        throw new Error(`Expected exactly one VC workspace to persist into, found ${owners.length}.`)
      }
      persistScope = { orgId: String(owners[0].org_id), userId: String(owners[0].user_id), workspace: String(owners[0].name) }

      const name = extracted.name ?? "Winner Capital"
      // Reuse an existing active profile of the same name in this workspace so a
      // re-run updates rather than accumulating near-duplicates.
      const [existing] = await sql`
        SELECT id FROM fund_profiles
         WHERE org_id = ${persistScope.orgId} AND is_active = true AND name = ${name}
         LIMIT 1
      `
      const sectorsJson = JSON.stringify(extracted.sectors ?? ["ai/ml", "consumer"])
      const geoJson = JSON.stringify(extracted.geographicFocus ?? ["us", "canada"])
      const keywordsJson = JSON.stringify(extracted.thesisKeywords ?? ["consumer ai", "seed"])
      const [profile] = await sql`
        INSERT INTO fund_profiles (
          id, name, fund_number, target_raise, average_ticket,
          sectors, primary_sectors, geographic_focus, headquarters_location,
          thesis_keywords, thesis_description, gp_name, management_fee, carry,
          user_id, org_id, is_active, created_at, updated_at
        ) VALUES (
          ${existing?.id ?? randomUUID()}::uuid, ${name}, ${extracted.fundNumber ?? 1},
          ${extracted.targetRaise ?? 5_000_000}, ${extracted.averageTicket ?? null},
          ${sectorsJson}::jsonb, ${JSON.stringify((extracted.sectors ?? []).slice(0, 3))}::jsonb,
          ${geoJson}::jsonb, ${extracted.headquartersLocation ?? null},
          ${keywordsJson}::jsonb, ${extracted.thesisStatement ?? null},
          ${(extracted.gpNames ?? []).join(", ") || null},
          ${extracted.managementFeePct ?? null}, ${extracted.carryPct ?? null},
          ${persistScope.userId}, ${persistScope.orgId}, true, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, target_raise = EXCLUDED.target_raise,
          average_ticket = EXCLUDED.average_ticket, sectors = EXCLUDED.sectors,
          primary_sectors = EXCLUDED.primary_sectors, geographic_focus = EXCLUDED.geographic_focus,
          headquarters_location = EXCLUDED.headquarters_location,
          thesis_keywords = EXCLUDED.thesis_keywords, updated_at = NOW()
        RETURNING id
      `
      fundProfileId = String(profile.id)
      step(`Fund profile ${existing ? "updated" : "created"} ${fundProfileId} in "${persistScope.workspace}"`)
    }

    step("Build FundProfileV2 from extraction for matching")
    const fund = {
      id: fundProfileId ?? `wc-${Date.now()}`,
      name: extracted.name ?? "Winner Capital",
      fundNumber: extracted.fundNumber ?? 1,
      targetRaise: extracted.targetRaise ?? 5_000_000,
      averageTicket: extracted.averageTicket ?? null,
      sectors: extracted.sectors ?? ["ai/ml", "consumer"],
      primarySectors: extracted.sectors?.slice(0, 3) ?? ["consumer", "ai/ml"],
      geographicFocus: extracted.geographicFocus ?? ["us", "north-america"],
      headquartersLocation: extracted.headquartersLocation ?? "North America",
      thesisKeywords: extracted.thesisKeywords ?? ["consumer AI", "vertical AI", "seed", "pre-seed"],
      managementFeePct: extracted.managementFeePct ?? null,
      carryPct: extracted.carryPct ?? null,
    } as any

    step(`Run LP matching v2 (enableAi=${enableAi}) — mandate: ${describeFilters(filters)}`)
    const result = await runLpMatchingV2(fund, {
      maxFirms: 250,
      maxContacts: 1500,
      enableAi,
      filters,
      onProgress: (e: any) => step(`  phase=${e.phase} ${e.message ?? ""}`),
    })
    step(`Matching done: ${result.firms?.length ?? 0} qualified firms, ${result.contacts?.length ?? 0} contacts`)

    // ── Persistence (opt-in) ────────────────────────────────────────────────
    // Without this the route only writes files, so a run never reaches /vc/crm.
    // Two writes, in order: the session (so the match is reproducible and
    // exportable), then the top LPs promoted into crm_entries — which is what
    // crm_split('vc') later turns into crm_deals.
    let persisted: Record<string, unknown> | null = null
    if (persist && persistScope) {
      const { sql } = await import("@/lib/db")
      const { saveSessionV2 } = await import("@/lib/matching/v2")
      const { saveToCrm } = await import("@/lib/crm/save-entities")

      const scope = { orgId: persistScope.orgId, userId: persistScope.userId }
      step(`Persisting into VC workspace "${persistScope.workspace}"`)

      await saveSessionV2(result, scope.userId)
      step(`Saved match session ${result.sessionId}`)

      // Contacts first — a person is the useful CRM row; firms fill the rest of
      // the budget. saveToCrm caps at MAX_SAVE and dedupes on import_key.
      // NB: the scored shapes key their identity as `investorId` / `firmId`, not
      // `id` (lib/matching/v2/types.ts). Reading `.id` yields undefined, which
      // stringifies to "undefined", passes saveToCrm's id regex, and then resolves
      // to nothing — every row comes back as `missing` with no error raised.
      const items = [
        ...(result.contacts ?? []).slice(0, top).map((c: any) => ({
          kind: "contact" as const, id: String(c.investorId), displayName: c.name ?? null,
          title: c.title ?? null, email: c.email ?? null, linkedin: c.linkedin ?? null,
          location: c.location ?? null, type: c.type ?? null,
          score: c.score ?? null, tier: c.tier ?? null, why: c.whyThisLp ?? null,
        })),
        ...(result.firms ?? []).slice(0, Math.max(0, top - (result.contacts?.length ?? 0))).map((f: any) => ({
          kind: "firm" as const, id: String(f.firmId), displayName: f.name ?? null,
          location: f.location ?? null, type: f.type ?? null,
          score: f.score ?? null, tier: f.tier ?? null, why: f.whyThisLp ?? null,
        })),
      ]
      const saved = await saveToCrm(scope, items, "lp_matching", result.sessionId)
      step(`CRM: inserted=${saved.inserted} alreadyPresent=${saved.alreadyPresent} missing=${saved.missing}`)

      // Turn the new crm_entries into crm_deals for /vc/crm (doc 25 phase 5).
      const [split] = await sql`SELECT * FROM crm_split('vc')`
      step(`crm_split('vc'): +${split?.deals_added ?? 0} deals, +${split?.people_added ?? 0} people, +${split?.companies_added ?? 0} companies`)
      persisted = { sessionId: result.sessionId, fundProfileId, workspace: persistScope.workspace, ...saved, split }
    }

    step("Build LP pipeline XLSX")
    const wb = buildPipelineWorkbook(result, fund)
    const xlsxBuf = workbookToBuffer(wb)

    step("Build LP analyst review DOCX (Word)")
    const md = fundDeckScoresToMarkdown(scores, { fundName: fund.name, filename: "WC Investor Deck March '26.pdf" })
    const chartRows = Object.keys((scores as any).scores ?? {}).map((k) => ({
      label: ({ gp_background: "GP background", sector_focus: "Sector focus", market_analysis: "Market analysis", thesis_vs_trends: "Thesis vs. 2025-26 trends", unit_economics_check: "Fund unit economics", claims_verification: "Claims verification" } as Record<string,string>)[k] ?? k,
      score: Number((scores as any).scores?.[k] ?? 0),
      max: 10,
      comment: String((scores as any).comments?.[k] ?? ""),
    }))
    const docxBuf = await markdownToDocxBuffer(md, `${fund.name} — LP Analyst Deck Review`, { scoreChart: { title: "LP analyst scorecard", rows: chartRows } })

    // Save to a workspace-visible dir the user can pick up
    const outDir = "/tmp/wc-outputs"
    await fs.mkdir(outDir, { recursive: true })
    const xlsxPath = path.join(outDir, "Winner_Capital_LP_Pipeline.xlsx")
    const docxPath = path.join(outDir, "Winner_Capital_LP_Analyst_Review.docx")
    await fs.writeFile(xlsxPath, xlsxBuf)
    await fs.writeFile(docxPath, docxBuf)
    step(`wrote ${xlsxPath} (${xlsxBuf.length} bytes), ${docxPath} (${docxBuf.length} bytes)`)

    return NextResponse.json({
      ok: true,
      extracted: {
        name: extracted.name,
        fundNumber: extracted.fundNumber,
        targetRaise: extracted.targetRaise,
        averageTicket: extracted.averageTicket,
        sectors: extracted.sectors,
        gpNames: extracted.gpNames,
        headquartersLocation: extracted.headquartersLocation,
        thesisStatement: extracted.thesisStatement,
        managementFeePct: extracted.managementFeePct,
        carryPct: extracted.carryPct,
        confidence: extracted.confidence,
        notes: extracted.notes,
      },
      critique: {
        overall: scores.overall,
        grade: scores.grade,
        scores: (scores as any).scores,
        strengths: scores.strengths,
        redFlags: scores.redFlags,
        lpObjections: (scores as any).lpObjections,
        claimsReviewed: (scores as any).claimsReviewed,
      },
      matching: {
        qualifiedFirms: result.firms?.length ?? 0,
        qualifiedContacts: result.contacts?.length ?? 0,
        topFirms: (result.firms ?? []).slice(0, 8).map((f: any) => ({ name: f.name, score: f.score, tier: f.tier, location: f.location })),
      },
      artifacts: { xlsx: xlsxPath, docx: docxPath },
      persisted,
      log,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "pipeline failed", stack: e?.stack?.split("\n").slice(0, 8), log }, { status: 500 })
  }
}
