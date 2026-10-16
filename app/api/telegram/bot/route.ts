/**
 * Own Telegram bots (docs/architecture/57 sections 19 and 20). The workspace and the person come from the session.
 *   GET    -> { gate, canManageWorkspace, personal, workspace, others }   each bot: { id, username, connectedAt, webhookOk, pending, lastError } or null
 *   POST   { scope: "personal" | "workspace", token } -> checks the token with Telegram, saves it encrypted, registers the webhook. The token is never returned.
 *          A personal bot: any member who may use the channel. The workspace bot: an owner or admin.
 *   DELETE { scope: "personal" | "workspace" } or { botId } (owner or admin: any bot of the workspace) -> removes the webhook, disconnects the devices on it, deletes the token.
 */
import { NextResponse } from "next/server"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { BotError, botStatus, botsOfOrg, connectBot, disconnectBot, ownBotOf, personalBotOf } from "@/lib/telegram/bots"
import { gate } from "@/lib/telegram/runtime"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30
const noStore = { "Cache-Control": "private, no-store" }

async function who() {
  const p = await requireAiPrincipal()
  if (!p.orgId) throw new WorkspaceError("Telegram connects to a company or fund workspace.", 400)
  return { p: p as typeof p & { orgId: string }, manager: ["workspace_owner", "admin"].includes(p.membership?.orgRole ?? "") }
}
const asWorkspaceError = (e: unknown) => e instanceof BotError ? new WorkspaceError(e.message, e.status) : e
const shape = (s: Awaited<ReturnType<typeof botStatus>>) => s && { id: s.bot.id, username: s.bot.username, connectedAt: s.bot.createdAt, webhookOk: s.webhookOk, pending: s.pending, lastError: s.lastError }

export async function GET() {
  try {
    const { p, manager } = await who()
    const others = manager ? (await botsOfOrg(p.orgId)).filter((b) => b.userId && b.userId !== p.userId).map((b) => ({ id: b.id, username: b.username, userId: b.userId, connectedAt: b.createdAt })) : []
    return NextResponse.json({
      gate: await gate({ org_id: p.orgId }), canManageWorkspace: manager,
      personal: shape(await botStatus(await personalBotOf(p.orgId, p.userId))),
      workspace: shape(await botStatus(await ownBotOf(p.orgId))), others,
    }, { headers: noStore })
  } catch (e) { return workspaceError(asWorkspaceError(e)) }
}

export async function POST(req: Request) {
  try {
    const { p, manager } = await who()
    const b = await req.json().catch(() => ({}))
    const scope = b?.scope === "workspace" ? "workspace" : "personal"
    if (scope === "workspace" && !manager) throw new WorkspaceError("Only a workspace owner or admin can connect the workspace bot. You can connect a bot of your own instead.", 403)
    const refusal = await gate({ org_id: p.orgId }); if (refusal) throw new WorkspaceError(refusal, 403)
    const bot = await connectBot(p.orgId, p.userId, String(b?.token ?? ""), undefined, scope)
    await logAudit({ actorId: p.userId, action: "telegram.bot_connected", targetType: "workspace", targetId: p.orgId, metadata: { bot: bot.username, scope } })
    return NextResponse.json({ ok: true, username: bot.username }, { headers: noStore })
  } catch (e) { return workspaceError(asWorkspaceError(e)) }
}

export async function DELETE(req: Request) {
  try {
    const { p, manager } = await who()
    const b = await req.json().catch(() => ({}))
    let target: Parameters<typeof disconnectBot>[2]
    if (typeof b?.botId === "string") { if (!manager) throw new WorkspaceError("Only a workspace owner or admin can disconnect someone else's bot.", 403); target = { botId: b.botId } }
    else if (b?.scope === "workspace") { if (!manager) throw new WorkspaceError("Only a workspace owner or admin can disconnect the workspace bot.", 403); target = { scope: "workspace" } }
    else target = { scope: "personal", userId: p.userId }
    if (!(await disconnectBot(p.orgId, p.userId, target))) throw new WorkspaceError("There is no such bot in this workspace.", 404)
    await logAudit({ actorId: p.userId, action: "telegram.bot_disconnected", targetType: "workspace", targetId: p.orgId, metadata: { scope: "botId" in target ? "other" : target.scope } })
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (e) { return workspaceError(asWorkspaceError(e)) }
}
