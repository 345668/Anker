/**
 * GET /api/auth/gmail/start
 *
 * Kicks off the Gmail OAuth flow.  Stores a one-time `state` cookie tied
 * to the signed-in user, then redirects to Google's consent screen with
 * the gmail.send scope.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isGmailOAuthConfigured, gmailAuthUrl } from "@/lib/email/gmail"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  if (!isGmailOAuthConfigured()) {
    return NextResponse.json({
      error: "Gmail OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URL in .env.local.",
    }, { status: 500 })
  }
  const loginHint = req.nextUrl.searchParams.get("login_hint") ?? undefined
  const state = randomUUID()
  const url = gmailAuthUrl({ state, loginHint })
  const res = NextResponse.redirect(url)
  // Tie the state to this user so the callback can verify it.
  res.cookies.set(`gmail_oauth_state`, `${user.id}:${state}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/",
  })
  return res
}
