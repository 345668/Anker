/**
 * GET /api/extension/crawl-queue?limit=10
 *
 * Chrome extension polls this to pick up next N queued LinkedIn URLs.
 * Atomically claims rows so parallel polls don't double-crawl.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function GET(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)))

  const claimed = await sql<any[]>`
    WITH pick AS (
      SELECT id
      FROM outreach_crawl_queue
      WHERE user_id = ${auth.userId} AND status = 'queued'
      ORDER BY requested_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outreach_crawl_queue q
    SET status = 'claimed', claimed_at = NOW(), claimed_by = ${auth.userId}
    FROM pick
    WHERE q.id = pick.id
    RETURNING q.id, q.campaign_id, q.member_id, q.linkedin_url
  `

  return NextResponse.json({
    ok: true,
    items: claimed.map((c) => ({
      id: c.id,
      campaignId: c.campaign_id,
      memberId: c.member_id,
      linkedinUrl: c.linkedin_url,
    })),
  }, { headers: corsHeaders() })
}
