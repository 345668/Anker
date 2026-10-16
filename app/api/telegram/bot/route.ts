/**
 * A workspace's own Telegram bot (docs/architecture/57 section 19). Workspace owner or admin only; the workspace comes from the session.
 *   GET    -> { gate, bot: { username, connectedAt, webhookOk, pending, lastError } | null }
 *   POST   { token } -> checks the token with Telegram, saves it encrypted, registers the webhook. The token is never returned.
 *   DELETE -> removes the webhook, disconnects every device on this bot, deletes the token.
 */
import { NextResponse } from "next/server"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { BotError, connectBot, disconnectBot, ownBotStatus } from "@/lib/telegram/bots"
import { gate } from "@/lib/telegram/runtime"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30
const noStore = { "Cache-Control": "private, no-store" }

async function manager() {
  const p = await requireAiPrincipal()
  if (!p.orgId) throw new WorkspaceError("Telegram connects to a company or fund workspace.", 400)
  if (!["workspace_owner", "admin"].includes(p.membership?.orgRole ?? "")) throw new WorkspaceError("Only a workspace owner or admin can connect a bot.", 403)
  return p as typeof p & { orgId: string }
}
const asWorkspaceError = (e: unknown) => e instanceof BotError ? new WorkspaceError(e.message, e.status) : e

export async function GET() {
  try {
    const p = await manager()
    return NextResponse.json({ gate: await gate({ org_id: p.orgId }), bot: await ownBotStatus(p.orgId).then((s) => s && { username: s.bot.username, connectedAt: s.bot.createdAt, webhookOk: s.webhookOk, pending: s.pending, lastError: s.lastError }) }, { headers: noStore })
  } catch (e) { return workspaceError(asWorkspaceError(e)) }
}

export async function POST(req: Request) {
  try {
    const p = await manager()
    const refusal = await gate({ org_id: p.orgId }); if (refusal) throw new WorkspaceError(refusal, 403)
    const b = await req.json().catch(() => ({}))
    const bot = await connectBot(p.orgId, p.userId, String(b?.token ?? ""))
    await logAudit({ actorId: p.userId, action: "telegram.bot_connected", targetType: "workspace", targetId: p.orgId, metadata: { bot: bot.username } })
    return NextResponse.json({ ok: true, username: bot.username }, { headers: noStore })
  } catch (e) { return workspaceError(asWorkspaceError(e)) }
}

export async function DELETE() {
  try {
    const p = await manager()
    const removed = await disconnectBot(p.orgId, p.userId)
    if (!removed) throw new WorkspaceError("This workspace has no bot of its own.", 404)
    await logAudit({ actorId: p.userId, action: "telegram.bot_disconnected", targetType: "workspace", targetId: p.orgId, metadata: {} })
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (e) { return workspaceError(asWorkspaceError(e)) }
}
