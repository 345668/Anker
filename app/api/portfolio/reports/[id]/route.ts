/**
 * GET    /api/portfolio/reports/[id]
 * PATCH  /api/portfolio/reports/[id]   — edit content_md, summary, status, reviewedBy
 * DELETE /api/portfolio/reports/[id]
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getReportById, updateReport, deleteReport,
} from "@/lib/portfolio/lp-quarterly-report"

export const runtime = "nodejs"

const VALID_STATUS = new Set(["draft", "reviewed", "sent", "archived"])

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const report = await getReportById(id)
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ report })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
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
      // Stamping reviewer is implicit: if you're flipping to 'reviewed'
      // and don't pass reviewedBy, we record the current admin.
      if (body.status === "reviewed" && !body.reviewedBy) {
        patch.reviewedBy = admin.email ?? admin.id
      }
    }
    if ("reviewedBy" in body) patch.reviewedBy = body.reviewedBy ?? null
    const report = await updateReport(id, patch)
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ report })
  } catch (e: any) {
    console.error("[portfolio/reports PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  try {
    const ok = await deleteReport(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[portfolio/reports DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}
