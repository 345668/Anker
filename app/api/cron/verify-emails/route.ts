/**
 * GET /api/cron/verify-emails — daily (docs/architecture/13 §5).
 *
 *   1. Local checks for directory emails never checked (or expired).
 *   2. Provider checks, within the daily budget, for the primary contacts
 *      founders were shown most recently — the addresses about to be used.
 *
 * Fails closed: without CRON_SECRET nothing runs.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { verifyEmails } from "@/lib/email-verification/service"
import { trackCron } from "@/lib/cron/track"

export const runtime = "nodejs"
export const maxDuration = 300

const LOCAL_BATCH = 2000

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const unchecked = await sql`
    SELECT DISTINCT lower(trim(i.email)) AS email
      FROM investors i
      LEFT JOIN email_verifications v ON v.email = lower(trim(i.email))
     WHERE i.email IS NOT NULL AND i.email <> '' AND (v.email IS NULL OR v.expires_at < now())
     LIMIT ${LOCAL_BATCH}`
  const local = await verifyEmails(unchecked.map((r: any) => r.email), { useProvider: false })

  const recent = await sql`
    SELECT DISTINCT r.email_status, lower(trim(r.payload->'primary'->>'email')) AS email
      FROM founder_match_results r
      JOIN founder_match_runs run ON run.id = r.run_id
     WHERE run.created_at > now() - interval '14 days' AND r.kind = 'group' AND r.rank <= 200
       AND r.payload->'primary'->>'email' IS NOT NULL
     LIMIT 5000`
  const provider = await verifyEmails(recent.map((r: any) => r.email))

  return NextResponse.json({
    ok: true,
    local: { checked: local.local, cached: local.cached },
    provider: { configured: provider.providerConfigured, checked: provider.provider, errors: provider.providerErrors, budgetLeft: provider.budgetLeft },
  })
}

// Every run is recorded in cron_runs (lib/cron/track.ts); the handler above is unchanged.
export const GET = trackCron("verify-emails", handle)
