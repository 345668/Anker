/**
 * Fund general ledger — Phase 3 of FUND_OPS_DESIGN.md §3.3.
 *
 * A venture-fund GL, not a general accounting system. Three ideas:
 *
 * 1. CODE-DEFINED CHART. ~14 accounts (VENTURE_CHART) — the closed set a
 *    venture fund actually needs. Journal lines store code + name so old
 *    entries stay readable even if the chart evolves.
 *
 * 2. EVENT-SOURCED PROJECTION. Instead of hooking write-paths in four
 *    modules (fragile, and Neon HTTP has no cross-statement transactions),
 *    rebuildJournal(fundId) derives every auto entry from the record:
 *
 *      paid capital-call lines      → DR Cash            / CR Contributed capital
 *      investment close (cost)      → DR Investments     / CR Cash
 *      valuation snapshot deltas    → DR/CR FV adjustment ↔ Unrealized gain
 *      exited / written-off         → realized result + unwind of cost & marks
 *      paid distribution lines      → DR Distributions   / CR Cash
 *
 *    Rebuild wipes only auto entries (source_kind != 'manual') and
 *    re-derives them — idempotent, retrofits history, survives corrections
 *    upstream. Manual entries (accruals, expenses, adjustments) persist.
 *
 * 3. STATEMENTS FROM THE JOURNAL. Trial balance, a fund P&L, and a
 *    balance sheet are pure folds over journal_lines — nothing else to
 *    keep in sync.
 */

import { sql } from "@/lib/db"
import { listInvestments } from "@/lib/portfolio/investments"
import { bookFeeEntries } from "@/lib/portfolio/fund-fees"

// ── chart of accounts ───────────────────────────────────────────────────
// Lives in ./ledger-constants (DB-free) so client components can render
// the chart without dragging the Postgres driver into the bundle.

import {
  VENTURE_CHART, getAccount,
  type Account, type AccountType,
} from "./ledger-constants"

export { VENTURE_CHART, getAccount }
export type { Account, AccountType }

// ── types ───────────────────────────────────────────────────────────────

export type SourceKind =
  | "manual" | "call_paid" | "investment_close" | "valuation"
  | "realized" | "distribution_paid" | "fee_accrual"

export interface JournalLine {
  account_code: string
  account_name: string
  debit: number
  credit: number
}

export interface JournalEntryFull {
  id: string
  fund_id: string
  entry_date: string
  memo: string
  source_kind: SourceKind
  source_id: string | null
  created_by: string | null
  created_at: string
  lines: JournalLine[]
}

export interface TrialBalanceRow {
  code: string
  name: string
  type: AccountType
  debits: number
  credits: number
  /** Signed balance in the account's natural direction (assets/expenses:
   *  DR positive; liabilities/equity/income: CR positive). */
  balance: number
}

export interface FundStatements {
  asOf: string
  trialBalance: TrialBalanceRow[]
  balanced: boolean               // Σ debits == Σ credits
  totalDebits: number
  totalCredits: number
  pnl: {
    realizedGain: number
    unrealizedGain: number
    otherIncome: number
    managementFees: number
    fundExpenses: number
    orgExpenses: number
    netIncome: number
  }
  balanceSheet: {
    cash: number
    investmentsAtCost: number
    fvAdjustment: number
    receivables: number
    totalAssets: number
    liabilities: number
    contributedCapital: number
    distributions: number         // negative equity (capital returned)
    retainedResult: number        // = net income, closed into equity
    totalEquity: number
  }
  entryCount: number
  autoEntryCount: number
  manualEntryCount: number
}

// ── schema-drift guard ──────────────────────────────────────────────────

let probe: Promise<boolean> | null = null
export function hasLedgerTables(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const rows = await sql`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('journal_entries', 'journal_lines')`
        return rows.length === 2
      } catch { return false }
    })()
  }
  return probe
}

// ── journal: read ───────────────────────────────────────────────────────

export async function listEntries(fundId: string, limit = 500): Promise<JournalEntryFull[]> {
  if (!(await hasLedgerTables())) return []
  const entries = await sql`
    SELECT * FROM journal_entries
     WHERE fund_id = ${fundId}
     ORDER BY entry_date ASC, created_at ASC
     LIMIT ${limit}`
  if (entries.length === 0) return []
  const ids = entries.map((e: any) => e.id)
  const lines = await sql`
    SELECT * FROM journal_lines WHERE entry_id = ANY(${ids})`
  const byEntry = new Map<string, JournalLine[]>()
  for (const l of lines as any[]) {
    const arr = byEntry.get(l.entry_id) ?? []
    arr.push({
      account_code: l.account_code,
      account_name: l.account_name,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    })
    byEntry.set(l.entry_id, arr)
  }
  return (entries as any[]).map((e) => ({
    id: e.id,
    fund_id: e.fund_id,
    entry_date: typeof e.entry_date === "string" ? e.entry_date : new Date(e.entry_date).toISOString().slice(0, 10),
    memo: e.memo,
    source_kind: e.source_kind,
    source_id: e.source_id ?? null,
    created_by: e.created_by ?? null,
    created_at: String(e.created_at),
    lines: byEntry.get(e.id) ?? [],
  }))
}

// ── journal: write ──────────────────────────────────────────────────────

export interface PostEntryInput {
  fundId: string
  entryDate: string               // YYYY-MM-DD
  memo: string
  lines: { accountCode: string; debit?: number; credit?: number }[]
  sourceKind?: SourceKind
  sourceId?: string | null
  createdBy?: string | null
}

export class LedgerError extends Error {
  constructor(msg: string, public readonly code: string) { super(msg); this.name = "LedgerError" }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Validates double-entry + chart membership, then writes entry + lines. */
export async function postEntry(input: PostEntryInput): Promise<string> {
  if (!input.lines || input.lines.length < 2) {
    throw new LedgerError("An entry needs at least two lines.", "too_few_lines")
  }
  let dr = 0, cr = 0
  const resolved = input.lines.map((l) => {
    const acct = getAccount(l.accountCode)
    if (!acct) throw new LedgerError(`Unknown account code ${l.accountCode}`, "unknown_account")
    const debit = round2(Math.max(0, Number(l.debit) || 0))
    const credit = round2(Math.max(0, Number(l.credit) || 0))
    if (debit > 0 && credit > 0) {
      throw new LedgerError("A line cannot be both debit and credit.", "mixed_line")
    }
    if (debit === 0 && credit === 0) {
      throw new LedgerError("A line must carry a debit or a credit.", "empty_line")
    }
    dr += debit; cr += credit
    return { acct, debit, credit }
  })
  if (Math.abs(dr - cr) > 0.01) {
    throw new LedgerError(`Entry does not balance: DR ${dr.toFixed(2)} vs CR ${cr.toFixed(2)}.`, "unbalanced")
  }

  const [entry] = await sql`
    INSERT INTO journal_entries (fund_id, entry_date, memo, source_kind, source_id, created_by)
    VALUES (${input.fundId}, ${input.entryDate}, ${input.memo},
            ${input.sourceKind ?? "manual"}, ${input.sourceId ?? null}, ${input.createdBy ?? null})
    RETURNING id` as any[]
  for (const l of resolved) {
    await sql`
      INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
      VALUES (${entry.id}, ${l.acct.code}, ${l.acct.name}, ${l.debit}, ${l.credit})`
  }
  return entry.id
}

export async function deleteEntry(id: string): Promise<boolean> {
  // Only manual entries are deletable — auto entries belong to the
  // projection and would just reappear on rebuild.
  const rows = await sql`
    DELETE FROM journal_entries WHERE id = ${id} AND source_kind = 'manual' RETURNING id`
  return rows.length > 0
}

// ── the projection: rebuild from the record ─────────────────────────────

export interface RebuildResult {
  entriesCreated: number
  callLines: number
  investments: number
  valuationDeltas: number
  realizedEvents: number
  distributionLines: number
  feeEntries: number
}

export async function rebuildJournal(fundId: string, by: string | null): Promise<RebuildResult> {
  if (!(await hasLedgerTables())) {
    throw new LedgerError("journal tables missing — run scripts/oneshot/run-fund-ledger-tables.mjs first.", "schema_missing")
  }

  // Wipe auto entries (manual survives). Lines cascade.
  await sql`DELETE FROM journal_entries WHERE fund_id = ${fundId} AND source_kind != 'manual'`

  const result: RebuildResult = {
    entriesCreated: 0, callLines: 0, investments: 0,
    valuationDeltas: 0, realizedEvents: 0, distributionLines: 0,
    feeEntries: 0,
  }
  const today = new Date().toISOString().slice(0, 10)
  const dateOf = (v: any): string =>
    v ? new Date(v).toISOString().slice(0, 10) : today

  // 1. Paid capital-call lines → DR Cash / CR Contributed capital
  try {
    const rows = await sql`
      SELECT cli.id, cli.amount, COALESCE(cli.paid_at, cc.sent_at, cc.created_at) AS at,
             cc.call_number, fl.lp_name
        FROM capital_call_line_items cli
        JOIN capital_calls cc ON cc.id = cli.call_id
        LEFT JOIN fund_lps fl ON fl.id = cli.fund_lp_id
       WHERE cc.fund_id = ${fundId} AND cli.status = 'paid' AND cli.amount > 0`
    for (const r of rows as any[]) {
      await postEntry({
        fundId, entryDate: dateOf(r.at),
        memo: `Capital call #${r.call_number} — ${r.lp_name ?? "LP"} paid`,
        lines: [
          { accountCode: "1000", debit: Number(r.amount) },
          { accountCode: "3000", credit: Number(r.amount) },
        ],
        sourceKind: "call_paid", sourceId: r.id, createdBy: by,
      })
      result.entriesCreated++; result.callLines++
    }
  } catch { /* calls tables absent */ }

  // 2. Investments + valuations + realized results
  const investments = await listInvestments(fundId)
  for (const inv of investments) {
    // 2a. Close at cost → DR Investments / CR Cash
    if (inv.cost_basis > 0) {
      await postEntry({
        fundId, entryDate: inv.invested_at ?? dateOf(inv.created_at),
        memo: `Investment — ${inv.company_name}${inv.round_name ? ` (${inv.round_name})` : ""}`,
        lines: [
          { accountCode: "1100", debit: inv.cost_basis },
          { accountCode: "1000", credit: inv.cost_basis },
        ],
        sourceKind: "investment_close", sourceId: inv.id, createdBy: by,
      })
      result.entriesCreated++; result.investments++
    }

    if (inv.status === "active") {
      // 2b. Valuation deltas: chain of snapshots vs cost basis.
      let prevFv = inv.cost_basis
      const snaps = await sql`
        SELECT id, as_of_date, fair_value, method FROM valuation_snapshots
         WHERE investment_id = ${inv.id}
         ORDER BY as_of_date ASC, created_at ASC`
      for (const s of snaps as any[]) {
        const fv = Number(s.fair_value) || 0
        const delta = round2(fv - prevFv)
        prevFv = fv
        if (Math.abs(delta) < 0.01) continue
        await postEntry({
          fundId, entryDate: dateOf(s.as_of_date),
          memo: `Mark ${delta > 0 ? "up" : "down"} — ${inv.company_name} (${s.method})`,
          lines: delta > 0
            ? [{ accountCode: "1200", debit: delta }, { accountCode: "4100", credit: delta }]
            : [{ accountCode: "4100", debit: -delta }, { accountCode: "1200", credit: -delta }],
          sourceKind: "valuation", sourceId: s.id, createdBy: by,
        })
        result.entriesCreated++; result.valuationDeltas++
      }
    } else {
      // 2c. Terminal positions: unwind cost (and any interim marks are
      // irrelevant — we never booked them for terminal positions) and
      // recognise the realized result.
      const proceeds = inv.realized_proceeds
      const cost = inv.cost_basis
      const gain = round2(proceeds - cost)
      const when = inv.exited_at ?? today
      const lines: { accountCode: string; debit?: number; credit?: number }[] = []
      if (proceeds > 0) lines.push({ accountCode: "1000", debit: proceeds })
      if (cost > 0) lines.push({ accountCode: "1100", credit: cost })
      if (gain > 0) lines.push({ accountCode: "4000", credit: gain })
      if (gain < 0) lines.push({ accountCode: "4000", debit: -gain })
      if (lines.length >= 2) {
        await postEntry({
          fundId, entryDate: when,
          memo: `${inv.status === "written_off" ? "Write-off" : "Exit"} — ${inv.company_name}`,
          lines,
          sourceKind: "realized", sourceId: inv.id, createdBy: by,
        })
        result.entriesCreated++; result.realizedEvents++
      }
    }
  }

  // 3. Paid distribution lines → DR Distributions to LPs / CR Cash
  try {
    const rows = await sql`
      SELECT dli.id, dli.amount, COALESCE(dli.paid_at, d.created_at) AS at,
             d.distribution_number, fl.lp_name
        FROM distribution_line_items dli
        JOIN distributions d ON d.id = dli.distribution_id
        LEFT JOIN fund_lps fl ON fl.id = dli.fund_lp_id
       WHERE d.fund_id = ${fundId} AND dli.status = 'paid' AND dli.amount > 0`
    for (const r of rows as any[]) {
      await postEntry({
        fundId, entryDate: dateOf(r.at),
        memo: `Distribution #${r.distribution_number ?? ""} — ${r.lp_name ?? "LP"} paid`,
        lines: [
          { accountCode: "3100", debit: Number(r.amount) },
          { accountCode: "1000", credit: Number(r.amount) },
        ],
        sourceKind: "distribution_paid", sourceId: r.id, createdBy: by,
      })
      result.entriesCreated++; result.distributionLines++
    }
  } catch { /* distributions tables absent */ }

  // 4. Management-fee accruals (Phase 4) → DR 5000 / CR 2000, and the
  //    cash payment leg when an accrual is marked paid.
  try {
    const n = await bookFeeEntries(fundId, postEntry, by)
    result.entriesCreated += n
    result.feeEntries = n
  } catch { /* fee tables absent */ }

  return result
}

// ── statements ──────────────────────────────────────────────────────────

export async function buildStatements(fundId: string): Promise<FundStatements | null> {
  if (!(await hasLedgerTables())) return null
  const entries = await listEntries(fundId, 10000)

  const byCode = new Map<string, { debits: number; credits: number }>()
  for (const e of entries) {
    for (const l of e.lines) {
      const agg = byCode.get(l.account_code) ?? { debits: 0, credits: 0 }
      agg.debits += l.debit
      agg.credits += l.credit
      byCode.set(l.account_code, agg)
    }
  }

  let totalDebits = 0, totalCredits = 0
  const trialBalance: TrialBalanceRow[] = VENTURE_CHART.map((a) => {
    const agg = byCode.get(a.code) ?? { debits: 0, credits: 0 }
    totalDebits += agg.debits
    totalCredits += agg.credits
    const natural =
      a.type === "asset" || a.type === "expense"
        ? agg.debits - agg.credits
        : agg.credits - agg.debits
    return {
      code: a.code, name: a.name, type: a.type,
      debits: round2(agg.debits), credits: round2(agg.credits),
      balance: round2(natural),
    }
  })

  const bal = (code: string) => trialBalance.find((r) => r.code === code)?.balance ?? 0

  const realizedGain = bal("4000")
  const unrealizedGain = bal("4100")
  const otherIncome = bal("4200")
  const managementFees = bal("5000")
  const fundExpenses = bal("5100")
  const orgExpenses = bal("5200")
  const netIncome = round2(realizedGain + unrealizedGain + otherIncome - managementFees - fundExpenses - orgExpenses)

  const cash = bal("1000")
  const investmentsAtCost = bal("1100")
  const fvAdjustment = bal("1200")
  const receivables = bal("1300")
  const totalAssets = round2(cash + investmentsAtCost + fvAdjustment + receivables)
  const liabilities = round2(bal("2000") + bal("2100"))
  const contributedCapital = bal("3000")
  const distributions = bal("3100")
  const totalEquity = round2(contributedCapital - distributions + netIncome)

  return {
    asOf: new Date().toISOString().slice(0, 10),
    trialBalance,
    balanced: Math.abs(totalDebits - totalCredits) < 0.01,
    totalDebits: round2(totalDebits),
    totalCredits: round2(totalCredits),
    pnl: { realizedGain, unrealizedGain, otherIncome, managementFees, fundExpenses, orgExpenses, netIncome },
    balanceSheet: {
      cash, investmentsAtCost, fvAdjustment, receivables, totalAssets,
      liabilities, contributedCapital, distributions,
      retainedResult: netIncome, totalEquity,
    },
    entryCount: entries.length,
    autoEntryCount: entries.filter((e) => e.source_kind !== "manual").length,
    manualEntryCount: entries.filter((e) => e.source_kind === "manual").length,
  }
}
