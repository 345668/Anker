/**
 * Confirmation of a privacy request. GET shows a page with one button and changes nothing, because mail scanners and link previews open every link in an email.
 * POST confirms (docs/architecture/54, D3).
 */
import { NextRequest, NextResponse } from "next/server"
import { verifyRequest } from "@/lib/privacy/dsar"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const page = (title: string, body: string, status = 200) =>
  new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.25rem;color:#111}button{font:inherit;padding:.6rem 1.1rem;border:0;border-radius:.5rem;background:#111;color:#fff;cursor:pointer}a{color:#111}</style></head><body>${body}</body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } })
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") || ""
  if (t.length < 20) return page("Link not valid", `<h1>This link is not valid</h1><p>It may be incomplete. Write to <a href="mailto:vc@an-ker.de">vc@an-ker.de</a>.</p>`, 400)
  return page("Confirm your request", `<h1>Confirm your privacy request</h1><p>Press the button to confirm that this request came from you.</p><form method="post" action="/api/public/privacy-request/verify?t=${esc(encodeURIComponent(t))}"><button type="submit">Confirm</button></form>`)
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`privacy-verify:${(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown"}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl)
  const r = await verifyRequest(req.nextUrl.searchParams.get("t") || "").catch(() => ({ ok: false as const, reason: "invalid" as const }))
  if (!r.ok) return page("Link not valid", `<h1>This link is no longer valid</h1><p>${r.reason === "expired" ? "It has expired. Please make the request again." : "It may already have been used."} Questions: <a href="mailto:vc@an-ker.de">vc@an-ker.de</a>.</p>`, 400)
  return page("Confirmed", `<h1>Thank you, it is confirmed</h1><p>${r.kind === "objection" ? "We have stopped contacting you and will remove your record from our investor directory. You will get an email when it is done." : "We will answer within 30 days, by email to the same address."}</p>`)
}
