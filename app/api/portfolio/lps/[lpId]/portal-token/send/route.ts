/**
 * POST /api/portfolio/lps/[lpId]/portal-token/send
 *
 * Mints a fresh investor-portal token for the LP and EMAILS the magic link
 * directly to the LP's contact address (Resend, transactional / no tracking).
 * This is the "Send link" counterpart to the copy-to-clipboard "Portal"
 * action — the plaintext token never reaches the admin's browser, it goes
 * straight to the LP.
 *
 * Body (all optional): { days?: number, label?: string }
 *   days  — link validity window (default 180, capped 3650)
 *   label — note stored on the token row (default "emailed <date>")
 *
 * Admin-gated. Returns 422 (not 500) when the LP has no resolvable email so
 * the UI can tell the operator to add a contact address first.
 *
 * The send itself is authorised as a product feature; a human admin click is
 * the trigger (one email per click, to one LP).
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { mintPortalToken } from "@/lib/portfolio/lp-portal"

export const runtime = "nodejs"

const FLAGSHIP = "svs-fund-ii"

function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || req.headers.get("origin")
    || `https://${req.headers.get("host") ?? "www.an-ker.de"}`
}

interface LpRow {
  id: string
  fund_id: string
  lp_name: string
  contact_email: string | null
  contact_first: string | null
  meta_email: string | null
  fund_name: string | null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { lpId } = await ctx.params

  // Resolve the LP, its fund, and an email: prefer the linked contact, then a
  // metadata-stored address (institutional LPs often have no contact row).
  const rows = (await sql`
    SELECT l.id, l.fund_id, l.lp_name,
           c.email                        AS contact_email,
           c.first_name                   AS contact_first,
           COALESCE(l.metadata->>'email', l.metadata->>'contact_email') AS meta_email,
           f.name                         AS fund_name
    FROM fund_lps l
    LEFT JOIN contacts c ON c.id = l.lp_contact_id
    LEFT JOIN funds    f ON f.id = l.fund_id
    WHERE l.id = ${lpId}
    LIMIT 1
  `) as LpRow[]

  if (!rows.length) return NextResponse.json({ error: "LP not found" }, { status: 404 })
  const lp = rows[0]

  const to = (lp.contact_email || lp.meta_email || "").trim()
  if (!to) {
    return NextResponse.json(
      { error: "This LP has no email on file. Link the LP to a contact with an email, or add one in the LP's metadata, then try again." },
      { status: 422 },
    )
  }

  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) {
    return NextResponse.json(
      { error: "Email sending is not configured (RESEND_API_KEY missing). The link was not sent." },
      { status: 503 },
    )
  }

  // Mint the token AFTER we know we can send, so we don't leave orphaned
  // tokens when the email can't go out.
  let body: any = {}
  try { body = await req.json() } catch { /* optional */ }
  const days = Number(body?.days)
  const validDays = Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : 180
  const label =
    typeof body?.label === "string" && body.label.trim()
      ? body.label.slice(0, 80)
      : `emailed ${new Date().toISOString().slice(0, 10)}`

  const minted = await mintPortalToken(lpId, lp.fund_id || FLAGSHIP, {
    days: validDays,
    label,
    createdBy: guard.id,
  })
  const link = `${baseUrl(req).replace(/\/$/, "")}/portal/${minted.token}`

  const fundName = lp.fund_name || "your fund"
  const greeting = lp.contact_first ? `Hi ${lp.contact_first},` : `Hello,`
  const expiryLine = `This private link is valid for ${validDays} days.`

  try {
    await sendEmail({
      to,
      subject: `Your investor portal — ${fundName}`,
      text: [
        greeting,
        ``,
        `You can now access your investor portal for ${fundName}. It shows your capital account, distributions, and the latest quarterly materials — everything specific to your position.`,
        ``,
        `Open your portal:`,
        link,
        ``,
        expiryLine,
        `The link is private to you; please don't forward it.`,
        ``,
        `— ${fundName}`,
      ].join("\n"),
      noTracking: true, // transactional: no open/click pixels or link rewriting
    })
  } catch (e: any) {
    // The token was minted but the email failed — revoke it so a token that
    // never reached anyone isn't left live, and report the failure. The table
    // stores only the sha-256 of the plaintext, so hash it the same way.
    try {
      const tokenHash = createHash("sha256").update(minted.token).digest("hex")
      await sql`UPDATE lp_portal_tokens SET revoked = true WHERE token_hash = ${tokenHash}`
    } catch { /* best-effort cleanup */ }
    console.error("[portal-token/send] email send failed:", e?.message ?? e)
    return NextResponse.json({ error: `Could not send the email: ${e?.message ?? "unknown error"}` }, { status: 502 })
  }

  // Mask the recipient in the response — the admin doesn't need the full
  // address echoed back, and it keeps PII out of client logs.
  const masked = to.replace(/^(.).*(@.*)$/, "$1***$2")
  return NextResponse.json({ ok: true, sentTo: masked, prefix: minted.prefix, expiresAt: minted.expiresAt }, { status: 201 })
}
