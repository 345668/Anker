/**
 * POST /api/extension/crawl-queue/[id]/complete
 *
 * The Chrome extension calls this after finishing a crawl. Marks the queue
 * item as done or failed. Extension is responsible for posting the actual
 * HTML/profile payload to /api/extension/ingest as a separate call — that
 * keeps this endpoint tiny and decoupled from the ingest schema.
 *
 * Body:
 *   { ok: boolean, error?: string, crmEntryId?: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: queueId } = await ctx.params
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({}))
  const okFlag: boolean = body.ok !== false
  const errorMsg: string | undefined = body.error
  const crmEntryId: string | undefined = body.crmEntryId

  const q = await sql<any[]>`
    SELECT * FROM outreach_crawl_queue
    WHERE id = ${queueId} AND user_id = ${auth.userId}
  `
  if (!q.length) return NextResponse.json({ error: "Queue item not found" }, { status: 404, headers: corsHeaders() })

  if (!okFlag) {
    await sql`
      UPDATE outreach_crawl_queue
      SET status = 'failed', completed_at = NOW(), failed_reason = ${errorMsg || 'unknown'}
      WHERE id = ${queueId}
    `
    return NextResponse.json({ ok: true, marked: "failed" }, { headers: corsHeaders() })
  }

  await sql`
    UPDATE outreach_crawl_queue
    SET status = 'done', completed_at = NOW(), crm_entry_id = ${crmEntryId || null}
    WHERE id = ${queueId}
  `

  return NextResponse.json({ ok: true, marked: "done" }, { headers: corsHeaders() })
}
