/**
 * GET /api/cron/compliance-digest
 *
 * Weekly nudge: for every fund with compliance deadlines entering their
 * window (overdue, or due within COMPLIANCE_DIGEST_LEAD_DAYS — default 30),
 * email a plain-text digest to that fund's admin(s).
 *
 * Recipients, per fund, in priority order:
 *   1. funds.metadata->>'admin_email'   (per-fund override)
 *   2. COMPLIANCE_DIGEST_TO             (comma-separated env override)
 *   3. ADMIN_EMAILS                     (lib/auth/admin.ts — the app admins)
 *
 * Auth: Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; a ?secret=
 * query param is accepted for manual/external triggering. No secret set →
 * 401 (fail closed).
 *
 * Scheduling: registered in vercel.json for Mondays 08:00 UTC ("0 8 * * 1").
 *
 * ?dry=1  computes and returns the digests WITHOUT sending — safe to hit by
 *         hand to preview exactly what would go out.
 *
 * Idempotency: this only reads deadlines and sends mail; it writes nothing.
 * A duplicate trigger in the same window re-sends — Vercel Cron fires once
 * per schedule, and weekly cadence makes an accidental double-send harmless.
 */
import { NextRequest, NextResponse } from "next/server"
import { ADMIN_EMAILS } from "@/lib/auth/admin"
import {
  computeComplianceDigests,
  renderDigestText,
  DEFAULT_LEAD_DAYS,
  type FundDigest,
} from "@/lib/portfolio/compliance-digest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if ((req.headers.get("authorization") || "") === `Bearer ${secret}`) return true
  return new URL(req.url).searchParams.get("secret") === secret
}

function recipientsFor(fund: FundDigest): string[] {
  if (fund.adminEmailOverride?.trim()) {
    return fund.adminEmailOverride.split(",").map((s) => s.trim()).filter(Boolean)
  }
  const envTo = (process.env.COMPLIANCE_DIGEST_TO || "").split(",").map((s) => s.trim()).filter(Boolean)
  if (envTo.length) return envTo
  return ADMIN_EMAILS
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const dry = url.searchParams.get("dry") === "1"
  const leadDays = Number(url.searchParams.get("leadDays")) || DEFAULT_LEAD_DAYS
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ""

  const digests = await computeComplianceDigests(leadDays)

  if (dry) {
    return NextResponse.json({
      dryRun: true,
      leadDays,
      funds: digests.map((f) => ({
        fund: f.fundName,
        recipients: recipientsFor(f),
        overdue: f.overdue.length,
        upcoming: f.upcoming.length,
        preview: renderDigestText(f, appUrl),
      })),
    })
  }

  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) {
    return NextResponse.json(
      { error: "Email sending is not configured (RESEND_API_KEY missing)." },
      { status: 503 },
    )
  }

  const results: Array<{ fund: string; sentTo: string[]; ok: boolean; error?: string }> = []
  for (const fund of digests) {
    const to = recipientsFor(fund)
    if (!to.length) {
      results.push({ fund: fund.fundName, sentTo: [], ok: false, error: "no recipients resolved" })
      continue
    }
    const overduePart = fund.overdue.length ? `${fund.overdue.length} overdue` : ""
    const soonPart = fund.upcoming.length ? `${fund.upcoming.length} due soon` : ""
    const summary = [overduePart, soonPart].filter(Boolean).join(", ")
    try {
      await sendEmail({
        to: to.join(", "),
        subject: `Compliance digest — ${fund.fundName}${summary ? ` (${summary})` : ""}`,
        text: renderDigestText(fund, appUrl),
        noTracking: true, // transactional — no pixels / link rewriting
      })
      results.push({ fund: fund.fundName, sentTo: to, ok: true })
    } catch (e: any) {
      console.error("[compliance-digest] send failed for", fund.fundName, e?.message ?? e)
      results.push({ fund: fund.fundName, sentTo: to, ok: false, error: e?.message ?? "send failed" })
    }
  }

  return NextResponse.json({
    ok: true,
    leadDays,
    fundsWithItems: digests.length,
    sent: results.filter((r) => r.ok).length,
    results,
  })
}
