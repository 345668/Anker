/**
 * GET /api/cron/directory-maintenance — every 30 minutes. Fills directory identity hashes, removes rows that match a tombstone, and deletes withdrawn sources
 * after their 30-day hold (docs/architecture/54, D2). A no-op once the hashes are complete. Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { runMaintenance } from "@/lib/directory/maintenance"
import { trackCron } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await runMaintenance({ budgetMs: 200_000 })) })
  } catch (e: any) {
    console.error("[directory-maintenance]", e?.code ?? "", e?.message ?? e)
    return NextResponse.json({ error: e?.code === "hash_key_mismatch" ? "Hash key mismatch" : "Maintenance failed" }, { status: 500 })
  }
}
export const GET = trackCron("directory-maintenance", handle)
