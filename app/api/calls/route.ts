import { NextRequest } from "next/server"
import { sql } from "@/lib/db"
import { callResponse, callScope, readCallBody } from "@/lib/calls/access"
import { saveCall } from "@/lib/calls/records"
export const runtime = "nodejs"
export async function GET() {
  return callResponse(async () => {
    const scope = await callScope()
    const calls = await sql`SELECT id, title, investor_name, created_at, occurred_at, status, source, summary, sentiment,
      interest_level, objections, next_steps, key_questions, draft_followup, recommended_stage, crm_entry_id,
      generated_by, analysis_error, analysis_started_at, outreach_message_id FROM investor_calls
      WHERE user_id = ${scope.userId} AND org_id = ${scope.orgId} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`
    const legacy = await sql`SELECT id, title, created_at FROM investor_calls WHERE user_id = ${scope.userId} AND org_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`
    return { calls, legacy, scope }
  })
}
export async function POST(req: NextRequest) {
  return callResponse(async () => saveCall(await callScope(true), await readCallBody(req)))
}
