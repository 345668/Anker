/**
 * GET /api/cron/directory-identity — daily. Proposes candidate duplicate firms and people for review (docs/architecture/55, E1). Changes no directory data, UNLESS the platform flag
 * `directory_auto_merge` is on (it is off): then certain person pairs (same email or profile, compatible name) are merged, at most 25 a run, each one undoable for 90 days. Firms are never merged here.
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { runDetection } from "@/lib/directory/candidates"
import { trackCron } from "@/lib/cron/track"
import { autoMergePeople } from "@/lib/directory/merge"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const detection = await runDetection()
    const [flag] = (await sql`SELECT enabled FROM platform_flags WHERE key = 'directory_auto_merge'`) as any[]
    const auto = await autoMergePeople({ enabled: !!flag?.enabled })
    return NextResponse.json({ ok: true, ...detection, autoMerge: auto })
  } catch (e: any) { console.error("[directory-identity]", e?.message ?? e); return NextResponse.json({ error: "Detection failed" }, { status: 500 }) }
}
export const GET = trackCron("directory-identity", handle)
