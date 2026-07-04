/**
 * PATCH /api/portfolio/funds/[id]/management/studio/[projectId]
 *   Body: { stage } for a transition, { spentAmount } for spend update,
 *   or { spinout: { checkAmount, studioCommonPct, investedAt? } } for the
 *   studio close action (creates company + fund check + studio common
 *   in the investments spine). Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getProjectById, transitionProject, updateProjectSpend, spinoutProject,
  StudioError, STUDIO_STAGES, type StudioStage,
} from "@/lib/portfolio/management-company"
import { hasInvestmentsTables } from "@/lib/portfolio/investments"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : await getFundBySlug(trimmed)
  return fund?.id ?? null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; projectId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id, projectId } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const project = await getProjectById(projectId)
  if (!project || project.fund_id !== fundId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }
  try {
    const body = await req.json()

    if (body.spinout) {
      if (!(await hasInvestmentsTables())) {
        return NextResponse.json(
          { error: "investments tables missing — run scripts/oneshot/run-investments-tables.mjs first." },
          { status: 503 },
        )
      }
      const updated = await spinoutProject({
        projectId,
        checkAmount: Number(body.spinout.checkAmount),
        studioCommonPct: Number(body.spinout.studioCommonPct) || 0,
        investedAt: body.spinout.investedAt ?? null,
        by: admin.email ?? admin.id ?? null,
      })
      return NextResponse.json(updated)
    }

    if (body.spentAmount !== undefined) {
      const updated = await updateProjectSpend(projectId, Number(body.spentAmount) || 0)
      return NextResponse.json(updated)
    }

    if (body.stage !== undefined) {
      if (!STUDIO_STAGES.includes(body.stage)) {
        return NextResponse.json({ error: `Unknown stage: ${body.stage}` }, { status: 400 })
      }
      const updated = await transitionProject(projectId, body.stage as StudioStage, admin.email ?? admin.id ?? null)
      return NextResponse.json(updated)
    }

    return NextResponse.json({ error: "Nothing to do — pass stage, spentAmount, or spinout." }, { status: 400 })
  } catch (e: any) {
    if (e instanceof StudioError) {
      const status = e.code === "invalid_transition" || e.code === "use_spinout" ? 409
        : e.code === "missing_check" ? 422 : 400
      return NextResponse.json({ error: e.message, code: e.code }, { status })
    }
    console.error("[studio PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}
