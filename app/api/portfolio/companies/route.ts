/**
 * GET  /api/portfolio/companies
 *   List portfolio companies + summary rollup.
 *   Query: fundId, status, sector, q, limit, offset
 *
 * POST /api/portfolio/companies
 *   Create a new portfolio company.
 *   Body: { name, slug?, sector?, stage?, status?, ... }
 *
 * Auth: active fund workspace owner/admin; no staff override.
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePortfolioAccess } from "@/lib/auth/portfolio-access"
import {
  listCompanies, createCompany, getPortfolioRollup,
  COMPANY_STATUSES, type CompanyStatus,
} from "@/lib/portfolio/queries"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  try {
    const url = new URL(req.url)
    const fundId = guard.fund.id
    const status = parseStatus(url.searchParams.get("status"))
    const sector = url.searchParams.get("sector") ?? "all"
    const q = url.searchParams.get("q") ?? undefined
    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 100)
    const offset = clampInt(url.searchParams.get("offset"), 0, 100_000, 0)
    const [list, rollup] = await Promise.all([
      listCompanies({ fundId, status, sector: sector === "" ? "all" : sector, query: q, limit, offset }),
      getPortfolioRollup(fundId),
    ])
    return NextResponse.json({ ...list, rollup })
  } catch (e: any) {
    console.error("[portfolio/companies GET]", e)
    return NextResponse.json({ error: e?.message ?? "List failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  const admin = guard
  try {
    const body = await req.json()
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 })
    }
    const company = await createCompany({
      fundId: guard.fund.id,
      name: String(body.name),
      slug: typeof body.slug === "string" ? body.slug : null,
      website: body.website ?? null,
      linkedinUrl: body.linkedinUrl ?? null,
      oneLiner: body.oneLiner ?? null,
      description: body.description ?? null,
      sector: body.sector ?? null,
      subSector: body.subSector ?? null,
      geography: body.geography ?? null,
      stage: body.stage ?? null,
      foundedYear: typeof body.foundedYear === "number" ? body.foundedYear : null,
      firstCheckAt: body.firstCheckAt ?? null,
      firstCheckAmount: numOrNull(body.firstCheckAmount),
      totalInvestedAmount: numOrNull(body.totalInvestedAmount),
      ownershipPct: numOrNull(body.ownershipPct),
      lastRoundAt: body.lastRoundAt ?? null,
      lastRoundName: body.lastRoundName ?? null,
      lastRoundValuation: numOrNull(body.lastRoundValuation),
      status: parseStatus(body.status) === "all" ? "active" : (parseStatus(body.status) as CompanyStatus),
      ownerUserId: body.ownerUserId ?? admin.id,
      metadata: body.metadata ?? {},
    })
    return NextResponse.json({ company }, { status: 201 })
  } catch (e: any) {
    console.error("[portfolio/companies POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}

function parseStatus(s: string | null | undefined): CompanyStatus | "all" {
  const v = (s ?? "").toLowerCase()
  if (v && (COMPANY_STATUSES as readonly string[]).includes(v)) return v as CompanyStatus
  return "all"
}
function clampInt(s: string | null | undefined, min: number, max: number, fallback: number) {
  if (s == null || s === "") return fallback
  const n = Number(s)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}
function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
