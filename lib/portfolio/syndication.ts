/**
 * Syndication — SPVs, co-invest partners, commitment funnel
 * (Phase 5 of FUND_OPS_DESIGN.md §3.2).
 *
 * The core design move: AN SPV IS A FUND. createSpvForDeal() creates a
 * `funds` row with vehicle_kind='spv' plus a `syndicates` metadata row —
 * from that moment capital calls, distributions, capital-account
 * statements, the ledger, fees, and the waterfall all work on the SPV
 * with zero new code, because they only know about fund ids.
 *
 * The other two pieces:
 *   - syndicate_partners: the GP's co-invest network (angels, family
 *     offices, funds) with type / sectors / typical ticket.
 *   - lp_commitment_events: an append-only funnel per vehicle ×
 *     participant — invited → viewed → soft_committed → docs_out →
 *     signed → funded (or declined). The latest event per participant
 *     is their current stage; the log is the raise's audit trail.
 *     When a partner reaches `funded`, promoteToLp() creates the real
 *     fund_lps row on the SPV so calls/statements pick them up.
 */

import { sql } from "@/lib/db"
import { createFund, createLp, type FundFull } from "@/lib/portfolio/funds"
import { getDealById } from "@/lib/portfolio/deal-pipeline"

// ── types ───────────────────────────────────────────────────────────────

export type SyndicateStatus = "raising" | "closing" | "closed" | "cancelled"
export type PartnerType = "angel" | "family_office" | "vc_fund" | "corporate" | "hnwi" | "other"

export const COMMITMENT_STAGES = [
  "invited", "viewed", "soft_committed", "docs_out", "signed", "funded", "declined",
] as const
export type CommitmentStage = (typeof COMMITMENT_STAGES)[number]

export interface SyndicateFull {
  id: string
  spv_fund_id: string
  lead_fund_id: string
  deal_id: string | null
  company_name: string
  allocation_amount: number | null
  min_ticket: number | null
  carry_to_lead_pct: number
  platform_fee_pct: number
  target_close_date: string | null
  status: SyndicateStatus
  notes: string | null
  created_at: string
  /** Joined from the SPV funds row. */
  spv_name: string | null
  spv_slug: string | null
}

export interface SyndicatePartnerFull {
  id: string
  lead_fund_id: string
  name: string
  firm: string | null
  email: string | null
  contact_id: string | null
  partner_type: PartnerType
  sectors: string | null
  typical_ticket: number | null
  notes: string | null
  created_at: string
}

export interface CommitmentEventFull {
  id: string
  fund_id: string
  partner_id: string | null
  fund_lp_id: string | null
  stage: CommitmentStage
  amount: number | null
  note: string | null
  created_at: string
}

export interface FunnelRow {
  partnerId: string
  partnerName: string
  partnerFirm: string | null
  currentStage: CommitmentStage
  amount: number | null
  lastEventAt: string
  eventCount: number
}

export interface SpvFunnel {
  syndicate: SyndicateFull
  rows: FunnelRow[]
  totals: {
    invited: number
    softCommitted: number
    signed: number
    funded: number
    declined: number
    softCommittedAmount: number
    signedAmount: number
    fundedAmount: number
  }
}

// ── schema-drift guard ──────────────────────────────────────────────────

let probe: Promise<boolean> | null = null
export function hasSyndicationTables(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const rows = await sql`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('syndicates', 'syndicate_partners', 'lp_commitment_events')`
        return rows.length === 3
      } catch { return false }
    })()
  }
  return probe
}

// ── normalize ───────────────────────────────────────────────────────────

const num = (v: any): number | null => (v == null ? null : Number(v))
const d = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10)

function normalizeSyndicate(r: any): SyndicateFull {
  return {
    id: r.id,
    spv_fund_id: r.spv_fund_id,
    lead_fund_id: r.lead_fund_id,
    deal_id: r.deal_id ?? null,
    company_name: r.company_name,
    allocation_amount: num(r.allocation_amount),
    min_ticket: num(r.min_ticket),
    carry_to_lead_pct: Number(r.carry_to_lead_pct),
    platform_fee_pct: Number(r.platform_fee_pct),
    target_close_date: d(r.target_close_date),
    status: r.status,
    notes: r.notes ?? null,
    created_at: String(r.created_at),
    spv_name: r.spv_name ?? null,
    spv_slug: r.spv_slug ?? null,
  }
}

function normalizePartner(r: any): SyndicatePartnerFull {
  return {
    id: r.id,
    lead_fund_id: r.lead_fund_id,
    name: r.name,
    firm: r.firm ?? null,
    email: r.email ?? null,
    contact_id: r.contact_id ?? null,
    partner_type: r.partner_type,
    sectors: r.sectors ?? null,
    typical_ticket: num(r.typical_ticket),
    notes: r.notes ?? null,
    created_at: String(r.created_at),
  }
}

// ── SPVs ────────────────────────────────────────────────────────────────

export async function listSyndicates(leadFundId: string): Promise<SyndicateFull[]> {
  if (!(await hasSyndicationTables())) return []
  const rows = await sql`
    SELECT s.*, f.name AS spv_name, f.slug AS spv_slug
      FROM syndicates s
      LEFT JOIN funds f ON f.id = s.spv_fund_id
     WHERE s.lead_fund_id = ${leadFundId}
     ORDER BY s.created_at DESC`
  return rows.map(normalizeSyndicate)
}

export async function getSyndicateById(id: string): Promise<SyndicateFull | null> {
  if (!(await hasSyndicationTables())) return null
  const rows = await sql`
    SELECT s.*, f.name AS spv_name, f.slug AS spv_slug
      FROM syndicates s
      LEFT JOIN funds f ON f.id = s.spv_fund_id
     WHERE s.id = ${id} LIMIT 1`
  return rows[0] ? normalizeSyndicate(rows[0]) : null
}

export interface CreateSpvInput {
  leadFundId: string
  /** Committed or closed deal to syndicate; company name is taken from it.
   *  Optional — an SPV can also be created free-form. */
  dealId?: string | null
  companyName?: string | null
  allocationAmount?: number | null
  minTicket?: number | null
  carryToLeadPct?: number
  platformFeePct?: number
  targetCloseDate?: string | null
  notes?: string | null
  createdBy?: string | null
}

export async function createSpvForDeal(input: CreateSpvInput): Promise<SyndicateFull> {
  let companyName = input.companyName?.trim() || null
  if (input.dealId) {
    const deal = await getDealById(input.dealId)
    if (!deal) throw new Error("Deal not found")
    if (deal.fund_id !== input.leadFundId) throw new Error("Deal belongs to a different fund")
    companyName = companyName ?? deal.company_name
  }
  if (!companyName) throw new Error("companyName (or dealId) required")

  // 1. The SPV is a fund. Everything downstream keys off funds.id.
  const spv: FundFull = await createFund({
    name: `${companyName} SPV`,
    description: `Single-deal SPV syndicating ${companyName}.`,
    currency: "USD",
    targetSize: input.allocationAmount ?? null,
    carryPct: input.carryToLeadPct ?? 0.20,
    status: "fundraising",
    metadata: { vehicle: "spv", lead_fund_id: input.leadFundId, deal_id: input.dealId ?? null },
  } as any)
  await sql`UPDATE funds SET vehicle_kind = 'spv' WHERE id = ${spv.id}`

  // 2. Syndicate metadata.
  const rows = await sql`
    INSERT INTO syndicates (
      spv_fund_id, lead_fund_id, deal_id, company_name, allocation_amount,
      min_ticket, carry_to_lead_pct, platform_fee_pct, target_close_date,
      notes, created_by
    ) VALUES (
      ${spv.id}, ${input.leadFundId}, ${input.dealId ?? null}, ${companyName},
      ${input.allocationAmount ?? null}, ${input.minTicket ?? null},
      ${input.carryToLeadPct ?? 0.20}, ${input.platformFeePct ?? 0},
      ${input.targetCloseDate ?? null}, ${input.notes ?? null},
      ${input.createdBy ?? null}
    ) RETURNING *`
  return (await getSyndicateById(rows[0].id))!
}

export async function updateSyndicateStatus(id: string, status: SyndicateStatus): Promise<SyndicateFull | null> {
  await sql`UPDATE syndicates SET status = ${status}, updated_at = NOW() WHERE id = ${id}`
  return getSyndicateById(id)
}

// ── partners ────────────────────────────────────────────────────────────

export async function listPartners(leadFundId: string): Promise<SyndicatePartnerFull[]> {
  if (!(await hasSyndicationTables())) return []
  const rows = await sql`
    SELECT * FROM syndicate_partners
     WHERE lead_fund_id = ${leadFundId}
     ORDER BY name ASC`
  return rows.map(normalizePartner)
}

export interface UpsertPartnerInput {
  id?: string | null
  leadFundId: string
  name: string
  firm?: string | null
  email?: string | null
  partnerType?: PartnerType
  sectors?: string | null
  typicalTicket?: number | null
  notes?: string | null
}

export async function upsertPartner(input: UpsertPartnerInput): Promise<SyndicatePartnerFull> {
  if (input.id) {
    const rows = await sql`
      UPDATE syndicate_partners SET
        name = ${input.name.trim()},
        firm = ${input.firm ?? null},
        email = ${input.email ?? null},
        partner_type = ${input.partnerType ?? "angel"},
        sectors = ${input.sectors ?? null},
        typical_ticket = ${input.typicalTicket ?? null},
        notes = ${input.notes ?? null},
        updated_at = NOW()
      WHERE id = ${input.id} AND lead_fund_id = ${input.leadFundId}
      RETURNING *`
    if (!rows[0]) throw new Error("Partner not found")
    return normalizePartner(rows[0])
  }
  const rows = await sql`
    INSERT INTO syndicate_partners (
      lead_fund_id, name, firm, email, partner_type, sectors, typical_ticket, notes
    ) VALUES (
      ${input.leadFundId}, ${input.name.trim()}, ${input.firm ?? null},
      ${input.email ?? null}, ${input.partnerType ?? "angel"},
      ${input.sectors ?? null}, ${input.typicalTicket ?? null}, ${input.notes ?? null}
    ) RETURNING *`
  return normalizePartner(rows[0])
}

export async function deletePartner(id: string, leadFundId: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM syndicate_partners
     WHERE id = ${id} AND lead_fund_id = ${leadFundId} RETURNING id`
  return rows.length > 0
}

// ── commitment funnel ───────────────────────────────────────────────────

const STAGE_ORDER: Record<CommitmentStage, number> = {
  invited: 1, viewed: 2, soft_committed: 3, docs_out: 4, signed: 5, funded: 6, declined: 0,
}

export async function recordCommitmentEvent(input: {
  fundId: string
  partnerId: string
  stage: CommitmentStage
  amount?: number | null
  note?: string | null
  createdBy?: string | null
}): Promise<CommitmentEventFull> {
  const rows = await sql`
    INSERT INTO lp_commitment_events (fund_id, partner_id, stage, amount, note, created_by)
    VALUES (${input.fundId}, ${input.partnerId}, ${input.stage},
            ${input.amount ?? null}, ${input.note ?? null}, ${input.createdBy ?? null})
    RETURNING *`
  const r: any = rows[0]

  // funded → promote to a real LP row on the vehicle so calls/statements
  // pick the participant up. Idempotent-ish: skip when an LP with the
  // same name already exists on the fund.
  if (input.stage === "funded") {
    try {
      const [partner] = await sql`SELECT * FROM syndicate_partners WHERE id = ${input.partnerId} LIMIT 1` as any[]
      if (partner) {
        const existing = await sql`
          SELECT 1 FROM fund_lps WHERE fund_id = ${input.fundId} AND lp_name = ${partner.name} LIMIT 1`
        if (existing.length === 0) {
          await createLp({
            fundId: input.fundId,
            lpName: partner.name,
            lpType: partner.partner_type === "family_office" ? "family_office"
              : partner.partner_type === "vc_fund" ? "fund_of_funds"
              : partner.partner_type === "corporate" ? "corporate"
              : "hnwi",
            commitmentAmount: input.amount ?? null,
          })
        }
      }
    } catch (e) {
      console.error("[syndication] promoteToLp failed (event recorded):", e)
    }
  }

  return {
    id: r.id, fund_id: r.fund_id, partner_id: r.partner_id ?? null,
    fund_lp_id: r.fund_lp_id ?? null, stage: r.stage,
    amount: num(r.amount), note: r.note ?? null, created_at: String(r.created_at),
  }
}

export async function getSpvFunnel(syndicateId: string): Promise<SpvFunnel | null> {
  const syndicate = await getSyndicateById(syndicateId)
  if (!syndicate) return null

  const events = await sql`
    SELECT e.*, p.name AS partner_name, p.firm AS partner_firm
      FROM lp_commitment_events e
      LEFT JOIN syndicate_partners p ON p.id = e.partner_id
     WHERE e.fund_id = ${syndicate.spv_fund_id}
     ORDER BY e.created_at ASC`

  // Latest state per partner: highest-order stage wins ties by recency;
  // declined always terminal.
  const byPartner = new Map<string, FunnelRow>()
  for (const e of events as any[]) {
    if (!e.partner_id) continue
    const prev = byPartner.get(e.partner_id)
    const row: FunnelRow = {
      partnerId: e.partner_id,
      partnerName: e.partner_name ?? "Unknown",
      partnerFirm: e.partner_firm ?? null,
      currentStage: e.stage,
      amount: num(e.amount) ?? prev?.amount ?? null,
      lastEventAt: String(e.created_at),
      eventCount: (prev?.eventCount ?? 0) + 1,
    }
    if (!prev) { byPartner.set(e.partner_id, row); continue }
    // events are chronological — the latest event is the current stage,
    // but keep the max amount seen if the new event carries none.
    byPartner.set(e.partner_id, row)
  }

  const rows = [...byPartner.values()].sort(
    (a, b) => STAGE_ORDER[b.currentStage] - STAGE_ORDER[a.currentStage],
  )
  const sum = (stages: CommitmentStage[], amountOnly = false) =>
    rows.filter((r) => stages.includes(r.currentStage))
      .reduce((s, r) => s + (amountOnly ? (r.amount ?? 0) : 1), 0)

  return {
    syndicate,
    rows,
    totals: {
      invited: rows.length,
      softCommitted: sum(["soft_committed", "docs_out", "signed", "funded"]),
      signed: sum(["signed", "funded"]),
      funded: sum(["funded"]),
      declined: sum(["declined"]),
      softCommittedAmount: sum(["soft_committed", "docs_out", "signed", "funded"], true),
      signedAmount: sum(["signed", "funded"], true),
      fundedAmount: sum(["funded"], true),
    },
  }
}
