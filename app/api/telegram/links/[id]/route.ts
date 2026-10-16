/**
 * POST /api/telegram/links/:id  { action: "confirm" | "revoke" | "reactivate" }
 * Approving a new device, disconnecting one, or approving an idle one again (docs/architecture/57 section 4). A device can be approved only by the person it was made for.
 */
import { NextResponse } from "next/server"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { confirmLink, reactivateLink, revokeLink, setMode, setPrefs } from "@/lib/telegram/links"
import { productBot, sendMessage } from "@/lib/telegram/api"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const p = await requireAiPrincipal()
    const { id } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new WorkspaceError("Unknown device.", 404)
    const b = await req.json().catch(() => ({}))
    const bot = productBot()
    if (b?.action === "confirm" || b?.action === "reactivate") {
      const l = b.action === "confirm" ? await confirmLink(id, p.userId) : await reactivateLink(id, p.userId)
      if (!l || l.org_id !== p.orgId) throw new WorkspaceError("This device is not waiting for your approval.", 404)
      await logAudit({ actorId: p.userId, action: `telegram.link_${b.action === "confirm" ? "approved" : "reactivated"}`, targetType: "workspace", targetId: l.org_id, metadata: { link: l.id } })
      if (bot) await sendMessage(bot, Number(l.chat_id), "Connected. You can now ask me about your workspace. Send /help to see what I can do.").catch(() => {})
      return NextResponse.json({ ok: true })
    }
    if (b?.action === "mode") {
      const mode = b.mode === "write" ? "write" : "read"
      // A device may be allowed to propose changes only for a person who can write in the workspace, and never for an LP or a read-only seat.
      if (mode === "write" && !p.canWrite) throw new WorkspaceError("You can't make changes in this workspace, so this device stays read-only.", 403)
      const l = await setMode(id, p.userId, mode)
      if (!l || l.org_id !== p.orgId) throw new WorkspaceError("Device not found.", 404)
      await logAudit({ actorId: p.userId, action: "telegram.link_mode", targetType: "workspace", targetId: l.org_id, metadata: { link: l.id, mode } })
      if (bot) await sendMessage(bot, Number(l.chat_id), mode === "write" ? "I may now propose changes. You approve each one with a tap. I never send anything to other people from here." : "This device is read-only again.").catch(() => {})
      return NextResponse.json({ ok: true })
    }
    if (b?.action === "prefs") {
      const ok = await setPrefs(id, p.userId, p.orgId ?? "", { approvals: b.approvals === true, replies: b.replies === true, deadlines: b.deadlines === true, voiceReplies: b.voiceReplies === true, dailyBrief: b.dailyBrief === true })
      if (!ok) throw new WorkspaceError("Device not found.", 404)
      await logAudit({ actorId: p.userId, action: "telegram.link_prefs", targetType: "workspace", targetId: p.orgId ?? "", metadata: { link: id } })
      return NextResponse.json({ ok: true })
    }
    if (b?.action === "revoke") {
      const l = await revokeLink(id, p.userId, { userId: p.userId, orgId: p.orgId, isOwnerOrAdmin: ["workspace_owner", "admin"].includes(p.membership?.orgRole ?? "") })
      if (!l) throw new WorkspaceError("Device not found.", 404)
      await logAudit({ actorId: p.userId, action: "telegram.link_revoked", targetType: "workspace", targetId: l.org_id, metadata: { link: l.id, own: l.user_id === p.userId } })
      if (bot) await sendMessage(bot, Number(l.chat_id), "This device was disconnected from Anker.").catch(() => {})
      return NextResponse.json({ ok: true })
    }
    throw new WorkspaceError("Unknown action.", 400)
  } catch (e) { return workspaceError(e) }
}
