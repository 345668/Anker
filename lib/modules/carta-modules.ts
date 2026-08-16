import { sql } from "@/lib/db"

// ── SPVs ───────────────────────────────────────────────────────────────────
export interface Spv {
  id: string; name: string; deal_name: string | null
  target_amount: number; committed_amount: number
  stage: "forming" | "open" | "closed" | "wound_down"
  lead: string | null; close_date: string | null; created_at: string
}
const num = (v: any) => (v == null ? 0 : Number(v))
function normSpv(r: any): Spv {
  return { id: r.id, name: r.name, deal_name: r.deal_name ?? null, target_amount: num(r.target_amount), committed_amount: num(r.committed_amount), stage: r.stage, lead: r.lead ?? null, close_date: r.close_date ? String(r.close_date) : null, created_at: String(r.created_at) }
}
export async function listSpvs(userId: string): Promise<Spv[]> {
  const rows = await sql`SELECT * FROM spvs WHERE created_by = ${userId} ORDER BY created_at DESC`
  return rows.map(normSpv)
}
export async function createSpv(input: { userId: string; name: string; dealName?: string | null; target?: number; committed?: number; stage?: string; lead?: string | null; closeDate?: string | null }): Promise<Spv> {
  const rows = await sql`
    INSERT INTO spvs (created_by, name, deal_name, target_amount, committed_amount, stage, lead, close_date)
    VALUES (${input.userId}, ${input.name.trim()}, ${input.dealName ?? null}, ${input.target ?? 0}, ${input.committed ?? 0}, ${input.stage ?? "forming"}, ${input.lead ?? null}, ${input.closeDate ?? null}::date)
    RETURNING *`
  return normSpv(rows[0])
}

// ── Option grants (share plans) ─────────────────────────────────────────────
export interface OptionGrant {
  id: string; grantee_name: string; grantee_email: string | null
  options: number; strike_price: number | null; grant_date: string | null
  vest_months: number; cliff_months: number
  status: "draft" | "granted" | "exercised" | "cancelled"; created_at: string
}
function normGrant(r: any): OptionGrant {
  return { id: r.id, grantee_name: r.grantee_name, grantee_email: r.grantee_email ?? null, options: Number(r.options ?? 0), strike_price: r.strike_price != null ? Number(r.strike_price) : null, grant_date: r.grant_date ? String(r.grant_date) : null, vest_months: Number(r.vest_months ?? 48), cliff_months: Number(r.cliff_months ?? 12), status: r.status, created_at: String(r.created_at) }
}
export async function listGrants(companyId: string): Promise<OptionGrant[]> {
  const rows = await sql`SELECT * FROM option_grants WHERE company_id = ${companyId} ORDER BY created_at DESC`
  return rows.map(normGrant)
}
export async function createGrant(input: { companyId: string; userId: string; granteeName: string; granteeEmail?: string | null; options: number; strike?: number | null; grantDate?: string | null; vestMonths?: number; cliffMonths?: number }): Promise<OptionGrant> {
  const rows = await sql`
    INSERT INTO option_grants (company_id, created_by, grantee_name, grantee_email, options, strike_price, grant_date, vesting_start, vest_months, cliff_months)
    VALUES (${input.companyId}, ${input.userId}, ${input.granteeName.trim()}, ${input.granteeEmail ?? null}, ${input.options}, ${input.strike ?? null}, ${input.grantDate ?? null}::date, ${input.grantDate ?? null}::date, ${input.vestMonths ?? 48}, ${input.cliffMonths ?? 12})
    RETURNING *`
  return normGrant(rows[0])
}

// ── 409A valuations ─────────────────────────────────────────────────────────
export interface Valuation409a {
  id: string; fair_market_value: number | null; common_price: number | null
  method: string; status: "requested" | "in_progress" | "completed" | "board_approved" | "expired"
  valued_at: string | null; expires_at: string | null; created_at: string
}
function normVal(r: any): Valuation409a {
  return { id: r.id, fair_market_value: r.fair_market_value != null ? Number(r.fair_market_value) : null, common_price: r.common_price != null ? Number(r.common_price) : null, method: r.method, status: r.status, valued_at: r.valued_at ? String(r.valued_at) : null, expires_at: r.expires_at ? String(r.expires_at) : null, created_at: String(r.created_at) }
}
export async function listValuations(companyId: string): Promise<Valuation409a[]> {
  const rows = await sql`SELECT * FROM valuations_409a WHERE company_id = ${companyId} ORDER BY created_at DESC`
  return rows.map(normVal)
}
export async function createValuation(input: { companyId: string; userId: string; method?: string; commonPrice?: number | null; fmv?: number | null; status?: string }): Promise<Valuation409a> {
  const rows = await sql`
    INSERT INTO valuations_409a (company_id, created_by, method, common_price, fair_market_value, status)
    VALUES (${input.companyId}, ${input.userId}, ${input.method ?? "OPM"}, ${input.commonPrice ?? null}, ${input.fmv ?? null}, ${input.status ?? "requested"})
    RETURNING *`
  return normVal(rows[0])
}

// ── Equity compliance filings ───────────────────────────────────────────────
export interface EquityFiling {
  id: string; title: string; filing_type: string | null; due_date: string | null
  status: "open" | "filed" | "overdue" | "na"; filed_at: string | null; created_at: string
}
function normFiling(r: any): EquityFiling {
  return { id: r.id, title: r.title, filing_type: r.filing_type ?? null, due_date: r.due_date ? String(r.due_date) : null, status: r.status, filed_at: r.filed_at ? String(r.filed_at) : null, created_at: String(r.created_at) }
}
export async function listFilings(companyId: string): Promise<EquityFiling[]> {
  const rows = await sql`SELECT * FROM equity_filings WHERE company_id = ${companyId} ORDER BY due_date ASC NULLS LAST, created_at DESC`
  return rows.map(normFiling)
}
export async function createFiling(input: { companyId: string; userId: string; title: string; filingType?: string | null; dueDate?: string | null }): Promise<EquityFiling> {
  const rows = await sql`
    INSERT INTO equity_filings (company_id, created_by, title, filing_type, due_date)
    VALUES (${input.companyId}, ${input.userId}, ${input.title.trim()}, ${input.filingType ?? null}, ${input.dueDate ?? null}::date)
    RETURNING *`
  return normFiling(rows[0])
}

// ── Loans (Loan Operations) ─────────────────────────────────────────────────
export interface Loan {
  id: string; borrower: string; principal: number; outstanding: number | null
  interest_rate: number | null; origination_date: string | null; maturity_date: string | null
  amortization: "bullet" | "amortizing" | "interest_only" | "revolving"
  status: "active" | "repaid" | "default" | "written_off"; created_at: string
}
function normLoan(r: any): Loan {
  return { id: r.id, borrower: r.borrower, principal: num(r.principal), outstanding: r.outstanding != null ? Number(r.outstanding) : null, interest_rate: r.interest_rate != null ? Number(r.interest_rate) : null, origination_date: r.origination_date ? String(r.origination_date) : null, maturity_date: r.maturity_date ? String(r.maturity_date) : null, amortization: r.amortization, status: r.status, created_at: String(r.created_at) }
}
export async function listLoans(userId: string): Promise<Loan[]> {
  const rows = await sql`SELECT * FROM loans WHERE created_by = ${userId} ORDER BY created_at DESC`
  return rows.map(normLoan)
}
export async function createLoan(input: { userId: string; borrower: string; principal: number; rate?: number | null; origination?: string | null; maturity?: string | null; amortization?: string; status?: string }): Promise<Loan> {
  const rows = await sql`
    INSERT INTO loans (created_by, borrower, principal, outstanding, interest_rate, origination_date, maturity_date, amortization, status)
    VALUES (${input.userId}, ${input.borrower.trim()}, ${input.principal}, ${input.principal}, ${input.rate ?? null}, ${input.origination ?? null}::date, ${input.maturity ?? null}::date, ${input.amortization ?? "bullet"}, ${input.status ?? "active"})
    RETURNING *`
  return normLoan(rows[0])
}

// ── Contracts ───────────────────────────────────────────────────────────────
export interface Contract {
  id: string; title: string; counterparty: string | null; contract_type: string | null
  status: "draft" | "in_review" | "sent" | "signed" | "expired"; value: number | null
  effective_date: string | null; expiry_date: string | null; created_at: string
}
function normContract(r: any): Contract {
  return { id: r.id, title: r.title, counterparty: r.counterparty ?? null, contract_type: r.contract_type ?? null, status: r.status, value: r.value != null ? Number(r.value) : null, effective_date: r.effective_date ? String(r.effective_date) : null, expiry_date: r.expiry_date ? String(r.expiry_date) : null, created_at: String(r.created_at) }
}
export async function listContracts(userId: string): Promise<Contract[]> {
  const rows = await sql`SELECT * FROM contracts WHERE created_by = ${userId} ORDER BY created_at DESC`
  return rows.map(normContract)
}
export async function createContract(input: { userId: string; title: string; counterparty?: string | null; type?: string | null; status?: string; value?: number | null; effective?: string | null; expiry?: string | null }): Promise<Contract> {
  const rows = await sql`
    INSERT INTO contracts (created_by, title, counterparty, contract_type, status, value, effective_date, expiry_date)
    VALUES (${input.userId}, ${input.title.trim()}, ${input.counterparty ?? null}, ${input.type ?? null}, ${input.status ?? "draft"}, ${input.value ?? null}, ${input.effective ?? null}::date, ${input.expiry ?? null}::date)
    RETURNING *`
  return normContract(rows[0])
}

// ── Compensation bands ──────────────────────────────────────────────────────
export interface CompBand {
  id: string; role: string; level: string | null; geography: string | null
  base_min: number | null; base_max: number | null; equity_min: number | null; equity_max: number | null; created_at: string
}
function normBand(r: any): CompBand {
  return { id: r.id, role: r.role, level: r.level ?? null, geography: r.geography ?? null, base_min: r.base_min != null ? Number(r.base_min) : null, base_max: r.base_max != null ? Number(r.base_max) : null, equity_min: r.equity_min != null ? Number(r.equity_min) : null, equity_max: r.equity_max != null ? Number(r.equity_max) : null, created_at: String(r.created_at) }
}
export async function listBands(companyId: string): Promise<CompBand[]> {
  const rows = await sql`SELECT * FROM comp_bands WHERE company_id = ${companyId} ORDER BY created_at DESC`
  return rows.map(normBand)
}
export async function createBand(input: { companyId: string; userId: string; role: string; level?: string | null; geography?: string | null; baseMin?: number | null; baseMax?: number | null; equityMin?: number | null; equityMax?: number | null }): Promise<CompBand> {
  const rows = await sql`
    INSERT INTO comp_bands (company_id, created_by, role, level, geography, base_min, base_max, equity_min, equity_max)
    VALUES (${input.companyId}, ${input.userId}, ${input.role.trim()}, ${input.level ?? null}, ${input.geography ?? null}, ${input.baseMin ?? null}, ${input.baseMax ?? null}, ${input.equityMin ?? null}, ${input.equityMax ?? null})
    RETURNING *`
  return normBand(rows[0])
}
