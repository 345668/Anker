/**
 * Fund-deck analysis → Word .docx download.
 *
 * Two modes:
 *
 * 1. POST application/json with body `{ result: FundDeckScores, fundName?, filename?, vehicle? }`
 *    — wraps the already-computed analysis as a docx (no re-analysis, no AI cost).
 *
 * 2. POST multipart with field `pitch_deck` (PDF) — runs analyzeFundDeck()
 *    and returns the docx in one shot.
 *
 * Returns a binary docx with the appropriate Content-Disposition.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  analyzeFundDeck,
  fundDeckScoresToMarkdown,
  type FundDeckScores,
} from "@/lib/ai/fund-deck-analyzer"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"

export const runtime = "nodejs"
export const maxDuration = 240

const MAX_BYTES = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") ?? ""

    let result: FundDeckScores | null = null
    let fundName: string | undefined
    let filename: string | undefined
    let vehicle: string | undefined

    if (ct.includes("application/json")) {
      const body = await req.json()
      if (!body?.result) {
        return NextResponse.json({ error: "Missing `result` body field." }, { status: 400 })
      }
      result = body.result as FundDeckScores
      fundName = body.fundName
      filename = body.filename
      vehicle = body.vehicle
    } else {
      // multipart — analyze fresh
      const form = await req.formData()
      const file = form.get("pitch_deck") as File | null
      if (!file) {
        return NextResponse.json({ error: "Upload a PDF as `pitch_deck`." }, { status: 400 })
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1e6}MB)` }, { status: 400 })
      }
      const ab = await file.arrayBuffer()
      const buf = Buffer.from(ab)
      const emergingFlag = (form.get("emerging_manager") as string | null) ?? null
      const emergingManager =
        emergingFlag === null || emergingFlag === "" ? undefined : emergingFlag === "true"

      const ctxName = form.get("fund_name") as string | null
      const ctxVehicle = form.get("vehicle") as string | null
      const ctxFundNumber = form.get("fund_number") as string | null
      const ctxTargetRaise = form.get("target_raise") as string | null
      const ctxSectors = form.get("sectors") as string | null
      const context: any = {}
      if (ctxName) context.name = ctxName
      if (ctxVehicle) context.vehicle = ctxVehicle
      if (ctxFundNumber && Number.isFinite(Number(ctxFundNumber)))
        context.fundNumber = Math.round(Number(ctxFundNumber))
      if (ctxTargetRaise && Number.isFinite(Number(ctxTargetRaise)))
        context.targetRaise = Math.round(Number(ctxTargetRaise))
      if (ctxSectors) context.sectors = ctxSectors.split(",").map((s) => s.trim()).filter(Boolean)

      result = await analyzeFundDeck({
        filename: file.name,
        pdfBase64: buf.toString("base64"),
        pdfBuffer: buf,
        emergingManager,
        context: Object.keys(context).length ? context : undefined,
      })
      fundName = ctxName ?? undefined
      vehicle = ctxVehicle ?? undefined
      filename = file.name
    }

    if (!result) {
      return NextResponse.json({ error: "No analysis available." }, { status: 400 })
    }

    // Chart of the 6 LP-analyst dimensions, matched to the markdown table.
    const FUND_DIM_LABELS: Record<string, string> = {
      gp_background: "GP background",
      sector_focus: "Sector focus",
      market_analysis: "Market analysis",
      thesis_vs_trends: "Thesis vs. 2025-26 trends",
      unit_economics_check: "Fund unit economics",
      claims_verification: "Claims verification",
    }
    const chartRows = Object.keys((result as any).scores ?? {}).map((k) => ({
      label: FUND_DIM_LABELS[k] ?? k,
      score: Number((result as any).scores?.[k] ?? 0),
      max: 10,
      comment: String((result as any).comments?.[k] ?? ""),
    }))
    const md = fundDeckScoresToMarkdown(result, { fundName, filename, vehicle })
    const docx = await markdownToDocxBuffer(
      md,
      fundName ? `${fundName} — LP Analyst Deck Review` : "LP Analyst Deck Review",
      { scoreChart: { title: "LP analyst scorecard", rows: chartRows } },
    )

    const safeName = (fundName ?? filename ?? "fund-deck-review")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .toLowerCase()
      .slice(0, 80)

    return new NextResponse(new Uint8Array(docx), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeName}-lp-review.docx"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e: any) {
    console.error("[fund-deck/docx] error:", e)
    return NextResponse.json({ error: e?.message ?? "Docx export failed" }, { status: 500 })
  }
}
