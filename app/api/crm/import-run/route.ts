/**
 * POST /api/crm/import-run { runId, keys?: string[], top?: number }
 *
 * Import investors from a founder matching run straight into the CRM — no
 * workbook round trip (docs/architecture/10 D7). With `keys`, exactly those;
 * otherwise the primary contacts of the top `top` firm groups (default 50,
 * at most 200).
 */
import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure, MatchingError } from "@/lib/matching/access"
import { requireWorkspace } from "@/lib/auth/workspace-context"
import { allResults } from "@/lib/matching/v2/founder-runs"
import { saveToCrm, MAX_SAVE, type CrmItem } from "@/lib/crm/save-entities"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("founder")
    const scope = await requireWorkspace(true)
    if (!scope.canWrite) throw new MatchingError("Your role in this workspace is read-only.", 403)
    const body = await req.json()
    if (typeof body?.runId !== "string") throw new MatchingError("Choose a run to import from.", 400)
    const data = await allResults(body.runId, context)
    if (!data) throw new MatchingError("Run not found or expired. Re-run matching.", 404)

    const toItem = (kind: "firm" | "contact", e: any, firm?: any): CrmItem => ({
      kind, id: String(e.id), displayName: e.name, title: e.title, email: e.email, linkedin: e.linkedin, location: e.location,
      type: e.type, score: firm?.score ?? e.score, tier: firm?.tier ?? e.tier, why: firm?.whyMatch ?? e.whyMatch,
    })
    let items: CrmItem[]
    if (Array.isArray(body.keys)) {
      const wanted = new Set(body.keys.filter((k: unknown) => typeof k === "string").slice(0, MAX_SAVE))
      const all: CrmItem[] = []
      for (const g of data.groups) {
        all.push(toItem("firm", g.firm))
        if (g.primary) all.push(toItem("contact", g.primary, g.firm))
        for (const a of g.alternates) all.push(toItem("contact", a, g.firm))
      }
      for (const p of data.independents) all.push(toItem("contact", p))
      items = all.filter((i) => wanted.has(`${i.kind}:${i.id}`))
    } else {
      const top = Math.max(1, Math.min(MAX_SAVE, Number(body.top) || 50))
      items = data.groups.slice(0, top).map((g) => g.primary ? toItem("contact", g.primary, g.firm) : toItem("firm", g.firm))
    }
    const result = await saveToCrm(context, items, "founder_matching", body.runId)
    return NextResponse.json({ ok: true, requested: items.length, ...result })
  } catch (e) { return matchingFailure(e, "Import could not finish. Please retry.") }
}
