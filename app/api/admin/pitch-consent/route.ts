/**
 * GET  /api/admin/pitch-consent   recipients in gated countries whose pitch-us emails are held
 * POST /api/admin/pitch-consent   { email, basis, note? } the owner attests; the held entries go back in the queue
 * Owner only.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { listBlockedPitchRecipients, attestPitchConsent } from "@/lib/outreach/pitch-consent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  return NextResponse.json({ blocked: await listBlockedPitchRecipients() }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const b = await req.json().catch(() => ({}))
  if (b?.basis !== "prior_express_consent" && b?.basis !== "existing_customer") return NextResponse.json({ error: "basis must be prior_express_consent or existing_customer" }, { status: 400 })
  try {
    const r = await attestPitchConsent({ id: guard.id, email: guard.email }, String(b?.email ?? ""), b.basis, typeof b?.note === "string" ? b.note.slice(0, 400) : null)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not record" }, { status: 400 })
  }
}
