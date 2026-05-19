/**
 * POST /api/admin/email/poll
 *   Admin trigger: poll the configured IMAP mailbox for new replies.
 *   Returns the same shape as lib/email/imap-poller.ts → PollResult.
 *
 * GET /api/admin/email/poll
 *   Returns last-known state for each configured mailbox + whether
 *   IMAP is configured at all.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { pollInbox, isImapConfigured } from "@/lib/email/imap-poller"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const rows = await sql`SELECT * FROM inbox_poll_state ORDER BY last_polled_at DESC`
  return NextResponse.json({
    configured: isImapConfigured(),
    mailboxes: (rows as any[]).map((r) => ({
      mailbox: r.mailbox,
      lastUid: Number(r.last_uid) || 0,
      lastPolledAt: r.last_polled_at ? new Date(r.last_polled_at).toISOString() : null,
      lastError: r.last_error ?? null,
      pollCount: Number(r.poll_count) || 0,
      newRepliesLast: Number(r.new_replies) || 0,
    })),
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json().catch(() => ({}))
    const result = await pollInbox({
      mailbox: typeof body?.mailbox === "string" ? body.mailbox : undefined,
      limit: Number(body?.limit) || undefined,
    })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[admin/email/poll] error:", e)
    return NextResponse.json({ error: e?.message ?? "Poll failed" }, { status: 500 })
  }
}
