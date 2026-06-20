/**
 * GET    /api/portfolio/companies/[id]   — fetch one company + latest KPI
 * PATCH  /api/portfolio/companies/[id]   — partial update
 * DELETE /api/portfolio/companies/[id]   — hard delete (cascades to KPIs)
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getCompanyById, updateCompany, deleteCompany, getLatestKpi,
  COMPANY_STATUSES, type CompanyStatus,
} from "@/lib/portfolio/queries"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const [company, latestKpi] = await Promise.all([
    getCompanyById(id),
    getLatestKpi(id),
  ])
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ company, latestKpi })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const patch: any = {}
    if (typeof body.name === "string") patch.name = body.name
    if ("slug" in body && typeof body.slug !== "undefined") {
      patch.slug = body.slug === null ? null : String(body.slug)
    }
    if ("website" in body) patch.website = body.website ?? null
    if ("linkedinUrl" in body) patch.linkedinUrl = body.linkedinUrl ?? null
    if ("oneLiner" in body) patch.oneLiner = body.oneLiner ?? null
    if ("description" in body) patch.description = body.description ?? null
    if ("sector" in body) patch.sector = body.sector ?? null
    if ("subSector" in body) patch.subSector = body.subSector ?? null
    if ("geography" in body) patch.geography = body.geography ?? null
    if ("stage" in body) patch.stage = body.stage ?? null
    if ("foundedYear" in body) patch.foundedYear = typeof body.foundedYear === "number" ? body.foundedYear : null
    if ("firstCheckAt" in body) patch.firstCheckAt = body.firstCheckAt ?? null
    if ("firstCheckAmount" in body) patch.firstCheckAmount = numOrNull(body.firstCheckAmount)
    if ("totalInvestedAmount" in body) patch.totalInvestedAmount = numOrNull(body.totalInvestedAmount)
    if ("ownershipPct" in body) patch.ownershipPct = numOrNull(body.ownershipPct)
    if ("lastRoundAt" in body) patch.lastRoundAt = body.lastRoundAt ?? null
    if ("lastRoundName" in body) patch.lastRoundName = body.lastRoundName ?? null
    if ("lastRoundValuation" in body) patch.lastRoundValuation = numOrNull(body.lastRoundValuation)
    if (typeof body.status === "string"
        && (COMPANY_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as CompanyStatus
    }
    if ("ownerUserId" in body) patch.ownerUserId = body.ownerUserId ?? null
    if ("metadata" in body && body.metadata && typeof body.metadata === "object") {
      patch.metadata = body.metadata
    }
    const company = await updateCompany(id, patch)
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ company })
  } catch (e: any) {
    console.error("[portfolio/companies PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  try {
    const ok = await deleteCompany(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[portfolio/companies DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
