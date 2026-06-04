/**
 * GET /api/auth/gmail/callback?code=...&state=...
 *
 * Google redirects here after consent.  Verifies state, swaps the code
 * for refresh + access tokens, looks up the user's profile email + name
 * via Google's userinfo endpoint, then upserts an email_oauth_accounts row.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { exchangeCodeForTokens } from "@/lib/email/gmail"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/sign-in", req.url))

  const url = req.nextUrl
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const err = url.searchParams.get("error")
  if (err) return NextResponse.redirect(new URL(`/dashboard/outreach?gmail_oauth=error&reason=${encodeURIComponent(err)}`, req.url))
  if (!code || !state) return NextResponse.redirect(new URL("/dashboard/outreach?gmail_oauth=error&reason=missing-params", req.url))

  const stateCookie = req.cookies.get("gmail_oauth_state")?.value ?? ""
  const [stateUserId, stateNonce] = stateCookie.split(":")
  if (!stateUserId || stateUserId !== user.id || stateNonce !== state) {
    return NextResponse.redirect(new URL("/dashboard/outreach?gmail_oauth=error&reason=bad-state", req.url))
  }

  const tok = await exchangeCodeForTokens(code)
  if (!tok.ok) return NextResponse.redirect(new URL(`/dashboard/outreach?gmail_oauth=error&reason=${encodeURIComponent(tok.error)}`, req.url))

  // Use the access token to look up the user's profile (email + name).
  const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  })
  if (!infoRes.ok) return NextResponse.redirect(new URL("/dashboard/outreach?gmail_oauth=error&reason=userinfo-failed", req.url))
  const info = await infoRes.json()
  const email = String(info?.email ?? "").toLowerCase()
  const name = String(info?.name ?? "") || null
  if (!email) return NextResponse.redirect(new URL("/dashboard/outreach?gmail_oauth=error&reason=no-email", req.url))

  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000)
  const scopes = tok.scope.split(/\s+/).filter(Boolean)
  await sql`
    INSERT INTO email_oauth_accounts (
      user_id, provider, email, display_name,
      refresh_token, access_token, expires_at, scopes,
      is_default, status, created_at, updated_at
    ) VALUES (
      ${user.id}, 'gmail', ${email}, ${name},
      ${tok.refresh_token}, ${tok.access_token}, ${expiresAt}, ${scopes},
      false, 'active', NOW(), NOW()
    )
    ON CONFLICT (user_id, email) DO UPDATE SET
      refresh_token = EXCLUDED.refresh_token,
      access_token  = EXCLUDED.access_token,
      expires_at    = EXCLUDED.expires_at,
      scopes        = EXCLUDED.scopes,
      display_name  = EXCLUDED.display_name,
      status        = 'active',
      last_error    = NULL,
      updated_at    = NOW()
  `

  const res = NextResponse.redirect(new URL(`/dashboard/outreach?gmail_oauth=ok&email=${encodeURIComponent(email)}`, req.url))
  res.cookies.delete("gmail_oauth_state")
  return res
}
