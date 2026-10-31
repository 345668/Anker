import "server-only"
import { sql } from "@/lib/db"

/**
 * The prepaid AI credit ledger (docs/architecture/58 section 8). Dollars, beside the monthly allowance, never instead of it.
 *
 * HOW IT WORKS. The plan's monthly allowance is spent first. Spend BEYOND it in a month is covered from prepaid credit, taking from the grant that expires soonest. Nothing is debited on the hot
 * path of an AI call (that would add a write to every call): the gate asks "is there room?" by reading the balance, and `settle` turns the month's overage into debit rows every half hour (and
 * when asked). The two always agree:
 *     capacity = allowance limit + balance now + what has already been debited this month
 * because a debit moves a dollar from "balance" to "debited" without changing the sum, so the gate gives the same answer before and after settling.
 * An unlimited allowance (null) never uses credit. A grant that expires unused is closed by an `expiry` row, so what a customer lost is on the record. The ledger is append-only.
 */
export type Kind = "grant" | "debit" | "expiry" | "adjust"
export interface LedgerRow { id: number; kind: Kind; amountUsd: number; grantId: number | null; source: string | null; ref: string | null; expiresAt: string | null; period: string | null; reason: string | null; createdBy: string | null; createdAt: string }
const row = (r: any): LedgerRow => ({ id: Number(r.id), kind: r.kind, amountUsd: Number(r.amount_usd), grantId: r.grant_id == null ? null : Number(r.grant_id), source: r.source, ref: r.ref, expiresAt: r.expires_at, period: r.period, reason: r.reason, createdBy: r.created_by, createdAt: r.created_at })
export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
const MAX_GRANT_USD = 100_000
const round6 = (n: number) => Math.round(n * 1e6) / 1e6
export class CreditError extends Error { constructor(message: string, readonly status = 400) { super(message) } }

/** Dollars of unexpired credit left, and what this month's overage has already taken. Two small indexed reads. */
export async function prepaidOf(orgId: string, now = new Date()): Promise<{ balanceUsd: number; debitedThisMonthUsd: number }> {
  const [b] = (await sql`SELECT COALESCE(sum(l.amount_usd), 0)::float AS s FROM ai_credit_ledger l
      WHERE l.org_id = ${orgId} AND (l.kind = 'adjust' OR l.grant_id IN (SELECT id FROM ai_credit_ledger WHERE org_id = ${orgId} AND kind = 'grant' AND (expires_at IS NULL OR expires_at > ${now.toISOString()}))
        OR (l.kind = 'grant' AND (l.expires_at IS NULL OR l.expires_at > ${now.toISOString()})))`) as any[]
  const [d] = (await sql`SELECT COALESCE(-sum(amount_usd), 0)::float AS s FROM ai_credit_ledger WHERE org_id = ${orgId} AND kind = 'debit' AND period = ${monthKey(now)}`) as any[]
  return { balanceUsd: Math.max(0, round6(Number(b?.s ?? 0))), debitedThisMonthUsd: round6(Number(d?.s ?? 0)) }
}
/** What the gate adds to the plan's monthly limit. */
export async function capacityBonus(orgId: string, now = new Date()): Promise<number> { const p = await prepaidOf(orgId, now); return round6(p.balanceUsd + p.debitedThisMonthUsd) }

export async function grantCredit(i: { orgId: string; amountUsd: number; source: string; ref?: string | null; expiresAt?: Date | null; reason: string; by: string }): Promise<{ id: number; duplicate: boolean }> {
  const amt = round6(Number(i.amountUsd))
  if (!(amt > 0) || amt > MAX_GRANT_USD) throw new CreditError(`A grant is more than $0 and at most $${MAX_GRANT_USD.toLocaleString("en")}.`)
  if (!i.reason || i.reason.trim().length < 5) throw new CreditError("Give a reason of at least a few words.")
  if (i.expiresAt && !(i.expiresAt.getTime() > Date.now())) throw new CreditError("The expiry must be in the future.")
  const ref = i.ref ? String(i.ref).slice(0, 120) : null
  const [r] = (await sql`INSERT INTO ai_credit_ledger (org_id, kind, amount_usd, source, ref, expires_at, reason, created_by) VALUES (${i.orgId}, 'grant', ${amt}, ${i.source.slice(0, 40)}, ${ref}, ${i.expiresAt ? i.expiresAt.toISOString() : null}, ${i.reason.trim().slice(0, 300)}, ${i.by.slice(0, 120)})
    ON CONFLICT (org_id, source, ref) WHERE kind = 'grant' AND ref IS NOT NULL DO NOTHING RETURNING id`) as any[]
  if (r) return { id: Number(r.id), duplicate: false }
  const [again] = (await sql`SELECT id FROM ai_credit_ledger WHERE org_id = ${i.orgId} AND kind = 'grant' AND source = ${i.source.slice(0, 40)} AND ref = ${ref}`) as any[]
  return { id: Number(again.id), duplicate: true }
}
/** A signed correction by a person (a refund, a mistake). Never takes the balance below zero. */
export async function adjustCredit(i: { orgId: string; amountUsd: number; reason: string; by: string }, now = new Date()): Promise<void> {
  const amt = round6(Number(i.amountUsd))
  if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > MAX_GRANT_USD) throw new CreditError("An adjustment is a non-zero amount of at most $100,000.")
  if (!i.reason || i.reason.trim().length < 5) throw new CreditError("Give a reason of at least a few words.")
  if (amt < 0 && (await prepaidOf(i.orgId, now)).balanceUsd + amt < 0) throw new CreditError("That would take the balance below zero.")
  await sql`INSERT INTO ai_credit_ledger (org_id, kind, amount_usd, reason, created_by) VALUES (${i.orgId}, 'adjust', ${amt}, ${i.reason.trim().slice(0, 300)}, ${i.by.slice(0, 120)})`
}

/** Grants that still hold something, soonest-expiring first (never-expiring last): the order credit is spent in. */
async function openGrants(orgId: string, now: Date): Promise<Array<{ id: number; left: number }>> {
  const rows = (await sql`SELECT g.id, (g.amount_usd + COALESCE((SELECT sum(c.amount_usd) FROM ai_credit_ledger c WHERE c.grant_id = g.id), 0))::float AS left
      FROM ai_credit_ledger g WHERE g.org_id = ${orgId} AND g.kind = 'grant' AND (g.expires_at IS NULL OR g.expires_at > ${now.toISOString()}) ORDER BY g.expires_at ASC NULLS LAST, g.id ASC`) as any[]
  return rows.map((r) => ({ id: Number(r.id), left: round6(Number(r.left)) })).filter((g) => g.left > 0.000001)
}

/** Turns this month's overage (spend beyond the plan's limit) into debits against the soonest-expiring grants. Idempotent: it takes only what has not been taken yet. */
export async function settle(orgId: string, limitUsd: number | null, spentUsd: number, now = new Date()): Promise<{ debited: number; uncovered: number }> {
  if (limitUsd === null) return { debited: 0, uncovered: 0 }
  const period = monthKey(now), over = round6(Math.max(0, spentUsd - limitUsd))
  const [d] = (await sql`SELECT COALESCE(-sum(amount_usd), 0)::float AS s FROM ai_credit_ledger WHERE org_id = ${orgId} AND kind = 'debit' AND period = ${period}`) as any[]
  let need = round6(over - Number(d?.s ?? 0)), taken = 0
  for (const g of need > 0 ? await openGrants(orgId, now) : []) {
    const take = round6(Math.min(g.left, need)); if (take <= 0) continue
    await sql`INSERT INTO ai_credit_ledger (org_id, kind, amount_usd, grant_id, period, reason) VALUES (${orgId}, 'debit', ${-take}, ${g.id}, ${period}, 'Spend beyond the monthly allowance')`
    need = round6(need - take); taken = round6(taken + take); if (need <= 0) break
  }
  return { debited: taken, uncovered: Math.max(0, need) }
}
/** Closes every grant past its expiry with what is left of it. */
export async function expireDue(now = new Date()): Promise<number> {
  const rows = (await sql`SELECT g.id, g.org_id, (g.amount_usd + COALESCE((SELECT sum(c.amount_usd) FROM ai_credit_ledger c WHERE c.grant_id = g.id), 0))::float AS left
      FROM ai_credit_ledger g WHERE g.kind = 'grant' AND g.expires_at IS NOT NULL AND g.expires_at <= ${now.toISOString()}
        AND NOT EXISTS (SELECT 1 FROM ai_credit_ledger e WHERE e.grant_id = g.id AND e.kind = 'expiry') LIMIT 500`) as any[]
  let n = 0
  for (const r of rows) {
    const left = round6(Number(r.left)); const [done] = (await sql`INSERT INTO ai_credit_ledger (org_id, kind, amount_usd, grant_id, reason) SELECT ${String(r.org_id)}, 'expiry', ${-left}, ${Number(r.id)}, 'The grant expired' WHERE ${left} > 0.000001 AND NOT EXISTS (SELECT 1 FROM ai_credit_ledger e WHERE e.grant_id = ${Number(r.id)} AND e.kind = 'expiry') RETURNING id`) as any[]
    if (done) n++
  }
  return n
}
/** The date the soonest-expiring grant that still holds credit runs out, or null (nothing held, or only credit that never expires). */
export async function nextExpiry(orgId: string, now = new Date()): Promise<string | null> {
  const gs = (await openGrants(orgId, now)), ids = gs.map((g) => g.id)
  if (!ids.length) return null
  const [r] = (await sql`SELECT min(expires_at) AS t FROM ai_credit_ledger WHERE id = ANY(${ids}) AND expires_at IS NOT NULL`) as any[]
  return r?.t ? new Date(r.t).toISOString().slice(0, 10) : null
}
export async function ledgerOf(orgId: string, limit = 100): Promise<LedgerRow[]> {
  return ((await sql`SELECT * FROM ai_credit_ledger WHERE org_id = ${orgId} ORDER BY id DESC LIMIT ${Math.min(500, Math.max(1, limit))}`) as any[]).map(row)
}
/** Settles every workspace that holds credit: expiry first, then the month's overage. Called by the half-hourly usage cron. */
export async function settleAll(spentOf: (orgId: string) => Promise<{ limit: number | null; spent: number }>, now = new Date()): Promise<{ expired: number; workspaces: number; debited: number }> {
  const expired = await expireDue(now)
  const orgs = (await sql`SELECT DISTINCT org_id FROM ai_credit_ledger WHERE kind = 'grant' LIMIT 1000`) as any[]
  let debited = 0
  for (const o of orgs) { try { const { limit, spent } = await spentOf(String(o.org_id)); debited += (await settle(String(o.org_id), limit, spent, now)).debited } catch (e) { console.error("[credits] settle failed:", (e as Error)?.message) } }
  return { expired, workspaces: orgs.length, debited: round6(debited) }
}
