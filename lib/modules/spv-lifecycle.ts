import { sql } from "@/lib/db"
import type { Spv } from "@/lib/modules/carta-modules"

/**
 * SPV lifecycle — the subscription book behind each SPV and the stage machine
 * that drives it. Subscriptions past 'invited' (and not 'declined') roll up into
 * spvs.committed_amount, so the vehicle's committed total is always derived, not
 * hand-typed.
 */

const num = (v: any) => (v == null ? 0 : Number(v))

// ── SPV read ─────────────────────────────────────────────────────────────────
function normSpv(r: any): Spv {
  return {
    id: r.id, name: r.name, deal_name: r.deal_name ?? null,
    target_amount: num(r.target_amount), committed_amount: num(r.committed_amount),
    stage: r.stage, lead: r.lead ?? null,
    close_date: r.close_date ? String(r.close_date) : null, created_at: String(r.created_at),
  }
}

export async function getSpv(userId: string, id: string): Promise<Spv | null> {
  const rows = await sql`SELECT * FROM spvs WHERE id = ${id} AND created_by = ${userId} LIMIT 1`
  return rows[0] ? normSpv(rows[0]) : null
}

export type SpvStage = "forming" | "open" | "closed" | "wound_down"

export async function setSpvStage(userId: string, id: string, stage: SpvStage): Promise<Spv | null> {
  // Setting an SPV to 'closed' stamps a close date if one isn't set yet.
  const rows = await sql`
    UPDATE spvs
    SET stage = ${stage},
        close_date = CASE WHEN ${stage} = 'closed' AND close_date IS NULL THEN CURRENT_DATE ELSE close_date END,
        updated_at = now()
    WHERE id = ${id} AND created_by = ${userId}
    RETURNING *`
  return rows[0] ? normSpv(rows[0]) : null
}

// ── Subscriptions ────────────────────────────────────────────────────────────
export const SPV_SUB_STATUSES = ["invited", "committed", "signed", "funded", "declined"] as const
export type SpvSubStatus = (typeof SPV_SUB_STATUSES)[number]

export interface SpvSubscription {
  id: string
  spv_id: string
  investor_name: string
  investor_email: string | null
  amount: number
  status: SpvSubStatus
  subscribed_at: string | null
  created_at: string
}

function normSub(r: any): SpvSubscription {
  return {
    id: r.id, spv_id: r.spv_id, investor_name: r.investor_name, investor_email: r.investor_email ?? null,
    amount: num(r.amount), status: r.status,
    subscribed_at: r.subscribed_at ? String(r.subscribed_at) : null, created_at: String(r.created_at),
  }
}

/** committed_amount = everything that has progressed past 'invited' and hasn't
 *  declined. Recomputed after any subscription change so the SPV total is live. */
async function recomputeCommitted(spvId: string): Promise<void> {
  await sql`
    UPDATE spvs SET committed_amount = COALESCE((
      SELECT SUM(amount) FROM spv_subscriptions
      WHERE spv_id = ${spvId} AND status IN ('committed', 'signed', 'funded')
    ), 0), updated_at = now()
    WHERE id = ${spvId}`
}

/** Guard: confirm the SPV belongs to the user before touching its book. */
async function ownsSpv(userId: string, spvId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM spvs WHERE id = ${spvId} AND created_by = ${userId} LIMIT 1`
  return !!rows[0]
}

export async function listSubscriptions(spvId: string): Promise<SpvSubscription[]> {
  const rows = await sql`SELECT * FROM spv_subscriptions WHERE spv_id = ${spvId} ORDER BY amount DESC NULLS LAST, created_at DESC`
  return rows.map(normSub)
}

export async function addSubscription(input: {
  userId: string; spvId: string; investorName: string; investorEmail?: string | null
  amount?: number; status?: SpvSubStatus; subscribedAt?: string | null
}): Promise<SpvSubscription | null> {
  if (!(await ownsSpv(input.userId, input.spvId))) return null
  const rows = await sql`
    INSERT INTO spv_subscriptions (spv_id, investor_name, investor_email, amount, status, subscribed_at)
    VALUES (${input.spvId}, ${input.investorName.trim()}, ${input.investorEmail ?? null},
            ${input.amount ?? 0}, ${input.status ?? "invited"}, ${input.subscribedAt ?? null}::date)
    RETURNING *`
  await recomputeCommitted(input.spvId)
  return normSub(rows[0])
}

export async function updateSubscription(input: {
  userId: string; spvId: string; subId: string
  amount?: number | null; status?: SpvSubStatus | null; investorEmail?: string | null; subscribedAt?: string | null
}): Promise<SpvSubscription | null> {
  if (!(await ownsSpv(input.userId, input.spvId))) return null
  const rows = await sql`
    UPDATE spv_subscriptions SET
      amount        = COALESCE(${input.amount ?? null}, amount),
      status        = COALESCE(${input.status ?? null}, status),
      investor_email = COALESCE(${input.investorEmail ?? null}, investor_email),
      subscribed_at = COALESCE(${input.subscribedAt ?? null}::date, subscribed_at),
      updated_at    = now()
    WHERE id = ${input.subId} AND spv_id = ${input.spvId}
    RETURNING *`
  await recomputeCommitted(input.spvId)
  return rows[0] ? normSub(rows[0]) : null
}

export async function removeSubscription(userId: string, spvId: string, subId: string): Promise<boolean> {
  if (!(await ownsSpv(userId, spvId))) return false
  await sql`DELETE FROM spv_subscriptions WHERE id = ${subId} AND spv_id = ${spvId}`
  await recomputeCommitted(spvId)
  return true
}

// ── Rollup + funnel ──────────────────────────────────────────────────────────
export interface SpvFunnelStage { status: Exclude<SpvSubStatus, "declined">; count: number; amount: number }
export interface SpvRollup {
  investors: number
  committed: number
  funded: number
  target: number
  pct_subscribed: number | null
  funnel: SpvFunnelStage[]
}

export async function getSpvRollup(spvId: string, target: number): Promise<SpvRollup> {
  const rows = await sql`
    SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS amount
    FROM spv_subscriptions WHERE spv_id = ${spvId} GROUP BY status`
  const by: Record<string, { count: number; amount: number }> = {}
  for (const r of rows as any[]) by[r.status] = { count: Number(r.count ?? 0), amount: Number(r.amount ?? 0) }
  const ORDER: SpvFunnelStage["status"][] = ["invited", "committed", "signed", "funded"]
  const funnel = ORDER.map((status) => ({ status, count: by[status]?.count ?? 0, amount: by[status]?.amount ?? 0 }))
  const committed = (by.committed?.amount ?? 0) + (by.signed?.amount ?? 0) + (by.funded?.amount ?? 0)
  const funded = by.funded?.amount ?? 0
  const investors = Object.entries(by).filter(([s]) => s !== "declined").reduce((n, [, v]) => n + v.count, 0)
  return {
    investors, committed, funded, target,
    pct_subscribed: target > 0 ? Math.round((committed / target) * 1000) / 1000 : null,
    funnel,
  }
}
