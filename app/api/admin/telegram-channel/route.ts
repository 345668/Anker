/**
 * Status and setup of the customer Telegram channel, called by SAIL (docs/architecture/57). Portal service principal only. Never returns a secret and never any message content.
 *   GET  -> { configured, bot, webhook, queue, links }
 *   POST { action: "register" | "disable" } -> points Telegram at the shared bot's webhook (with the derived secret), or removes it
 *   GET  ?connections=1[&check=1] -> every customer connection (workspace and personal bots) with counts, optionally each webhook's health; GET ?devices=<bot id|platform> -> who is connected
 *   POST { action: "disconnect_bot", botId, reason } | { action: "revoke_link", linkId, reason } -> the operator removes a connection or one phone; the owners are told
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { deleteWebhook, getMe, getWebhookInfo, productBot, setWebhook } from "@/lib/telegram/api"
import { devicesOnBot, listConnections, loadBot, operatorDisconnect, operatorRevokeLink, webhookUrlFor } from "@/lib/telegram/bots"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")

async function guard(): Promise<NextResponse | null> {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  if (g.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  return null
}

const staffOf = (req: NextRequest) => req.headers.get("x-portal-staff-email") ?? "staff"

export async function GET(req: NextRequest) {
  const denied = await guard(); if (denied) return denied
  const url = new URL(req.url)
  if (url.searchParams.has("devices")) {
    const id = url.searchParams.get("devices") ?? ""
    return NextResponse.json({ devices: /^[\w-]{1,24}$/.test(id) ? await devicesOnBot(id) : [] })
  }
  if (url.searchParams.has("connections")) {
    const rows = await listConnections()
    if (!url.searchParams.has("check")) return NextResponse.json({ connections: rows })
    const checked = await Promise.all(rows.slice(0, 40).map(async (c) => {
      try { const l = await loadBot(c.botId); if (!l) return { ...c, webhook: { ok: false, pending: 0, lastError: "The saved token cannot be read." } }
        const h = await getWebhookInfo(l.bot); return { ...c, webhook: { ok: h.url === webhookUrlFor(c.botId), pending: h.pending_update_count, lastError: h.last_error_message ?? null } }
      } catch { return { ...c, webhook: { ok: false, pending: 0, lastError: "Telegram could not be reached." } } }
    }))
    return NextResponse.json({ connections: [...checked, ...rows.slice(40).map((c) => ({ ...c, webhook: null }))] })
  }
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
  const b = await req.json().catch(() => ({}))
  if (b?.action === "disconnect_bot" || b?.action === "revoke_link") {
    const reason = String(b?.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
    if (reason.length < 5) return NextResponse.json({ error: "Give a reason of at least a few words: the workspace owners are shown it." }, { status: 400 })
    const by = staffOf(req)
    if (b.action === "disconnect_bot") {
      if (typeof b.botId !== "string" || !/^[\w-]{8,24}$/.test(b.botId)) return NextResponse.json({ error: "Unknown connection." }, { status: 400 })
      const r = await operatorDisconnect(b.botId, reason, by)
      if (!r) return NextResponse.json({ error: "That connection no longer exists." }, { status: 404 })
      await logAudit({ actorEmail: by, action: "telegram.operator_disconnect_bot", targetType: "telegram_bot", targetId: b.botId, metadata: { reason, devices: r.devices } })
      return NextResponse.json({ ok: true, devices: r.devices })
    }
    if (typeof b.linkId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.linkId)) return NextResponse.json({ error: "Unknown device." }, { status: 400 })
    if (!(await operatorRevokeLink(b.linkId, reason, by))) return NextResponse.json({ error: "That device is already disconnected." }, { status: 404 })
    await logAudit({ actorEmail: by, action: "telegram.operator_revoke_link", targetType: "telegram_link", targetId: b.linkId, metadata: { reason } })
    return NextResponse.json({ ok: true })
  }
  const bot = productBot()
  if (!bot) return NextResponse.json({ error: "The shared product bot is not configured (optional). Workspaces can connect a bot of their own in Anker, Connected channels." }, { status: 503 })
  try {
    if (b?.action === "register") { await setWebhook(bot, `${appUrl()}/api/telegram/webhook`); return NextResponse.json({ ok: true, url: `${appUrl()}/api/telegram/webhook` }) }
    if (b?.action === "disable") { await deleteWebhook(bot); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }) }
}
