/**
 * GET    /api/portfolio/reports/[id]
 * PATCH  /api/portfolio/reports/[id]   — edit content_md, summary, status, reviewedBy
 * DELETE /api/portfolio/reports/[id]
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePortfolioAccess } from "@/lib/auth/portfolio-access"
import {
  getReportById, updateReport, deleteReport,
} from "@/lib/portfolio/lp-quarterly-report"

export const runtime = "nodejs"

const VALID_STATUS = new Set(["draft", "reviewed", "sent", "archived"])

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const report = await getReportById(id, guard.fund.id)
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ report })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const patch: any = {}
    if ("contentMd" in body) patch.contentMd = body.contentMd ?? null
    if ("summary" in body) patch.summary = body.summary ?? null
    if (typeof body.status === "string" && VALID_STATUS.has(body.status)) {
      patch.status = body.status
      // Reviewer identity comes from the authenticated session.
      if (body.status === "reviewed") {
        patch.reviewedBy = admin.email ?? admin.id
      }
    }
    const report = await updateReport(id, patch, guard.fund.id)
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ report })
  } catch (e: any) {
    console.error("[portfolio/reports PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  try {
    const ok = await deleteReport(id, guard.fund.id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[portfolio/reports DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}
