/**
 * POST /api/founder/matching/runs/[runId]/actions
 *   { action: "save" | "exclude" | "include", keys: ("firm:<id>" | "contact:<id>")[] (≤ 200) }
 *
 * save    → adds the investors to this workspace's CRM (never twice)
 * exclude → never suggest them again in this workspace
 * include → undo an exclusion
 * Workspace members with write access only.
 */
import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure, MatchingError } from "@/lib/matching/access"
import { allResults, setExclusion } from "@/lib/matching/v2/founder-runs"
import { saveToCrm, MAX_SAVE, type CrmItem } from "@/lib/crm/save-entities"
import { requireWorkspace } from "@/lib/auth/workspace-context"

export const runtime = "nodejs"
const KEY = /^(firm|contact):[\w-]{1,200}$/

export async function POST(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  try {
    const context = await matchingContext("founder")
    const scope = await requireWorkspace(true)
    if (!scope.canWrite) throw new MatchingError("Your role in this workspace is read-only.", 403)
    const { runId } = await ctx.params
    const body = await req.json()
    const keys: string[] = Array.isArray(body?.keys) ? body.keys.filter((k: unknown) => typeof k === "string" && KEY.test(k)) : []
    if (!keys.length || keys.length > MAX_SAVE) throw new MatchingError(`Send between 1 and ${MAX_SAVE} investors.`, 400)

    if (body.action === "exclude" || body.action === "include") {
      for (const k of keys) await setExclusion(context, k, body.action === "exclude", typeof body.reason === "string" ? body.reason.slice(0, 200) : null)
      return NextResponse.json({ ok: true, action: body.action, count: keys.length })
    }
    if (body.action !== "save") throw new MatchingError("Unknown action.", 400)

    // Display fields come from the run, so the CRM entry carries the score and reason the founder saw.
    const data = await allResults(runId, context)
    if (!data) throw new MatchingError("Run not found or expired. Re-run matching.", 404)
    const byKey = new Map<string, CrmItem>()
    const put = (kind: "firm" | "contact", e: any, firm?: any) => e && byKey.set(`${kind}:${e.id}`, {
      kind, id: String(e.id), displayName: e.name, title: e.title, email: e.email, linkedin: e.linkedin, location: e.location,
      type: e.type, score: firm?.score ?? e.score, tier: firm?.tier ?? e.tier, why: firm?.whyMatch ?? e.whyMatch,
    })
    for (const g of data.groups) { put("firm", g.firm); put("contact", g.primary, g.firm); for (const a of g.alternates) put("contact", a, g.firm) }
    for (const p of data.independents) put("contact", p)
    const items = keys.map((k) => byKey.get(k)).filter(Boolean) as CrmItem[]
    const result = await saveToCrm(context, items, "founder_matching", runId)
    return NextResponse.json({ ok: true, action: "save", ...result, notInRun: keys.length - items.length })
  } catch (e) { return matchingFailure(e, "The action could not be saved. Please retry.") }
}
