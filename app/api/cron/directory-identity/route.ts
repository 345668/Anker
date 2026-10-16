/**
 * GET /api/cron/directory-identity — daily. Proposes candidate duplicate firms and people for review (docs/architecture/55, E1). Changes no directory data.
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { runDetection } from "@/lib/directory/candidates"
import { trackCron } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await runDetection()) }) } catch (e: any) { console.error("[directory-identity]", e?.message ?? e); return NextResponse.json({ error: "Detection failed" }, { status: 500 }) }
}
export const GET = trackCron("directory-identity", handle)
