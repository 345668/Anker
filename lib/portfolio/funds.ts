/**
 * Funds + LP-membership CRUD.
 *
 * Two tables, both keyed to a fund: the fund itself + its LPs.  Capital
 * calls (next migration) will read fund_lps to know who to email and how
 * much to ask each of them for.
 *
 *   funds        — listFunds, getFundById, getFundBySlug, createFund,
 *                  updateFund, deleteFund + getFundLpRollup
 *   fund_lps     — listLps, getLpById, createLp, updateLp, deleteLp,
 *                  recomputeOwnershipPcts
 *
 * Convention mirrors lib/portfolio/queries.ts:
 *  - all writes return canonical post-write row via RETURNING + normalize()
 *  - decimal columns come back from pg as strings; we coerce to number on
 *    the way out
 */

import { sql } from "@/lib/db"
import { slugify, ensureUniqueSlug } from "@/lib/newsroom/slug"

// ── shared types ────────────────────────────────────────────────────────

export const FUND_STATUSES = ["fundraising", "active", "harvesting", "closed"] as const
export type FundStatus = (typeof FUND_STATUSES)[number]

export const LP_TYPES = ["family_office", "institutional", "hnwi", "corporate", "fund_of_funds"] as const
export type LpType = (typeof LP_TYPES)[number]

export const LP_STATUSES = ["committed", "fully_called", "defaulted", "transferred"] as const
export type LpStatus = (typeof LP_STATUSES)[number]

export interface FundFull {
  id: string
  slug: string
  name: string
  description: string | null
  vintage_year: number | null
  target_size: number | null
  currency: string
  management_fee_pct: number | null
  carry_pct: number | null
  term_years: number | null
  investment_period_years: number | null
  status: FundStatus
  manager_org: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface FundLpFull {
  id: string
  fund_id: string
  lp_contact_id: string | null
  lp_name: string
  lp_type: LpType | null
  commitment_amount: number | null
  called_amount: number
  distributed_amount: number
  ownership_pct: number | null
  signed_at: string | null
  status: LpStatus
  notes: string | null
  metadata: Record<string, any>
  /** Joined from contacts when lp_contact_id is set. Null when unattached
   *  or when the contact row has no email. Surfaced in the LP table so
   *  an operator can see at a glance whether send-notice will resolve. */
  contact_email: string | null
  contact_first_name: string | null
  contact_last_name: string | null
  created_at: string
  updated_at: string
}

export interface FundLpRollup {
  total_lps: number
  total_committed: number
  total_called: number
  total_distributed: number
  uncalled_remaining: number
  /** Sum of commitments / target_size (rounded to 4dp). null when target_size missing. */
  pct_subscribed: number | null
}

// ── funds: read ─────────────────────────────────────────────────────────

export async function listFunds(): Promise<FundFull[]> {
  const rows = await sql`
    SELECT * FROM funds
     ORDER BY
       CASE status
         WHEN 'active'      THEN 1
         WHEN 'fundraising' THEN 2
         WHEN 'harvesting'  THEN 3
         WHEN 'closed'      THEN 4
       END,
       COALESCE(vintage_year, 9999) DESC,
       name ASC
  `
  return rows.map(normalizeFund)
}

export async function getFundById(id: string): Promise<FundFull | null> {
  // funds.id is a TEXT column (not uuid). Do NOT cast the parameter to ::uuid
  // here — that produces 'operator does not exist: text = uuid' (Postgres
  // 42883) and 500s the fund page, since the bound text param would be cast to
  // uuid while the column stays text. Plain text = text comparison is correct.
  const rows = await sql`SELECT * FROM funds WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalizeFund(rows[0]) : null
}

export async function getFundBySlug(slug: string): Promise<FundFull | null> {
  const rows = await sql`SELECT * FROM funds WHERE slug = ${slug} LIMIT 1`
  return rows[0] ? normalizeFund(rows[0]) : null
}

// ── funds: write ────────────────────────────────────────────────────────

export interface CreateFundInput {
  name: string
  slug?: string | null
  description?: string | null
  vintageYear?: number | null
  targetSize?: number | null
  currency?: string
  managementFeePct?: number | null
  carryPct?: number | null
  termYears?: number | null
  investmentPeriodYears?: number | null
  status?: FundStatus
  managerOrg?: string | null
  metadata?: Record<string, any>
}

export async function createFund(input: CreateFundInput): Promise<FundFull> {
  if (!input?.name?.trim()) throw new Error("name required")
  const baseSlug = slugify(input.slug?.trim() || input.name.trim())
  const slug = await ensureUniqueSlug(baseSlug, async (s) => {
    const rows = await sql`SELECT 1 FROM funds WHERE slug = ${s} LIMIT 1`
    return rows.length > 0
  })
  const meta = JSON.stringify(input.metadata ?? {})
  const rows = await sql`
    INSERT INTO funds (
      slug, name, description, vintage_year, target_size, currency,
      management_fee_pct, carry_pct, term_years, investment_period_years,
      status, manager_org, metadata, created_at, updated_at
    ) VALUES (
      ${slug}, ${input.name.trim()}, ${input.description ?? null},
      ${input.vintageYear ?? null}, ${input.targetSize ?? null},
      ${input.currency ?? "USD"},
      ${input.managementFeePct ?? null}, ${input.carryPct ?? null},
      ${input.termYears ?? null}, ${input.investmentPeriodYears ?? null},
      ${input.status ?? "active"}, ${input.managerOrg ?? null},
      ${meta}::jsonb, NOW(), NOW()
    )
    RETURNING *
  `
  return normalizeFund(rows[0])
}

export interface UpdateFundInput {
  name?: string
  slug?: string | null
  description?: string | null
  vintageYear?: number | null
  targetSize?: number | null
  currency?: string
  managementFeePct?: number | null
  carryPct?: number | null
  termYears?: number | null
  investmentPeriodYears?: number | null
  status?: FundStatus
  managerOrg?: string | null
  metadata?: Record<string, any>
}

export async function updateFund(id: string, patch: UpdateFundInput): Promise<FundFull | null> {
  const metaJson = patch.metadata !== undefined ? JSON.stringify(patch.metadata) : null

  // Slug update — same pattern as portfolio_companies.
  let newSlug: string | null = null
  if (typeof patch.slug === "string") {
    const current = await getFundById(id)
    if (!current) return null
    const source = patch.slug.trim() || patch.name?.trim() || current.name
    const base = slugify(source)
    newSlug = await ensureUniqueSlug(base, async (s) => {
      const rows = await sql`SELECT 1 FROM funds WHERE slug = ${s} AND id <> ${id} LIMIT 1`
      return rows.length > 0
    })
  }

  const rows = await sql`
    UPDATE funds SET
      slug                    = COALESCE(${newSlug}, slug),
      name                    = COALESCE(${patch.name ?? null}, name),
      description             = COALESCE(${patch.description ?? null}, description),
      vintage_year            = COALESCE(${patch.vintageYear ?? null}, vintage_year),
      target_size             = COALESCE(${patch.targetSize ?? null}, target_size),
      currency                = COALESCE(${patch.currency ?? null}, currency),
      management_fee_pct      = COALESCE(${patch.managementFeePct ?? null}, management_fee_pct),
      carry_pct               = COALESCE(${patch.carryPct ?? null}, carry_pct),
      term_years              = COALESCE(${patch.termYears ?? null}, term_years),
      investment_period_years = COALESCE(${patch.investmentPeriodYears ?? null}, investment_period_years),
      status                  = COALESCE(${patch.status ?? null}, status),
      manager_org             = COALESCE(${patch.managerOrg ?? null}, manager_org),
      metadata                = CASE WHEN ${metaJson}::text IS NOT NULL THEN ${metaJson}::jsonb ELSE metadata END,
      updated_at              = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? normalizeFund(rows[0]) : null
}

export async function deleteFund(id: string): Promise<boolean> {
  // Caller responsibility: don't delete a fund that has portfolio companies
  // or LP reports attached. We don't enforce here because fund_id is a TEXT
  // slug on those tables (no FK), so a CASCADE wouldn't fire anyway.
  const rows = await sql`DELETE FROM funds WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

// ── fund_lps: read ──────────────────────────────────────────────────────

export async function listLps(fundId: string): Promise<FundLpFull[]> {
  const rows = await sql`
    SELECT
      fl.*,
      c.email      AS contact_email,
      c.first_name AS contact_first_name,
      c.last_name  AS contact_last_name
    FROM fund_lps fl
    LEFT JOIN contacts c ON c.id = fl.lp_contact_id
    WHERE fl.fund_id = ${fundId}
    ORDER BY
      CASE fl.status
        WHEN 'committed'    THEN 1
        WHEN 'fully_called' THEN 2
        WHEN 'defaulted'    THEN 3
        WHEN 'transferred'  THEN 4
      END,
      fl.commitment_amount DESC NULLS LAST,
      fl.lp_name ASC
  `
  return rows.map(normalizeLp)
}

export async function getLpById(id: string): Promise<FundLpFull | null> {
  const rows = await sql`
    SELECT
      fl.*,
      c.email      AS contact_email,
      c.first_name AS contact_first_name,
      c.last_name  AS contact_last_name
    FROM fund_lps fl
    LEFT JOIN contacts c ON c.id = fl.lp_contact_id
    WHERE fl.id = ${id} LIMIT 1
  `
  return rows[0] ? normalizeLp(rows[0]) : null
}

export async function getFundLpRollup(fundId: string): Promise<FundLpRollup> {
  const rows = await sql`
    SELECT
      COUNT(*)                                                                     AS total_lps,
      COALESCE(SUM(commitment_amount) FILTER (WHERE status != 'transferred'), 0)   AS total_committed,
      COALESCE(SUM(called_amount)     FILTER (WHERE status != 'transferred'), 0)   AS total_called,
      COALESCE(SUM(distributed_amount) FILTER (WHERE status != 'transferred'), 0)  AS total_distributed
    FROM fund_lps
    WHERE fund_id = ${fundId}
  `
  const r: any = rows[0] ?? {}
  const fund = await getFundById(fundId)
  const total_committed = Number(r.total_committed ?? 0)
  const total_called = Number(r.total_called ?? 0)
  const total_distributed = Number(r.total_distributed ?? 0)
  return {
    total_lps: Number(r.total_lps ?? 0),
    total_committed,
    total_called,
    total_distributed,
    uncalled_remaining: Math.max(0, total_committed - total_called),
    pct_subscribed: fund?.target_size && fund.target_size > 0
      ? Math.round((total_committed / fund.target_size) * 10000) / 10000
      : null,
  }
}

// ── fund_lps: subscription funnel (Carta investor-status overview) ───────

export type SubscriptionStatus = "prospective" | "invited" | "signed" | "countersigned"

export interface SubscriptionFunnelStage {
  status: SubscriptionStatus
  count: number
  /** Sum of commitment_amount for LPs at this stage. */
  committed: number
}

/** Per-stage counts + committed capital for the fundraise funnel, always
 *  returned in pipeline order (prospective → countersigned). */
export async function getFundSubscriptionFunnel(fundId: string): Promise<SubscriptionFunnelStage[]> {
  const rows = await sql`
    SELECT subscription_status AS status,
           COUNT(*)::int        AS count,
           COALESCE(SUM(commitment_amount), 0) AS committed
    FROM fund_lps
    WHERE fund_id = ${fundId}
    GROUP BY subscription_status
  `
  const by: Record<string, { count: number; committed: number }> = {}
  for (const r of rows as any[]) by[r.status] = { count: Number(r.count ?? 0), committed: Number(r.committed ?? 0) }
  const ORDER: SubscriptionStatus[] = ["prospective", "invited", "signed", "countersigned"]
  return ORDER.map((status) => ({ status, count: by[status]?.count ?? 0, committed: by[status]?.committed ?? 0 }))
}

// ── fund_lps: write ─────────────────────────────────────────────────────

export interface CreateLpInput {
  fundId: string
  lpName: string
  lpType?: LpType | null
  lpContactId?: string | null
  commitmentAmount?: number | null
  calledAmount?: number | null
  distributedAmount?: number | null
  signedAt?: string | null
  status?: LpStatus
  notes?: string | null
  metadata?: Record<string, any>
}

export async function createLp(input: CreateLpInput): Promise<FundLpFull> {
  if (!input?.fundId) throw new Error("fundId required")
  if (!input?.lpName?.trim()) throw new Error("lpName required")
  const meta = JSON.stringify(input.metadata ?? {})
  const rows = await sql`
    INSERT INTO fund_lps (
      fund_id, lp_contact_id, lp_name, lp_type,
      commitment_amount, called_amount, distributed_amount,
      signed_at, status, notes, metadata, created_at, updated_at
    ) VALUES (
      ${input.fundId}, ${input.lpContactId ?? null}, ${input.lpName.trim()}, ${input.lpType ?? null},
      ${input.commitmentAmount ?? null},
      ${input.calledAmount ?? 0},
      ${input.distributedAmount ?? 0},
      ${input.signedAt ?? null}::date, ${input.status ?? "committed"},
      ${input.notes ?? null}, ${meta}::jsonb, NOW(), NOW()
    )
    RETURNING *
  `
  const lp = normalizeLp(rows[0])
  // Re-balance ownership_pct across the fund's LPs whenever a commitment changes.
  if (input.commitmentAmount != null) {
    await recomputeOwnershipPcts(input.fundId)
  }
  return lp
}

export interface UpdateLpInput {
  lpName?: string
  lpType?: LpType | null
  lpContactId?: string | null
  commitmentAmount?: number | null
  calledAmount?: number | null
  distributedAmount?: number | null
  signedAt?: string | null
  status?: LpStatus
  notes?: string | null
  metadata?: Record<string, any>
}

export async function updateLp(id: string, patch: UpdateLpInput): Promise<FundLpFull | null> {
  const metaJson = patch.metadata !== undefined ? JSON.stringify(patch.metadata) : null
  const rows = await sql`
    UPDATE fund_lps SET
      lp_name             = COALESCE(${patch.lpName ?? null}, lp_name),
      lp_type             = COALESCE(${patch.lpType ?? null}, lp_type),
      lp_contact_id       = COALESCE(${patch.lpContactId ?? null}, lp_contact_id),
      commitment_amount   = COALESCE(${patch.commitmentAmount ?? null}, commitment_amount),
      called_amount       = COALESCE(${patch.calledAmount ?? null}, called_amount),
      distributed_amount  = COALESCE(${patch.distributedAmount ?? null}, distributed_amount),
      signed_at           = COALESCE(${patch.signedAt ?? null}::date, signed_at),
      status              = COALESCE(${patch.status ?? null}, status),
      notes               = COALESCE(${patch.notes ?? null}, notes),
      metadata            = CASE WHEN ${metaJson}::text IS NOT NULL THEN ${metaJson}::jsonb ELSE metadata END,
      updated_at          = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  const lp = rows[0] ? normalizeLp(rows[0]) : null
  if (lp && patch.commitmentAmount != null) {
    await recomputeOwnershipPcts(lp.fund_id)
  }
  return lp
}

export async function deleteLp(id: string): Promise<{ deleted: boolean; fundId: string | null }> {
  const rows = await sql`DELETE FROM fund_lps WHERE id = ${id} RETURNING fund_id`
  const fundId = rows[0]?.fund_id ?? null
  if (fundId) await recomputeOwnershipPcts(fundId)
  return { deleted: rows.length > 0, fundId }
}

/**
 * Recompute each LP's ownership_pct as (commitment / total non-transferred
 * commitments).  Called after any commitment change.  Cheap — fund_lps row
 * counts are LP-count-bound (typically <50).
 */
export async function recomputeOwnershipPcts(fundId: string): Promise<void> {
  const totalRows = await sql`
    SELECT COALESCE(SUM(commitment_amount), 0) AS total
      FROM fund_lps
     WHERE fund_id = ${fundId} AND status != 'transferred'
  `
  const total = Number(totalRows[0]?.total ?? 0)
  if (total <= 0) {
    // Wipe any stale ownership values.
    await sql`UPDATE fund_lps SET ownership_pct = NULL WHERE fund_id = ${fundId}`
    return
  }
  await sql`
    UPDATE fund_lps
       SET ownership_pct = CASE
             WHEN status = 'transferred' OR commitment_amount IS NULL THEN NULL
             ELSE ROUND((commitment_amount / ${total}::numeric)::numeric, 5)
           END
     WHERE fund_id = ${fundId}
  `
}

// ── normalize ───────────────────────────────────────────────────────────

function normalizeFund(r: any): FundFull {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
    vintage_year: r.vintage_year != null ? Number(r.vintage_year) : null,
    target_size: toNum(r.target_size),
    currency: r.currency ?? "USD",
    management_fee_pct: toNum(r.management_fee_pct),
    carry_pct: toNum(r.carry_pct),
    term_years: r.term_years != null ? Number(r.term_years) : null,
    investment_period_years: r.investment_period_years != null ? Number(r.investment_period_years) : null,
    status: (r.status ?? "active") as FundStatus,
    manager_org: r.manager_org ?? null,
    metadata: parseJsonObj(r.metadata),
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}

function normalizeLp(r: any): FundLpFull {
  return {
    id: r.id,
    fund_id: r.fund_id,
    lp_contact_id: r.lp_contact_id ?? null,
    lp_name: r.lp_name,
    lp_type: (r.lp_type ?? null) as LpType | null,
    commitment_amount: toNum(r.commitment_amount),
    called_amount: toNum(r.called_amount) ?? 0,
    distributed_amount: toNum(r.distributed_amount) ?? 0,
    ownership_pct: toNum(r.ownership_pct),
    signed_at: toIsoDate(r.signed_at),
    status: (r.status ?? "committed") as LpStatus,
    notes: r.notes ?? null,
    metadata: parseJsonObj(r.metadata),
    // contact_* are populated only when the caller used the JOIN-aware
    // listLps / getLpById queries. Direct INSERT/UPDATE RETURNING * leaves
    // them undefined → null.
    contact_email: r.contact_email ?? null,
    contact_first_name: r.contact_first_name ?? null,
    contact_last_name: r.contact_last_name ?? null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
function toIsoDate(v: any): string | null {
  const iso = toIso(v); return iso ? iso.slice(0, 10) : null
}
function parseJsonObj(v: any): Record<string, any> {
  if (!v) return {}
  if (typeof v === "object" && !Array.isArray(v)) return v
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v)
      return p && typeof p === "object" && !Array.isArray(p) ? p : {}
    } catch { return {} }
  }
  return {}
}
