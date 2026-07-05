/**
 * GET  /api/portfolio/reports?fundId=svs-fund-ii&limit=40
 *   List quarterly reports.
 *
 * POST /api/portfolio/reports
 *   Generate (or regenerate) the report for a quarter.
 *   Body: { fundId?, quarterEnd: "YYYY-MM-DD" }
 *
 * Generation can take 30-90s on the deep tier — maxDuration bumped to 240s
 * to match the newsroom draft endpoint.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  buildQuarterContext,
  generateLetterMarkdown,
  upsertReport,
  listReports,
  quarterEndFrom,
} from "@/lib/portfolio/lp-quarterly-report"

export const runtime = "nodejs"
export const maxDuration = 240

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const url = new URL(req.url)
  const fundId = url.searchParams.get("fundId") ?? "svs-fund-ii"
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 40)
  const rows = await listReports(fundId, limit)
  return NextResponse.json({ rows, total: rows.length })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  try {
    const body = await req.json()
    const fundId = body.fundId ?? "svs-fund-ii"
    if (!body.quarterEnd) {
      return NextResponse.json({ error: "quarterEnd required (YYYY-MM-DD)" }, { status: 400 })
    }
    const quarterEnd = quarterEndFrom(String(body.quarterEnd))

    const ctx = await buildQuarterContext(fundId, quarterEnd)
    if (ctx.companies.length === 0) {
      return NextResponse.json({
        error: "No portfolio companies on this fund yet. Add some before generating the LP letter.",
      }, { status: 400 })
    }

    const letter = await generateLetterMarkdown(ctx)

    // Freeze a compact snapshot of what we read — not the full KPI history,
    // just enough to reproduce the letter's facts.
    const snapshot = {
      rollup: ctx.rollup,
      highlights: ctx.highlights,
      watchlist: ctx.watchlist,
      companies: ctx.companies.map(({ company, latestKpi, prevQuarterKpi }) => ({
        id: company.id,
        name: company.name,
        sector: company.sector,
        stage: company.stage,
        status: company.status,
        ownership_pct: company.ownership_pct,
        last_round_name: company.last_round_name,
        last_round_valuation: company.last_round_valuation,
        last_round_at: company.last_round_at,
        latest_kpi: latestKpi,
        prev_quarter_kpi: prevQuarterKpi,
      })),
    }

    const report = await upsertReport({
      fundId,
      quarterEnd,
      contentMd: letter.contentMd,
      summary: letter.summary,
      kpisSnapshot: snapshot,
      generatedBy: admin.id,
      generatorModel: letter.model,
      generationMs: letter.generationMs,
    })
    return NextResponse.json({ report }, { status: 201 })
  } catch (e: any) {
    console.error("[portfolio/reports POST]", e)
    return NextResponse.json({ error: e?.message ?? "Generation failed" }, { status: 500 })
  }
}

function clampInt(s: string | null | undefined, min: number, max: number, fallback: number) {
  const n = Number(s)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}
