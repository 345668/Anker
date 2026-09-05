/**
 * GET /api/cron/outreach-poll
 *
 * Vercel cron (every 10 min). Closes the founder-outreach loop that used to
 * stop at the mailbox (see docs/founder-outreach-audit.md):
 *   1. pollInbox()               — pull inbound investor replies via IMAP
 *   2. autoClassifyPendingReplies() — classify + draft the NULL-classification
 *      rows and suppress follow-ups for entries that replied
 *
 * The drafted responses remain approval-gated: a human approves them in the
 * follow-up inbox, which then sends them (POST /api/outreach/followups).
 *
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextRequest, NextResponse } from "next/server"
import { pollAllMailboxes } from "@/lib/email/inbox-sync"
import { autoClassifyPendingReplies } from "@/lib/outreach/reply-actions"

export const runtime = "nodejs"
export const maxDuration = 300

function authorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const poll = await pollAllMailboxes({ limit: 100 }).catch((e: any) => ({
    error: e?.message ?? "poll failed",
  }))

  // Classify whatever is pending — both freshly-polled replies and any that
  // were ingested by other paths but never classified.
  const classify = await autoClassifyPendingReplies({ limit: 50 }).catch((e: any) => ({
    error: e?.message ?? "classify failed",
  }))

  return NextResponse.json({ ok: true, poll, classify })
}
