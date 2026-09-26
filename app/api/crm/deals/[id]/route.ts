/**
 * PATCH /api/crm/deals/[id] — partial update of one deal.
 *
 * The write side of the entity CRM (docs/architecture/25-per-persona-crm.md
 * phase 3). Accepts stage, notes, owner, tier, tags, boardId. Stage is validated
 * against the workspace persona's definition, so a value from another persona's
 * pipeline is refused with a message naming what is allowed.
 *
 * An omitted field is left alone; a field sent as null is cleared. Both a stage
 * change activity and the learned-ranker outcome event are written by patchDeal.
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { workspaceError } from "@/lib/auth/workspace-context"
import { isEnginePersona } from "@/lib/crm/definitions"
import { listActivities, patchDeal } from "@/lib/crm/deals"

export const runtime = "nodejs"

const Body = z.object({
  stage: z.string().min(1).max(64).optional(),
  notes: z.string().max(20000).nullable().optional(),
  owner: z.string().max(200).nullable().optional(),
  tier: z.string().max(8).nullable().optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  boardId: z.string().max(200).nullable().optional(),
}).strict()

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scope = await requireCrmWorkspace(true)
    // Refuse rather than guess: a persona whose CRM is not yet on the engine has
    // no definition to validate a stage against, so there is nothing safe to do.
    if (!isEnginePersona(scope.persona)) {
      return NextResponse.json({ error: "This workspace's CRM is not on the entity model yet." }, { status: 409 })
    }
    const { id } = await ctx.params
    const patch = Body.parse(await req.json())
    await patchDeal(`org:${scope.orgId}`, scope.persona, scope.userId, id, patch)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "That change is not a valid field for a record." }, { status: 400 })
    }
    return workspaceError(error)
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scope = await requireCrmWorkspace()
    const { id } = await ctx.params
    const activities = await listActivities(`org:${scope.orgId}`, id)
    return NextResponse.json({ activities }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return workspaceError(error) }
}
