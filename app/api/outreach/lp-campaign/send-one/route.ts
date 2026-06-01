/**
 * POST /api/outreach/lp-campaign/send-one
 *
 * Send a single LP Campaign email (no outreach_messages row required —
 * the LP Campaign pipeline keeps results in React state, not the DB).
 *
 * Body: { to, toName, subject, body }
 *
 * Uses Resend via lib/email/resend.ts (same path as all other outreach).
 * Degrades to dry-run if RESEND_API_KEY is missing.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { to, toName, subject, body: emailBody } = body as {
      to?: string
      toName?: string
      subject?: string
      body?: string
    }

    if (!to)         return NextResponse.json({ error: "to is required" }, { status: 400 })
    if (!subject)    return NextResponse.json({ error: "subject is required" }, { status: 400 })
    if (!emailBody)  return NextResponse.json({ error: "body is required" }, { status: 400 })

    const trackingId = randomUUID()
    const result = await sendEmail({
      to: to.trim(),
      subject: subject.trim(),
      text: emailBody,
      trackingId,
    })

    return NextResponse.json({
      ok: true,
      resendId: result.resendId,
      messageId: result.messageId,
      trackingId: result.trackingId,
      dryRun: result.dryRun,
      providerConfigured: isResendConfigured(),
    })
  } catch (e: any) {
    console.error("[lp-campaign/send-one]", e)
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 500 })
  }
}
