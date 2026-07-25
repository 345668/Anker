/**
 * GET /api/public/status/[ref]  — PUBLIC status lookup by public_ref.
 *
 * Returns a founder-safe, coarse status for a submission — enough for the
 * applicant to see where they are, nothing sensitive (no scores, no investor
 * data, no decline feedback beyond the fact of it). Rate-limited by IP to blunt
 * enumeration of the ANK-XXXX space.
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { sql } from "@/lib/db"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Coarse, founder-safe labels — never expose internal pipeline states verbatim.
const PUBLIC_STATUS: Record<string, { label: string; detail: string }> = {
  received:       { label: "Received",    detail: "We've got your application and it's queued for review." },
  assessing:      { label: "In review",   detail: "Our assessment engine is reviewing your startup and deck." },
  assessed:       { label: "In review",   detail: "Assessment complete — preparing your investor matches." },
  campaign_ready: { label: "Matched",     detail: "We've matched you with investors and are preparing outreach." },
  outreaching:    { label: "Outreach live", detail: "We're introducing you to matched investors. We'll alert you on any interest." },
  completed:      { label: "Complete",    detail: "Your outreach campaign has wrapped up. Check your email for the summary." },
  declined:       { label: "Reviewed",    detail: "We've reviewed your application — please check your email for our feedback." },
  failed:         { label: "In review",   detail: "We're taking a closer look at your application." },
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || ""
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0"
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const ipKey = createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 32)
  const rl = rateLimit(`public-status:${ipKey}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl)

  const { ref } = await ctx.params
  const publicRef = (ref || "").toUpperCase().slice(0, 20)
  if (!/^ANK-[0-9A-Z]{4}$/.test(publicRef)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }

  const rows = await sql`
    SELECT startup_name, status, created_at
    FROM founder_submissions
    WHERE public_ref = ${publicRef}
    LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: "Not found." }, { status: 404 })

  const row = rows[0] as { startup_name: string; status: string; created_at: string }
  const s = PUBLIC_STATUS[row.status] ?? PUBLIC_STATUS.received
  return NextResponse.json({
    publicRef,
    startupName: row.startup_name,
    status: s.label,
    detail: s.detail,
    submittedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  })
}
