/**
 * POST /api/admin/email/sync-events
 *   Body: { limit?: number, intervalMin?: number, force?: boolean, messageId?: string }
 *
 *   Admin-gated.  Polls Resend's GET /emails/:id for sent messages and
 *   updates open/click/bounce counters + status forward-only.  Returns
 *   the same shape as lib/email/resend-sync.ts → SyncResult.
 *
 * GET /api/admin/email/sync-events
 *   Returns whether Resend is configured + the last sync time across
 *   all email messages.  Useful for the panel header.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { syncResendEvents } from "@/lib/email/resend-sync"
import { isResendConfigured } from "@/lib/email/resend"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const [row] = await sql`
    SELECT
      max(last_resend_sync_at) AS last_sync_at,
      count(*) FILTER (WHERE channel = 'email' AND resend_id IS NOT NULL
                              AND resend_id NOT LIKE 'dryrun:%'
                              AND status NOT IN ('failed','cancelled','complained')) AS active,
      count(*) FILTER (WHERE channel = 'email' AND last_resend_sync_at IS NULL) AS unsynced
    FROM outreach_messages
    WHERE channel = 'email'`
  const r = row as any
  return NextResponse.json({
    configured: isResendConfigured(),
    lastSyncAt: r?.last_sync_at ? new Date(r.last_sync_at).toISOString() : null,
    activeCount: Number(r?.active) || 0,
    unsyncedCount: Number(r?.unsynced) || 0,
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json().catch(() => ({}))
    const result = await syncResendEvents({
      limit: Number(body?.limit) || undefined,
      intervalMin: Number(body?.intervalMin) || undefined,
      force: !!body?.force,
      messageId: typeof body?.messageId === "string" ? body.messageId : undefined,
    })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[admin/email/sync-events]", e)
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 })
  }
}
