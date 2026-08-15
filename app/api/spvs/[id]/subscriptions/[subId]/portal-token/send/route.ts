/**
 * POST /api/spvs/[id]/subscriptions/[subId]/portal-token/send
 *
 * Mints a fresh SPV investor-portal token and EMAILS the magic link to the
 * subscriber's address (Resend, transactional / no tracking) — the "Send"
 * counterpart to the copy-to-clipboard portal action. The plaintext token never
 * reaches the admin's browser, it goes straight to the investor.
 *
 * A human admin click is the trigger — one email per click, to one investor.
 * Owner-gated. Returns 422 when the subscriber has no email, 503 when Resend
 * isn't configured, and revokes the token if the send fails so no orphaned live
 * token is left behind.
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { mintSpvPortalToken, userOwnsSpv } from "@/lib/modules/spv-portal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || req.headers.get("origin")
    || `https://${req.headers.get("host") ?? "www.an-ker.de"}`
}

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const { id, subId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await userOwnsSpv(user.id, id))) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const rows = (await sql`
    SELECT s.investor_name, s.investor_email, s.amount, s.status, v.name AS spv_name, v.deal_name
    FROM spv_subscriptions s JOIN spvs v ON v.id = s.spv_id
    WHERE s.id = ${subId} AND s.spv_id = ${id} LIMIT 1`) as Array<Record<string, any>>
  if (!rows.length) return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
  const sub = rows[0]

  const to = String(sub.investor_email ?? "").trim()
  if (!to) {
    return NextResponse.json(
      { error: "This investor has no email on file. Add one on the subscription, then try again." },
      { status: 422 },
    )
  }

  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) {
    return NextResponse.json(
      { error: "Email sending is not configured (RESEND_API_KEY missing). Nothing was sent." },
      { status: 503 },
    )
  }

  let body: any = {}
  try { body = await req.json() } catch { /* optional */ }
  const days = Number(body?.days)
  const validDays = Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : 90

  const minted = await mintSpvPortalToken(subId, id, {
    days: validDays,
    label: `emailed ${new Date().toISOString().slice(0, 10)}`,
    createdBy: user.id,
  })
  const link = `${baseUrl(req).replace(/\/$/, "")}/spv-portal/${minted.token}`

  const spvName = sub.spv_name || "the SPV"
  const dealLine = sub.deal_name ? ` (${sub.deal_name})` : ""

  try {
    await sendEmail({
      to,
      subject: `Your SPV investor portal — ${spvName}`,
      text: [
        `Hello ${sub.investor_name},`,
        ``,
        `Here is your private investor portal for ${spvName}${dealLine}. It shows your subscription — your commitment of ${money(Number(sub.amount) || 0)}, its status, and your ownership of the vehicle.`,
        ``,
        `Open your portal:`,
        link,
        ``,
        `This private link is valid for ${validDays} days. It's specific to you — please don't forward it.`,
        ``,
        `— ${spvName}`,
      ].join("\n"),
      noTracking: true,
    })
  } catch (e: any) {
    try {
      const tokenHash = createHash("sha256").update(minted.token).digest("hex")
      await sql`UPDATE spv_portal_tokens SET revoked = true WHERE token_hash = ${tokenHash}`
    } catch { /* best-effort cleanup */ }
    return NextResponse.json({ error: `Could not send the email: ${e?.message ?? "unknown error"}` }, { status: 502 })
  }

  const masked = to.replace(/^(.).*(@.*)$/, "$1***$2")
  return NextResponse.json({ ok: true, sentTo: masked, expiresAt: minted.expiresAt }, { status: 201 })
}
