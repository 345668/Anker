/**
 * Single export endpoint for all native tools. Each tool ships a
 * `buildExportWorkbook(state)` function; this route dispatches by slug.
 *
 * POST /api/tools/<slug>/export    — body = the tool's input state
 * Returns a downloadable .xlsx.
 */
import { NextRequest, NextResponse } from "next/server"
import { workbookToBuffer, xlsxResponseHeaders } from "@/lib/tools/xlsx-export"
import * as UnitEconomics from "@/lib/tools/unit-economics"
import * as QSBS from "@/lib/tools/qsbs"
import * as SaasForecast from "@/lib/tools/saas-forecast"
import * as VentureValuation from "@/lib/tools/venture-valuation"
import * as VcPerformance from "@/lib/tools/vc-performance"
import * as OpExProForma from "@/lib/tools/opex-proforma"
import * as ExitWaterfall from "@/lib/tools/exit-waterfall"
import * as VcFundModel from "@/lib/tools/vc-fund-model"

export const runtime = "nodejs"

const TOOLS: Record<
  string,
  { build: (state: any) => any; filename: string }
> = {
  "unit-economics": {
    build: UnitEconomics.buildExportWorkbook,
    filename: "Anker — Unit Economics.xlsx",
  },
  "qsbs-eligibility": {
    build: QSBS.buildExportWorkbook,
    filename: "Anker — QSBS Eligibility.xlsx",
  },
  "saas-forecast": {
    build: SaasForecast.buildExportWorkbook,
    filename: "Anker — SaaS Forecast.xlsx",
  },
  "venture-valuation": {
    build: VentureValuation.buildExportWorkbook,
    filename: "Anker — Venture Valuation.xlsx",
  },
  "vc-performance": {
    build: (state: any) => VcPerformance.buildExportWorkbook(state.investments ?? []),
    filename: "Anker — VC Performance.xlsx",
  },
  "opex-proforma": {
    build: OpExProForma.buildExportWorkbook,
    filename: "Anker — OpEx Pro-Forma.xlsx",
  },
  "exit-waterfall": {
    build: ExitWaterfall.buildExportWorkbook,
    filename: "Anker — Exit Waterfall.xlsx",
  },
  "vc-fund-model": {
    build: VcFundModel.buildExportWorkbook,
    filename: "Anker — VC Fund Model.xlsx",
  },
}

interface RouteCtx {
  params: Promise<{ slug: string }>
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { slug } = await ctx.params
  const tool = TOOLS[slug]
  if (!tool) {
    return NextResponse.json({ error: `Unknown tool: ${slug}` }, { status: 404 })
  }
  const state = await req.json().catch(() => ({}))
  try {
    const wb = tool.build(state)
    const buf = workbookToBuffer(wb)
    return new NextResponse(buf, { headers: xlsxResponseHeaders(tool.filename) })
  } catch (e: any) {
    console.error(`[tools/${slug}/export] Error:`, e)
    return NextResponse.json({ error: e?.message ?? "Export failed" }, { status: 500 })
  }
}
