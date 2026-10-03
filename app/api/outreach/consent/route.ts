/**
 * Consent attestations for the country send-gate (docs/architecture/37 section 8.3).
 * POST   { email, basis: "prior_express_consent" | "existing_customer", note? }  records or refreshes one
 * DELETE { email }                                                               revokes it
 * GET                                                                           lists the caller's attestations
 * The attestation is the sender's own statement. It is stored with who made it and when, and never edited by staff.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { resolveActingUser } from "@/lib/auth/acting-user"
import { recordConsent } from "@/lib/email/send-gate"
import { normEmail } from "@/lib/email/unsubscribe"

export const runtime = "nodejs"

export async function GET() {
  const user = await resolveActingUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const rows = await sql`SELECT email, basis, note, attested_at FROM outreach_consents WHERE user_id = ${user.id} AND revoked_at IS NULL ORDER BY attested_at DESC LIMIT 500`
  return NextResponse.json({ consents: rows })
}

export async function POST(req: NextRequest) {
  const user = await resolveActingUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const basis = b?.basis
  if (basis !== "prior_express_consent" && basis !== "existing_customer") return NextResponse.json({ error: "basis must be prior_express_consent or existing_customer" }, { status: 400 })
  try {
    await recordConsent(user.id, String(b?.email ?? ""), basis, typeof b?.note === "string" ? b.note.slice(0, 500) : null)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not record" }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await resolveActingUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  await sql`UPDATE outreach_consents SET revoked_at = now() WHERE user_id = ${user.id} AND lower(email) = ${normEmail(String(b?.email ?? ""))}`
  return NextResponse.json({ ok: true })
}
