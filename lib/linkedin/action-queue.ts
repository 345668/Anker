/**
 * li_action_queue — the outbound action pipeline.
 *
 * Lifecycle (see docs/scope-linkedin-outreach.md §4a):
 *
 *   enqueue ─▶ pending_approval ─┬─ approve ─▶ queued ─▶ claim ─▶ claimed ─▶ report ─▶ done|failed
 *                                └─ reject  ─▶ rejected  (terminal, never sent)
 *
 * The approval gate is enforced in SQL, not just UI: claimActions() selects
 * ONLY status='queued', so a 'pending_approval' row is invisible to the
 * extension. Nothing reaches LinkedIn without an approval flipping it to
 * 'queued' first.
 */
import "server-only"
import { sql } from "@/lib/db"
import {
  rowToAction,
  type LiAction,
  type ActionType,
  type ActionStatus,
  ACTION_TYPES,
} from "./types"

export interface EnqueueActionInput {
  actionType: ActionType
  targetUrl: string
  targetName?: string | null
  senderId?: string | null
  campaignId?: string | null
  memberId?: string | null
  crmEntryId?: string | null
  payload?: Record<string, unknown>
  scheduledFor?: string | null
  /** When true, the action is auto-approved on enqueue (full-auto campaigns). */
  autoApprove?: boolean
  approvedBy?: string | null
}

/** Create an action. Born 'pending_approval' unless autoApprove is set. */
export async function enqueueAction(userId: string, input: EnqueueActionInput): Promise<LiAction> {
  if (!ACTION_TYPES.includes(input.actionType)) throw new Error(`Invalid action_type: ${input.actionType}`)
  const targetUrl = String(input.targetUrl || "").trim()
  if (!targetUrl) throw new Error("targetUrl is required")

  const status: ActionStatus = input.autoApprove ? "queued" : "pending_approval"
  const approvedBy = input.autoApprove ? input.approvedBy ?? userId : null
  const approvedAt = input.autoApprove ? new Date().toISOString() : null

  const rows = (await sql`
    INSERT INTO li_action_queue
      (user_id, sender_id, campaign_id, member_id, crm_entry_id,
       target_name, target_url, action_type, payload, status,
       approved_by, approved_at, scheduled_for)
    VALUES
      (${userId}, ${input.senderId ?? null}, ${input.campaignId ?? null}, ${input.memberId ?? null},
       ${input.crmEntryId ?? null}, ${input.targetName ?? null}, ${targetUrl}, ${input.actionType},
       ${JSON.stringify(input.payload ?? {})}::jsonb, ${status},
       ${approvedBy}, ${approvedAt}, ${input.scheduledFor ?? null})
    RETURNING *
  `) as any[]
  return rowToAction(rows[0])
}

export interface ListActionsOpts {
  status?: ActionStatus | ActionStatus[]
  senderId?: string
  campaignId?: string
  limit?: number
}

/** List a user's actions, newest first. Used by the Review Queue + status views. */
export async function listActions(userId: string, opts: ListActionsOpts = {}): Promise<LiAction[]> {
  const statuses = opts.status ? (Array.isArray(opts.status) ? opts.status : [opts.status]) : null
  const limit = Math.max(1, Math.min(500, opts.limit ?? 200))

  const rows = (await sql`
    SELECT * FROM li_action_queue
    WHERE user_id = ${userId}
      AND (${statuses}::text[] IS NULL OR status = ANY(${statuses}::text[]))
      AND (${opts.senderId ?? null}::text IS NULL OR sender_id = ${opts.senderId ?? null})
      AND (${opts.campaignId ?? null}::text IS NULL OR campaign_id = ${opts.campaignId ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as any[]
  return rows.map(rowToAction)
}

/** Counts by status for the header/badges. */
export async function actionCounts(userId: string): Promise<Record<string, number>> {
  const rows = (await sql`
    SELECT status, COUNT(*)::int AS n FROM li_action_queue
    WHERE user_id = ${userId} GROUP BY status
  `) as any[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.status] = Number(r.n)
  return out
}

/**
 * Approve pending actions → 'queued' (the state the extension can claim).
 * Only 'pending_approval' rows owned by the user move; already-queued/terminal
 * rows are left untouched. Optionally overwrite the message payload (edit-before-approve).
 * Returns the number of rows actually approved.
 */
export async function approveActions(
  userId: string,
  ids: string[],
  approverId: string,
  editedMessage?: string,
): Promise<number> {
  if (!ids.length) return 0
  const rows = (await sql`
    UPDATE li_action_queue
    SET status = 'queued',
        approved_by = ${approverId},
        approved_at = now(),
        payload = CASE
          WHEN ${editedMessage ?? null}::text IS NULL THEN payload
          ELSE jsonb_set(payload, '{message}', to_jsonb(${editedMessage ?? null}::text), true)
        END,
        updated_at = now()
    WHERE user_id = ${userId}
      AND id = ANY(${ids}::text[])
      AND status = 'pending_approval'
    RETURNING id
  `) as any[]
  return rows.length
}

/** Reject pending actions → 'rejected' (terminal, never sent). */
export async function rejectActions(userId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const rows = (await sql`
    UPDATE li_action_queue
    SET status = 'rejected', updated_at = now()
    WHERE user_id = ${userId}
      AND id = ANY(${ids}::text[])
      AND status = 'pending_approval'
    RETURNING id
  `) as any[]
  return rows.length
}

export interface ClaimedAction {
  id: string
  actionType: ActionType
  targetUrl: string
  targetName: string | null
  senderId: string | null
  payload: Record<string, unknown>
}

/**
 * How long an action may sit 'claimed' without a report before we presume the
 * extension (its MV3 service worker) died mid-action and recover it.
 */
const CLAIM_TTL_MINUTES = 10
/** Max claim attempts before a repeatedly-stranded action is failed for good. */
const MAX_ATTEMPTS = 3

/**
 * Recover actions stuck in 'claimed' past the TTL — e.g. the extension crashed
 * or the service worker was terminated mid-action, so the result never came
 * back. Under the attempt cap they go back to 'queued' (retried on the next
 * poll); at/over the cap they're failed so a member never hangs forever.
 * Idempotent and cheap; safe to call on every claim + sequencer tick.
 */
export async function reclaimStaleActions(userId: string): Promise<{ requeued: number; failed: number }> {
  const failed = (await sql`
    UPDATE li_action_queue
    SET status = 'failed', failed_reason = 'claim_timeout (max attempts)',
        completed_at = now(), updated_at = now()
    WHERE user_id = ${userId} AND status = 'claimed'
      AND claimed_at < now() - make_interval(mins => ${CLAIM_TTL_MINUTES})
      AND attempts >= ${MAX_ATTEMPTS}
    RETURNING id
  `) as any[]

  const requeued = (await sql`
    UPDATE li_action_queue
    SET status = 'queued', claimed_at = NULL, claimed_by = NULL,
        failed_reason = NULL, updated_at = now()
    WHERE user_id = ${userId} AND status = 'claimed'
      AND claimed_at < now() - make_interval(mins => ${CLAIM_TTL_MINUTES})
      AND attempts < ${MAX_ATTEMPTS}
    RETURNING id
  `) as any[]

  return { requeued: requeued.length, failed: failed.length }
}

/**
 * Atomically claim up to `limit` QUEUED actions for the extension to execute.
 * Uses FOR UPDATE SKIP LOCKED so parallel polls never double-claim, and selects
 * ONLY status='queued' — the hard approval gate. Skips future-scheduled rows.
 * First recovers any actions stranded 'claimed' past the TTL (see above), so a
 * dead-service-worker action becomes claimable again on the next poll.
 */
export async function claimActions(
  userId: string,
  limit: number,
  claimedBy: string,
): Promise<ClaimedAction[]> {
  await reclaimStaleActions(userId).catch(() => {})
  const n = Math.max(1, Math.min(25, limit))
  const rows = (await sql`
    WITH pick AS (
      SELECT id FROM li_action_queue
      WHERE user_id = ${userId}
        AND status = 'queued'
        AND (scheduled_for IS NULL OR scheduled_for <= now())
      ORDER BY scheduled_for NULLS FIRST, created_at
      LIMIT ${n}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE li_action_queue q
    SET status = 'claimed', claimed_at = now(), claimed_by = ${claimedBy},
        attempts = q.attempts + 1, updated_at = now()
    FROM pick
    WHERE q.id = pick.id
    RETURNING q.id, q.action_type, q.target_url, q.target_name, q.sender_id, q.payload
  `) as any[]
  return rows.map((r) => ({
    id: r.id,
    actionType: r.action_type,
    targetUrl: r.target_url,
    targetName: r.target_name ?? null,
    senderId: r.sender_id ?? null,
    payload: r.payload ?? {},
  }))
}

/**
 * Report the outcome of a claimed action. ok → 'done', else → 'failed'.
 * Only affects rows the extension actually holds ('claimed'), owned by the user.
 * On success, stamps the sender's last_action_at. Returns the resolved status,
 * or null if the row wasn't found / wasn't claimed.
 */
export async function reportActionResult(
  userId: string,
  id: string,
  outcome: { ok: boolean; error?: string; result?: Record<string, unknown> },
): Promise<ActionStatus | null> {
  const rows = (await sql`
    UPDATE li_action_queue
    SET status = ${outcome.ok ? "done" : "failed"},
        completed_at = now(),
        failed_reason = ${outcome.ok ? null : outcome.error || "unknown"},
        result = ${outcome.result ? JSON.stringify(outcome.result) : null}::jsonb,
        updated_at = now()
    WHERE id = ${id} AND user_id = ${userId} AND status = 'claimed'
    RETURNING sender_id, status
  `) as any[]
  if (!rows.length) return null

  if (outcome.ok && rows[0].sender_id) {
    await sql`
      UPDATE linkedin_senders SET last_action_at = now(), updated_at = now()
      WHERE id = ${rows[0].sender_id} AND user_id = ${userId}
    `.catch(() => {})
  }
  return rows[0].status as ActionStatus
}
