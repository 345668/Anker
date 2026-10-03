/**
 * GET /api/cron/assistant-uploads-sweep — hourly. Deletes chat-attachment blobs that were
 * uploaded but never sent (docs/architecture/36). Auth: Vercel Cron
 * `Authorization: Bearer $CRON_SECRET`; fails closed when CRON_SECRET is unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { sweepStaleUploads } from "@/lib/assistant/upload-sweep"
import { trackCron } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { list, del } = await import("@vercel/blob")
    const result = await sweepStaleUploads({
      list: (o) => list(o) as any,
      del: (urls) => del(urls),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error("[assistant-uploads-sweep]", e?.message ?? e)
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 })
  }
}

// Every run is recorded in cron_runs (lib/cron/track.ts); the handler above is unchanged.
export const GET = trackCron("assistant-uploads-sweep", handle)
