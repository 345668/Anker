/**
 * GET /api/track/click/:id?url=<target>
 *
 * Logs a click event then 302-redirects to the target URL.  Public —
 * never authenticated.  Validates the URL is http(s) so we don't become
 * an open redirector.
 */
import { NextRequest, NextResponse } from "next/server"
import { recordClick } from "@/lib/email/tracking"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = String(params.id ?? "")
  const url = new URL(req.url)
  const target = url.searchParams.get("url") ?? ""

  // Validate target — must be absolute http(s).
  let safe: string | null = null
  try {
    const u = new URL(target)
    if (u.protocol === "http:" || u.protocol === "https:") safe = u.toString()
  } catch { /* falls through */ }
  if (!safe) {
    return NextResponse.json({ error: "Invalid target url" }, { status: 400 })
  }

  const userAgent = req.headers.get("user-agent")
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  if (id) {
    try { await recordClick({ trackingId: id, ip, userAgent, url: safe }) }
    catch (e) { console.warn("[track/click] record failed:", (e as any)?.message) }
  }
  return NextResponse.redirect(safe, 302)
}
