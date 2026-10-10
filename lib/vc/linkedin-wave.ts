/**
 * LinkedIn for the first wave (docs/architecture/50 §9.2). LinkedIn does not allow a message to a stranger but does allow a connection request with a note of up to 300
 * characters, which is the length of the drafted LinkedIn message. Each saved message becomes a connection request in the Review Queue, pending approval, never auto-approved.
 */
import { sql } from "@/lib/db"
import { enqueueAction as realEnqueue } from "@/lib/linkedin/action-queue"
export const LI_PER_REQUEST = 25,
  NOTE_MAX = 300
export interface LiScope {
  orgId: string
  userId: string
}
export interface LiResult {
  queued: number
  skipped: Array<{ name: string; reason: string }>
}
const READY = `FROM crm_entries e JOIN outreach_messages m ON m.crm_entry_id = e.id AND m.kind = 'dm_intro' AND m.channel = 'linkedin' AND m.status = 'draft'
  WHERE e.org_id = $1 AND m.user_id = $2 AND e.source = 'lp_matching' AND e.display_linkedin LIKE '%linkedin.com/%'
    AND NOT EXISTS (SELECT 1 FROM li_action_queue q WHERE q.crm_entry_id = e.id AND q.user_id = $2 AND q.action_type = 'connect_request' AND q.status NOT IN ('rejected','skipped','failed'))`
/** How many saved LinkedIn messages are ready to queue, and how many are already waiting in the Review Queue. */
export async function linkedinCounts(scope: LiScope): Promise<{ ready: number; pending: number }> {
  const [r] = (await sql.unsafe(`SELECT count(*)::int AS n ${READY}`, [scope.orgId, scope.userId])) as any[]
  const [p] =
    (await sql`SELECT count(*)::int AS n FROM li_action_queue q JOIN crm_entries e ON e.id = q.crm_entry_id WHERE e.org_id = ${scope.orgId} AND q.user_id = ${scope.userId} AND q.action_type = 'connect_request' AND q.status = 'pending_approval'`) as any[]
  return { ready: Number(r?.n ?? 0), pending: Number(p?.n ?? 0) }
}
export async function queueLinkedIn(
  scope: LiScope,
  want = LI_PER_REQUEST,
  enqueue: typeof realEnqueue = realEnqueue,
): Promise<LiResult> {
  const n = Math.max(1, Math.min(LI_PER_REQUEST, Math.floor(want) || LI_PER_REQUEST))
  const rows = (await sql.unsafe(
    `SELECT e.id, e.display_name, e.display_linkedin, m.body ${READY} ORDER BY e.display_score DESC NULLS LAST, m.created_at LIMIT ${n}`,
    [scope.orgId, scope.userId],
  )) as any[]
  let s: any = null
  try {
    s = (
      (await sql`SELECT id FROM linkedin_senders WHERE user_id = ${scope.userId} AND status IN ('active','warming') ORDER BY created_at LIMIT 1`) as any[]
    )[0]
  } catch {
    /* no LinkedIn sender set up yet: the actions wait without one */
  }
  const out: LiResult = { queued: 0, skipped: [] }
  for (const r of rows) {
    const note = String(r.body ?? "").trim()
    if (!note) {
      out.skipped.push({ name: r.display_name ?? "A contact", reason: "the message is empty" })
      continue
    }
    if (note.length > NOTE_MAX) {
      out.skipped.push({
        name: r.display_name ?? "A contact",
        reason: `the message is ${note.length} characters; a connection note is at most ${NOTE_MAX}`,
      })
      continue
    }
    try {
      // Born pending approval: the Review Queue is where a person approves, and approval is what makes it claimable by the extension.
      await enqueue(scope.userId, {
        actionType: "connect_request",
        targetUrl: String(r.display_linkedin),
        targetName: r.display_name ?? null,
        crmEntryId: String(r.id),
        senderId: s?.id ?? null,
        payload: { message: note, source: "raise-path" },
      })
      out.queued++
    } catch (e: any) {
      out.skipped.push({ name: r.display_name ?? "A contact", reason: String(e?.message ?? e).slice(0, 80) })
    }
  }
  return out
}
