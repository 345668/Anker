/**
 * Data-room normalization + statement builder (Phiner-style sealed engine).
 *
 * Two deterministic stages layered on top of `reconcile.ts`:
 *   1. NORMALIZE — classify every ledger line into a standard chart-of-accounts
 *      category by a built-in keyword ruleset. Accounts the ruleset can't settle
 *      are left `unmapped` and surfaced as open questions — the engine never
 *      guesses a mapping.
 *   2. STATEMENTS — recompute a normalized P&L and an EBITDA bridge (reported
 *      net income → +interest +tax +D&A → EBITDA → +addbacks → Adjusted EBITDA)
 *      from the classified ledger.
 *
 * Invariant (from Phiner): no figure here is written by a model. The LLM may only
 * SUGGEST a category for an unmapped account and DRAFT addback rationale — every
 * amount is summed by this code, and every unmapped/ambiguous line becomes an
 * open question a person answers once.
 *
 * Sign convention: each row carries `signed = debit − credit` (or the amount
 * column as-is). In double-entry a P&L account's contribution to net income is
 * `−signed` (revenue is a credit → negative signed → positive income). Only P&L
 * categories feed net income; balance-sheet accounts (asset/liability/equity) are
 * classified and excluded from the P&L math.
 */

import { detectHeader, num } from "./reconcile"

export type CoaCategory =
  | "revenue" | "cogs" | "opex" | "depreciation" | "amortization"
  | "interest" | "tax" | "other_pnl"
  | "asset" | "liability" | "equity"
  | "unmapped"

/** P&L categories feed net income; the rest are balance-sheet. */
const PNL_CATS: CoaCategory[] = ["revenue", "cogs", "opex", "depreciation", "amortization", "interest", "tax", "other_pnl"]
const isPnl = (c: CoaCategory) => PNL_CATS.includes(c)

/**
 * Ordered keyword ruleset. First category whose keywords match the account label
 * wins, so more specific rows (depreciation, interest, tax) are tested before the
 * broad `opex` / `revenue` buckets. Every entry is auditable and deterministic.
 */
const COA_RULES: { category: CoaCategory; keywords: string[] }[] = [
  { category: "depreciation", keywords: ["depreciation", "depr expense", "accumulated depreciation"] },
  { category: "amortization", keywords: ["amortization", "amortisation"] },
  { category: "interest", keywords: ["interest expense", "interest income", "interest paid", "interest"] },
  { category: "tax", keywords: ["income tax", "tax expense", "corporate tax", "provision for tax", "deferred tax"] },
  { category: "cogs", keywords: ["cost of goods", "cost of sales", "cogs", "cost of revenue", "direct cost", "materials", "inventory expense"] },
  { category: "revenue", keywords: ["revenue", "sales", "turnover", "income from", "subscription income", "service income", "fees earned"] },
  { category: "opex", keywords: ["salaries", "wages", "payroll", "rent", "marketing", "advertising", "software", "subscriptions", "travel", "office", "utilities", "insurance", "professional fees", "legal", "consulting", "general and admin", "g&a", "sg&a", "operating expense", "expense", "hosting", "commission"] },
  { category: "other_pnl", keywords: ["gain on", "loss on", "foreign exchange", "fx gain", "fx loss", "other income", "other expense", "non-operating"] },
  { category: "asset", keywords: ["cash", "bank", "accounts receivable", "receivable", "prepaid", "fixed asset", "property", "plant", "equipment", "goodwill", "intangible", "deposit", "investment"] },
  { category: "liability", keywords: ["accounts payable", "payable", "accrued", "loan", "note payable", "deferred revenue", "unearned", "credit card", "vat", "gst payable"] },
  { category: "equity", keywords: ["equity", "retained earnings", "common stock", "share capital", "paid-in capital", "dividend", "distribution", "member capital", "reserves"] },
]

/** Classify one account label. Returns `unmapped` when no rule matches. */
export function classifyAccount(label: string): CoaCategory {
  const s = label.toLowerCase().trim()
  if (!s) return "unmapped"
  for (const rule of COA_RULES) {
    if (rule.keywords.some((k) => s.includes(k))) return rule.category
  }
  return "unmapped"
}

const isTotalLabel = (acct: string) => /\b(total|subtotal|sum)\b/.test(acct.toLowerCase())
const round2 = (n: number) => Math.round(n * 100) / 100

export interface NormalizedLine {
  /** 1-based source row. */
  row: number
  account: string
  category: CoaCategory
  /** debit − credit (or the amount column as-is). */
  signed: number
}

export interface NormalizeResult {
  headerRow: number
  dataRows: number
  lines: NormalizedLine[]
  /** Σ signed by category (raw, not sign-flipped). */
  byCategory: Record<CoaCategory, number>
  /** Distinct account labels the ruleset could not classify → open questions. */
  unmapped: { account: string; rows: number[]; signed: number }[]
}

/** STAGE 1 — classify every data line into the standard CoA. Totals/subtotals are
 *  skipped (they're derived, not source lines). */
export function normalizeLedger(aoa: (string | number)[][]): NormalizeResult {
  const det = detectHeader(aoa)
  const byCategory = Object.fromEntries(
    ["revenue", "cogs", "opex", "depreciation", "amortization", "interest", "tax", "other_pnl", "asset", "liability", "equity", "unmapped"].map((c) => [c, 0]),
  ) as Record<CoaCategory, number>
  const lines: NormalizedLine[] = []
  const unmappedMap = new Map<string, { account: string; rows: number[]; signed: number }>()
  if (!det) return { headerRow: 0, dataRows: 0, lines, byCategory, unmapped: [] }

  const { headerRow, cols } = det
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? []
    const acct = String(row[cols.account] ?? "").trim()
    if (!acct || isTotalLabel(acct)) continue // skip blanks + derived total rows
    const dv = cols.debit != null ? num(row[cols.debit]) : null
    const cv = cols.credit != null ? num(row[cols.credit]) : null
    const av = cols.amount != null ? num(row[cols.amount]) : null
    // Prefer explicit debit/credit; fall back to a signed amount column.
    let signed = 0
    if (dv != null && !Number.isNaN(dv)) signed += dv
    if (cv != null && !Number.isNaN(cv)) signed -= cv
    if (cols.debit == null && cols.credit == null && av != null && !Number.isNaN(av)) signed = av
    signed = round2(signed)

    const category = classifyAccount(acct)
    byCategory[category] = round2(byCategory[category] + signed)
    lines.push({ row: r + 1, account: acct, category, signed })
    if (category === "unmapped") {
      const key = acct.toLowerCase()
      const u = unmappedMap.get(key) ?? { account: acct, rows: [], signed: 0 }
      u.rows.push(r + 1); u.signed = round2(u.signed + signed)
      unmappedMap.set(key, u)
    }
  }
  return {
    headerRow: headerRow + 1, dataRows: lines.length, lines, byCategory,
    unmapped: [...unmappedMap.values()].sort((a, b) => Math.abs(b.signed) - Math.abs(a.signed)),
  }
}

export interface Addback {
  label: string
  amount: number
  /** LLM-drafted rationale (narrative only — the amount is caller-supplied, not model-computed here). */
  rationale?: string
}

export interface StatementResult {
  revenue: number
  cogs: number
  grossProfit: number
  opex: number
  ebitda: number
  depreciation: number
  amortization: number
  interest: number
  tax: number
  otherPnl: number
  netIncome: number
  /** EBITDA bridge: netIncome + interest + tax + D&A. */
  ebitdaFromBridge: number
  addbacks: Addback[]
  adjustedEbitda: number
  /** True when the ledger contained accounts the ruleset couldn't classify (net income is then partial). */
  hasUnmapped: boolean
  unmappedCount: number
}

/** STAGE 2 — recompute a normalized P&L + EBITDA bridge from the classified ledger.
 *  `addbacks` amounts are caller-supplied (a person's decision); the engine only sums. */
export function buildStatements(norm: NormalizeResult, addbacks: Addback[] = []): StatementResult {
  const c = norm.byCategory
  // Income-statement sign flip: contribution to net income is −signed.
  const revenue = round2(-c.revenue)          // revenue is a credit → −signed is positive
  const cogs = round2(c.cogs)                  // costs are debits → positive
  const opex = round2(c.opex)
  const depreciation = round2(c.depreciation)
  const amortization = round2(c.amortization)
  const interest = round2(c.interest)
  const tax = round2(c.tax)
  const otherPnl = round2(-c.other_pnl)        // treat as income line (credit-positive)
  const grossProfit = round2(revenue - cogs)
  // Net income = revenue − all expense categories (+ other P&L as income).
  const netIncome = round2(revenue - cogs - opex - depreciation - amortization - interest - tax + otherPnl)
  const ebitda = round2(grossProfit - opex + otherPnl)                     // before D&A, interest, tax
  const ebitdaFromBridge = round2(netIncome + interest + tax + depreciation + amortization)
  const addbackTotal = round2(addbacks.reduce((s, a) => s + (Number(a.amount) || 0), 0))
  const adjustedEbitda = round2(ebitdaFromBridge + addbackTotal)
  return {
    revenue, cogs, grossProfit, opex, ebitda, depreciation, amortization, interest, tax, otherPnl,
    netIncome, ebitdaFromBridge, addbacks, adjustedEbitda,
    hasUnmapped: norm.unmapped.length > 0, unmappedCount: norm.unmapped.length,
  }
}
