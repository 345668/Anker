/**
 * Public unsubscribe for outreach email.
 *
 *   GET  ?t=<token>   a confirmation page with one button. It does NOT unsubscribe on load: mail scanners and
 *                     link previews fetch every link, and an unsubscribe nobody chose is its own harm.
 *   POST ?t=<token>   unsubscribes. This is the RFC 8058 one-click target mailbox providers call with the body
 *                     `List-Unsubscribe=One-Click`, and the form on the page.
 *
 * Opting out puts the address on the GLOBAL do-not-send list: every Anker outreach email to it stops, whoever sent it.
 * Nothing here needs a session, and the token proves the address, so it cannot unsubscribe anyone else.
 */
import { NextRequest, NextResponse } from "next/server"
import { readUnsubscribeToken } from "@/lib/email/unsubscribe"
import { suppressEverywhere } from "@/lib/compliance/suppression"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.25rem;color:#111}button{font:inherit;padding:.6rem 1.1rem;border:0;border-radius:.5rem;background:#111;color:#fff;cursor:pointer}a{color:#111}small{color:#666}</style></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  )

const clientIp = (req: NextRequest) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown"
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2")

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") || ""
  const email = readUnsubscribeToken(token)
  if (!email) return page("Link not valid", `<h1>This link is not valid</h1><p>It may be incomplete. Reply to the email and ask to be removed and it will be done.</p>`, 400)
  return page(
    "Unsubscribe",
    `<h1>Stop these emails?</h1><p>Confirm to stop all Anker outreach email to <strong>${mask(email)}</strong>.</p>` +
      `<form method="post" action="/api/public/unsubscribe?t=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>` +
      `<p><small>Privacy notice: <a href="/privacy">an-ker.de/privacy</a></small></p>`,
  )
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`unsubscribe:${clientIp(req)}`, { limit: 30, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl)
  const token = req.nextUrl.searchParams.get("t") || ""
  const email = readUnsubscribeToken(token)
  if (!email) return NextResponse.json({ error: "invalid link" }, { status: 400 })
  try {
    await suppressEverywhere({ email, reason: "unsubscribed", source: "recipient" })
  } catch (e) {
    console.error("[unsubscribe] write failed", (e as Error)?.message)
    return NextResponse.json({ error: "could not record the request, please reply to the email instead" }, { status: 500 })
  }
  // A mailbox provider's one-click call and a browser form post both land here; give each what it expects.
  const oneClick = (req.headers.get("content-type") || "").includes("application/x-www-form-urlencoded") && !req.headers.get("referer")
  if (oneClick) return new NextResponse("ok", { status: 200 })
  return page("Unsubscribed", `<h1>You are unsubscribed</h1><p>${mask(email)} will not be contacted by Anker outreach again, by email or on LinkedIn.</p>`)
}
