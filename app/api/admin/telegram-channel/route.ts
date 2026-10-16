/**
 * Status and setup of the customer Telegram channel, called by SAIL (docs/architecture/57). Portal service principal only. Never returns a secret and never any message content.
 *   GET  -> { configured, bot, webhook, queue, links }
 *   POST { action: "register" | "disable" } -> points Telegram at the webhook (with the derived secret), or removes it
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { deleteWebhook, getMe, getWebhookInfo, productBot, setWebhook } from "@/lib/telegram/api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")

async function guard(): Promise<NextResponse | null> {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  if (g.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  return null
}

export async function GET() {
  const denied = await guard(); if (denied) return denied
  const bot = productBot()
  const queue = ((await sql`SELECT status, count(*)::int AS n, min(received_at) AS oldest FROM telegram_updates WHERE status IN ('queued', 'running', 'failed') AND received_at > now() - interval '1 day' GROUP BY status`.catch(() => [])) as any[]).map((r) => ({ status: r.status, n: Number(r.n), oldest: r.oldest ? new Date(r.oldest).toISOString() : null }))
  const links = ((await sql`SELECT status, count(*)::int AS n, count(DISTINCT org_id)::int AS workspaces FROM telegram_links GROUP BY status`.catch(() => [])) as any[]).map((r) => ({ status: r.status, n: Number(r.n), workspaces: Number(r.workspaces) }))
  const [flag] = (await sql`SELECT enabled FROM platform_flags WHERE key = 'telegram_channel'`.catch(() => [])) as any[]
  if (!bot) return NextResponse.json({ configured: false, tokenSet: !!process.env.TELEGRAM_PRODUCT_BOT_TOKEN, secretKeySet: !!process.env.SECRET_KEY, flagOn: !!flag?.enabled, queue, links })
  let me: any = null, hook: any = null, error: string | null = null
  try { me = await getMe(bot); hook = await getWebhookInfo(bot) } catch (e) { error = (e as Error).message }
  return NextResponse.json({ configured: true, flagOn: !!flag?.enabled, bot: me?.username ?? null, webhook: hook ? { url: hook.url || null, expected: `${appUrl()}/api/telegram/webhook`, pending: hook.pending_update_count, lastError: hook.last_error_message ?? null } : null, error, queue, links })
}

export async function POST(req: NextRequest) {
  const denied = await guard(); if (denied) return denied
  const bot = productBot()
  if (!bot) return NextResponse.json({ error: "The product bot is not configured: set TELEGRAM_PRODUCT_BOT_TOKEN (and SECRET_KEY) in Vercel and redeploy." }, { status: 503 })
  const b = await req.json().catch(() => ({}))
  try {
    if (b?.action === "register") { await setWebhook(bot, `${appUrl()}/api/telegram/webhook`); return NextResponse.json({ ok: true, url: `${appUrl()}/api/telegram/webhook` }) }
    if (b?.action === "disable") { await deleteWebhook(bot); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }) }
}
