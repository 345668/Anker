import { NextRequest } from "next/server"
import { sql } from "@/lib/db"
import { CallError, callResponse, callScope, readCallBody } from "@/lib/calls/access"
import { getCall, deleteCall } from "@/lib/calls/records"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function GET(_req: NextRequest, ctx: Context) {
  return callResponse(async () => ({ call: await getCall(await callScope(), (await ctx.params).id) }))
}
export async function DELETE(_req: NextRequest, ctx: Context) {
  return callResponse(async () => {
    const scope = await callScope(true)
    const { id } = await ctx.params
    return deleteCall(scope, id)
  })
}
export async function PATCH(req: NextRequest, ctx: Context) {
  return callResponse(async () => {
    const scope = await callScope(true)
    const { id } = await ctx.params
    const body = await readCallBody(req)
    if (body.claimLegacy === true) {
      const rows = await sql`UPDATE investor_calls SET org_id = ${scope.orgId}, persona = ${scope.persona}, updated_at = now()
        WHERE id = ${id} AND user_id = ${scope.userId} AND org_id IS NULL AND deleted_at IS NULL RETURNING id`
      if (!rows.length) throw new CallError("Personal call unavailable or already assigned.", 409)
      return { ok: true }
    }
    await getCall(scope, id)
    if (body.reviewed === true) {
      if (typeof body.editedDraft !== "string" || body.editedDraft.length > 12000) throw new CallError("Review text must be at most 12,000 characters.")
      const rows = await sql`UPDATE investor_calls SET status = 'reviewed', reviewed_at = now(), draft_followup = ${body.editedDraft}, updated_at = now()
        WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId} AND status <> 'analyzing' AND deleted_at IS NULL RETURNING id`
      if (!rows.length) throw new CallError("Wait for analysis to finish before marking the review complete.", 409)
      return { ok: true }
    }
    if (scope.persona === "lp") throw new CallError("LP notes cannot link to operational CRM records.", 403)
    if (typeof body.crmEntryId !== "string") throw new CallError("Choose a contact.")
    const [entry] = await sql`SELECT id FROM crm_entries WHERE user_id = ${scope.userId} AND id = ${body.crmEntryId}`
    if (!entry) throw new CallError("Contact unavailable.", 404)
    const rows = await sql`UPDATE investor_calls SET crm_entry_id = ${entry.id}, updated_at = now()
      WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId} AND outreach_message_id IS NULL AND deleted_at IS NULL RETURNING id`
    if (!rows.length) throw new CallError("A drafted call cannot be relinked.", 409)
    return { ok: true }
  })
}
