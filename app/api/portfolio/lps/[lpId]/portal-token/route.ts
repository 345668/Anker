/**
 * /api/portfolio/lps/[lpId]/portal-token — LP Portal magic-link admin.
 *
 *   GET                       list this LP's tokens (prefix, expiry, views — not the secret)
 *   POST { days?, label? }    mint a token → returns the portal LINK once
 *   DELETE ?tokenId=          revoke a token
 *
 * The plaintext token is shown ONLY in the POST response. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { lpId } = await ctx.params
  const rows = await sql`
    select id, prefix, label, expires_at, revoked, last_seen_at, view_count, created_at
    from lp_portal_tokens where lp_id = ${lpId} order by created_at desc
  `
  return NextResponse.json({ tokens: rows })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { lpId } = await ctx.params

  const lp = await sql`select id, fund_id from fund_lps where id = ${lpId} limit 1` as Array<{ id: string; fund_id: string }>
  if (!lp.length) return NextResponse.json({ error: "LP not found" }, { status: 404 })

  let body: any = {}
  try { body = await req.json() } catch { /* optional */ }
  const days = Number(body?.days)
  const minted = await mintPortalToken(lpId, lp[0].fund_id || FLAGSHIP, {
    days: Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : undefined,
    label: typeof body?.label === "string" ? body.label.slice(0, 80) : undefined,
    createdBy: guard.id,
  })
  const link = `${baseUrl(req).replace(/\/$/, "")}/portal/${minted.token}`
  return NextResponse.json({ ok: true, token: minted.token, link, prefix: minted.prefix, expiresAt: minted.expiresAt }, { status: 201 })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { lpId } = await ctx.params
  const tokenId = req.nextUrl.searchParams.get("tokenId")
  if (!tokenId) return NextResponse.json({ error: "tokenId required" }, { status: 400 })
  const rows = await sql`
    update lp_portal_tokens set revoked = true where id = ${tokenId}::uuid and lp_id = ${lpId} returning id
  ` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Token not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
