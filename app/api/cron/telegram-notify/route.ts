/**
 * GET /api/cron/telegram-notify — every 5 minutes. Tells people who opted in what is waiting: changes to approve, replies, tasks due (docs/architecture/57, T2).
 * Counts and a link only; nothing during their quiet hours. Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { productBot } from "@/lib/telegram/api"
import { loadBot, ownBotIds } from "@/lib/telegram/bots"
import { notifyAll, realApi } from "@/lib/telegram/runtime"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const shared = productBot()
  const app = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
  try {
    const total = { links: 0, sent: 0, held: 0, failed: 0 }
    const add = (r: { links: number; sent: number; held: number; failed: number }) => { total.links += r.links; total.sent += r.sent; total.held += r.held; total.failed += r.failed }
    if (shared) add(await notifyAll(realApi(shared), app, Date.now(), "platform"))
    for (const id of await ownBotIds()) { const l = await loadBot(id); if (l) add(await notifyAll(realApi(l.bot), app, Date.now(), id)) }
    return NextResponse.json({ ok: true, configured: !!shared, ...total })
  } catch (e: any) { console.error("[telegram-notify]", e?.message ?? e); return NextResponse.json({ error: "Notify failed" }, { status: 500 }) }
}
export const GET = trackCron("telegram-notify", handle)
