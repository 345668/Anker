/**
 * Owner-only view of the LP scoring factors (docs/architecture/63 M6).
 *
 * GET  [?fundProfileId=&report=1] -> each factor's status and weight; with report=1, the evaluation of them on the signed-in owner's own workspace.
 * POST { action: "labels", text, fundProfileId? }      -> save the owner's labelled LPs ("name, fit|not fit" per line) for the workspace's newest run.
 *      { action: "clear_labels", fundProfileId? }      -> remove them.
 *      { action: "decide", key, status, weight?, note?, override? } -> promote, return to shadow or retire a factor.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { resolveActiveMembership } from "@/lib/org/active"
import { logAudit } from "@/lib/audit/audit-log"
import { decideFactor, evaluateWorkspace, factorList, FactorError } from "@/lib/matching/lp/factors-admin"
import { clearLabels, importLabels } from "@/lib/matching/lp/labels"
import { GUARDS_LP } from "@/lib/matching/lp/evaluate"
import { latestSession } from "@/lib/matching/lp/matches"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function workspace(userId: string) {
  const { active } = await resolveActiveMembership(userId)
  return active && active.persona === "vc" ? active.orgId : null
}

export async function GET(req: NextRequest) {
  const g = await requireAdmin(); if (g instanceof NextResponse) return g
  const u = req.nextUrl.searchParams, fundProfileId = u.get("fundProfileId") || null
  const factors = await factorList()
  const orgId = g.id === "portal-service" ? null : await workspace(g.id)
  if (!orgId) return NextResponse.json({ factors, guards: GUARDS_LP, workspace: null, note: "Switch to your fund workspace to evaluate the factors on its labelled LPs." })
  const funds = (await sql`SELECT id, name FROM fund_profiles WHERE org_id = ${orgId} AND is_active = true ORDER BY updated_at DESC NULLS LAST`) as any[]
  const labels = (await sql`SELECT (SELECT count(*)::int FROM lp_eval_labels WHERE org_id = ${orgId} AND source = 'founder_set') AS founder_set, (SELECT count(DISTINCT entity_key)::int FROM lp_match_feedback WHERE org_id = ${orgId} AND verdict IN ('fit', 'not_a_fit')) AS feedback`) as any[]
  const s = await latestSession(orgId, fundProfileId)
  return NextResponse.json({
    factors, guards: GUARDS_LP,
    workspace: { orgId, funds: funds.map((f) => ({ id: String(f.id), name: f.name })), labels: labels[0], latestRun: s ? { id: String(s.id), fundName: s.fund_name, createdAt: s.created_at } : null },
    ...(u.get("report") === "1" ? { evaluation: await evaluateWorkspace(orgId, fundProfileId) } : {}),
  })
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin(); if (g instanceof NextResponse) return g
  if (g.id === "portal-service") return NextResponse.json({ error: "Sign in as the owner to label LPs or decide on a factor." }, { status: 403 })
  const orgId = await workspace(g.id)
  if (!orgId) return NextResponse.json({ error: "Switch to your fund workspace first." }, { status: 409 })
  const b = await req.json().catch(() => ({} as any)), fundProfileId = b.fundProfileId ? String(b.fundProfileId) : null
  try {
    if (b.action === "labels") {
      const s = await latestSession(orgId, fundProfileId)
      if (!s) return NextResponse.json({ error: "Run the matching first: names are looked up in the newest run." }, { status: 409 })
      const r = await importLabels({ orgId, userId: g.id }, String(s.id), fundProfileId ?? String(s.fund_profile_id), String(b.text ?? "").slice(0, 200_000))
      await logAudit({ actorId: g.id, actorEmail: g.email ?? null, action: "lp_scoring.labels_saved", targetType: "workspace", targetId: orgId, metadata: { saved: r.saved, unresolved: r.unresolved.length } })
      return NextResponse.json({ ok: true, ...r })
    }
    if (b.action === "clear_labels") return NextResponse.json({ ok: true, removed: await clearLabels(orgId, fundProfileId) })
    if (b.action === "decide") {
      const r = await decideFactor(orgId, fundProfileId, { key: String(b.key), status: b.status, weight: b.weight, note: b.note, override: !!b.override }, g.email ?? g.id)
      await logAudit({ actorId: g.id, actorEmail: g.email ?? null, action: `lp_scoring.${b.status}`, targetType: "lp_scoring_factor", targetId: String(b.key), metadata: { weight: r.weight, overridden: r.overridden, note: String(b.note ?? "").slice(0, 200) } })
      return NextResponse.json({ ok: true, ...r })
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    if (e instanceof FactorError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
