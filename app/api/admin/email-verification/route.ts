/**
 * Owner-only status and live test for email verification (docs/architecture/13).
 *
 * GET  → is a provider configured, where the key came from, what today's
 *        budget looks like, and how the directory's addresses currently stand.
 * POST { email } → verify ONE address through the provider, so the owner can
 *        prove a newly entered key works. Never returns the key.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { configuredProvider, dailyLimit } from "@/lib/email-verification/providers"
import { providerChecksToday, verifyEmails } from "@/lib/email-verification/service"
import { normEmail, statusLabel } from "@/lib/email-verification/types"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const configured = await configuredProvider()
  const [counts] = await sql`
    SELECT count(*)::int AS checked,
           count(*) FILTER (WHERE status = 'valid')::int AS valid,
           count(*) FILTER (WHERE status = 'risky')::int AS risky,
           count(*) FILTER (WHERE status = 'unknown')::int AS unknown,
           count(*) FILTER (WHERE status = 'invalid')::int AS invalid,
           count(*) FILTER (WHERE provider <> 'local')::int AS provider_checked
      FROM email_verifications`
  const [directory] = await sql`SELECT count(*)::int AS n FROM investors WHERE email IS NOT NULL AND email <> ''`
  const used = await providerChecksToday()
  return NextResponse.json({
    configured: !!configured,
    provider: configured?.provider.id ?? null,
    keySource: configured?.source ?? null,
    dailyLimit: dailyLimit(),
    usedToday: used,
    budgetLeft: Math.max(0, dailyLimit() - used),
    directoryAddresses: Number(directory?.n ?? 0),
    statuses: counts,
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const configured = await configuredProvider()
  if (!configured) return NextResponse.json({ error: "No verification provider is configured yet." }, { status: 400 })
  const body = await req.json().catch(() => null)
  const email = normEmail(body?.email)
  if (!email) return NextResponse.json({ error: "Send one email address to test." }, { status: 400 })
  // Force a provider call even if this address was checked recently.
  await sql`DELETE FROM email_verifications WHERE email = ${email}`
  const report = await verifyEmails([email], { providerLimit: 1 })
  const result = report.results.get(email)
  if (!result) return NextResponse.json({ error: "That address could not be checked." }, { status: 400 })
  return NextResponse.json({
    ok: true,
    provider: configured.provider.id,
    keySource: configured.source,
    email,
    status: result.status,
    label: statusLabel(result.status),
    reason: result.reason,
    checkedBy: result.provider,
    providerErrors: report.providerErrors,
    budgetLeft: report.budgetLeft,
  })
}
