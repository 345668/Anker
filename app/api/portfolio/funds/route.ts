/**
 * GET  /api/portfolio/funds         — list every fund (ordered by status + vintage)
 * POST /api/portfolio/funds         — create a new fund
 *   Body: { name, slug?, vintageYear?, targetSize?, currency?, ... }
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  listFunds, createFund,
  FUND_STATUSES, type FundStatus,
} from "@/lib/portfolio/funds"

export const runtime = "nodejs"

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const rows = await listFunds()
  return NextResponse.json({ rows, total: rows.length })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 })
    }
    const fund = await createFund({
      name: String(body.name),
      slug: typeof body.slug === "string" ? body.slug : null,
      description: body.description ?? null,
      vintageYear: typeof body.vintageYear === "number" ? body.vintageYear : null,
      targetSize: numOrNull(body.targetSize),
      currency: body.currency ?? "USD",
      managementFeePct: numOrNull(body.managementFeePct),
      carryPct: numOrNull(body.carryPct),
      termYears: typeof body.termYears === "number" ? body.termYears : null,
      investmentPeriodYears: typeof body.investmentPeriodYears === "number" ? body.investmentPeriodYears : null,
      status: parseStatus(body.status),
      managerOrg: body.managerOrg ?? null,
      metadata: body.metadata ?? {},
    })
    return NextResponse.json({ fund }, { status: 201 })
  } catch (e: any) {
    console.error("[funds POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}

function parseStatus(s: any): FundStatus {
  if (typeof s === "string" && (FUND_STATUSES as readonly string[]).includes(s)) {
    return s as FundStatus
  }
  return "active"
}
function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
