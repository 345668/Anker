/**
 * GET  /api/telegram/links  -> the signed-in person's Telegram devices in the active workspace (and every device, for an owner or admin), plus whether the channel is available.
 * POST /api/telegram/links  { action: "code" } -> a single-use link code and the t.me address to open on the phone.
 * Docs/architecture/57 section 4. The person and the workspace come from the session, never from the request.
 */
import { NextResponse } from "next/server"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { botForOrg, ownBotOf } from "@/lib/telegram/bots"
import { createLinkCode, listLinks, getPrefs, CODE_TTL_MIN } from "@/lib/telegram/links"
import { botUsername, gate } from "@/lib/telegram/runtime"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const noStore = { "Cache-Control": "private, no-store" }
const mgr = (p: Awaited<ReturnType<typeof requireAiPrincipal>>) => ["workspace_owner", "admin"].includes(p.membership?.orgRole ?? "")

export async function GET() {
  try {
    const p = await requireAiPrincipal()
    if (!p.orgId) return NextResponse.json({ available: false, reason: "Telegram connects to a company or fund workspace.", links: [] }, { headers: noStore })
    const route = await botForOrg(p.orgId), own = await ownBotOf(p.orgId)
    const reason = route ? await gate({ org_id: p.orgId }) : mgr(p) ? "Connect a Telegram bot of your own below to use Telegram." : "Telegram is not set up for this workspace yet. A workspace owner can connect a bot."
    const links = await listLinks(p.userId, p.orgId, mgr(p))
    const prefs = await getPrefs(links.filter((l) => l.user_id === p.userId).map((l) => l.id))
    return NextResponse.json({ available: !reason, reason, bot: route ? (route.username ?? await botUsername(route.bot)) : null, botKind: route ? (route.own ? "own" : "shared") : null, ownBot: own ? { username: own.username, connectedAt: own.createdAt } : null, canManageBot: mgr(p), canManageAll: mgr(p), canWrite: p.canWrite, me: p.userId, ttlMinutes: CODE_TTL_MIN, links: links.map((l) => ({ id: l.id, userId: l.user_id, mine: l.user_id === p.userId, username: l.telegram_username, mode: l.mode, status: l.status, linkedAt: l.linked_at, lastSeenAt: l.last_seen_at, prefs: prefs[l.id] ?? { approvals: false, replies: false, deadlines: false, voiceReplies: false, dailyBrief: false } })) }, { headers: noStore })
  } catch (e) { return workspaceError(e) }
}

export async function POST(req: Request) {
  try {
    const p = await requireAiPrincipal()
    const b = await req.json().catch(() => ({}))
    if (b?.action !== "code") throw new WorkspaceError("Unknown action.", 400)
    if (!p.orgId) throw new WorkspaceError("Telegram connects to a company or fund workspace.", 400)
    const route = await botForOrg(p.orgId); if (!route) throw new WorkspaceError("Telegram has not been set up for this workspace yet.", 503)
    const refusal = await gate({ org_id: p.orgId }); if (refusal) throw new WorkspaceError(refusal, 403)
    const username = route.username ?? await botUsername(route.bot); if (!username) throw new WorkspaceError("Telegram could not be reached. Try again in a moment.", 503)
    const { code, expiresAt } = await createLinkCode(p.userId, p.orgId, route.bot.id)
    await logAudit({ actorId: p.userId, action: "telegram.link_code_created", targetType: "workspace", targetId: p.orgId, metadata: {} })
    return NextResponse.json({ url: `https://t.me/${username}?start=${code}`, expiresAt, ttlMinutes: CODE_TTL_MIN }, { headers: noStore })
  } catch (e) { return workspaceError(e) }
}
