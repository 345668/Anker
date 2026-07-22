/**
 * GET /api/track/open/:id.gif
 *
 * 1×1 transparent GIF response.  Logs an open event for the message
 * matching the tracking_id.  Public — never authenticated (the email
 * recipient hits this in any mail client).
 *
 * Cache-Control: no-store ensures Gmail / Outlook image proxies don't
 * cache the response and skip subsequent opens.
 */
import { NextRequest, NextResponse } from "next/server"
import { recordOpen, PIXEL_GIF } from "@/lib/email/tracking"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = String(rawId ?? "").replace(/\.gif$/i, "")
  const userAgent = req.headers.get("user-agent")
  // Best-effort IP — Vercel & most proxies set X-Forwarded-For
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  if (id) {
    try { await recordOpen({ trackingId: id, ip, userAgent }) }
    catch (e) { console.warn("[track/open] record failed:", (e as any)?.message) }
  }
  return new NextResponse(PIXEL_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_GIF.length),
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  })
}
