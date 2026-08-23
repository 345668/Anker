/**
 * Schedule K-1 generation engine (per-LP fund tax allocation).
 *
 * Sealed-engine pattern: this code allocates the fund's tax-year income to each LP
 * by ownership and builds each LP's capital-account rollforward from real paid
 * capital-call / distribution line items (`lib/portfolio/capital-account`). It never
 * invents a number — the LP figures are the fund's figures × the LP's ownership.
 *
 * The one input a person owns is the **fund-level tax income for the year** (Part III
 * boxes). It defaults to the fund ledger's P&L (`lib/portfolio/fund-ledger`) but the
 * GP can override each box before issuing, because the ledger is kept "to date" rather
 * than strictly tax-year-scoped and unrealized gains are book-only (excluded from
 * taxable allocation). Every K-1 carries a basis note so the GP confirms before filing.
 */
import { getFundById, getLpById, listLps, type FundFull, type FundLpFull } from "./funds"
import { buildStatement } from "./capital-account"
import { buildStatements } from "./fund-ledger"

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** Fund-level tax income for the year — the GP-owned inputs (Part III). */
export interface FundTaxIncome {
  /** Ordinary business + interest + other income (K-1 boxes 1/5/11). */
  ordinaryIncome: number
  /** Net realized capital gain (K-1 boxes 8/9a). Unrealized is book-only, excluded. */
  realizedGain: number
  /** Deductions — mgmt fees + fund + org expenses (K-1 box 13). Positive number. */
  deductions: number
}

export interface K1Line {
  lpId: string
  lpName: string
  ownershipPct: number
  // Part III — allocated income (LP share).
  ordinaryIncome: number
  realizedGain: number
  deductions: number
  netAllocated: number
  // Part II item L — capital account rollforward for the tax year.
  beginningCapital: number
  contributionsDuringYear: number
  distributionsDuringYear: number
  endingCapital: number
}

export interface K1Batch {
  fund: FundFull
  taxYear: number
  currency: string
  /** The fund-level basis actually used (defaulted from the ledger or overridden). */
  fundIncome: FundTaxIncome
  /** True when fundIncome came from the ledger (needs GP confirmation), false when overridden. */
  fromLedger: boolean
  incomeBasisNote: string
  lines: K1Line[]
}

/** Ownership weight for an LP: explicit ownership_pct, else commitment share. */
function ownershipWeight(lp: FundLpFull, totalCommitment: number): number {
  if (lp.ownership_pct != null && lp.ownership_pct > 0) return lp.ownership_pct
  if (totalCommitment > 0 && lp.commitment_amount) return lp.commitment_amount / totalCommitment
  return 0
}

/** Default fund tax income from the ledger P&L (unrealized excluded). */
async function ledgerIncome(fundId: string): Promise<FundTaxIncome | null> {
  const st = await buildStatements(fundId)
  if (!st) return null
  const p = st.pnl
  return {
    ordinaryIncome: round2(p.otherIncome),
    realizedGain: round2(p.realizedGain),
    deductions: round2((p.managementFees ?? 0) + (p.fundExpenses ?? 0) + (p.orgExpenses ?? 0)),
  }
}

/** Build K-1 lines for every LP in a fund for a tax year. */
export async function buildFundK1s(
  fundId: string,
  taxYear: number,
  opts: { fundIncome?: Partial<FundTaxIncome> } = {},
): Promise<K1Batch | null> {
  const fund = await getFundById(fundId)
  if (!fund) return null
  const lps = (await listLps(fundId)).filter((l) => l.status !== "transferred")

  const ledger = await ledgerIncome(fundId)
  const overridden = !!opts.fundIncome && Object.keys(opts.fundIncome).length > 0
  const fundIncome: FundTaxIncome = {
    ordinaryIncome: round2(opts.fundIncome?.ordinaryIncome ?? ledger?.ordinaryIncome ?? 0),
    realizedGain: round2(opts.fundIncome?.realizedGain ?? ledger?.realizedGain ?? 0),
    deductions: round2(opts.fundIncome?.deductions ?? ledger?.deductions ?? 0),
  }
  const fromLedger = !overridden && !!ledger
  const netAllocable = round2(fundIncome.ordinaryIncome + fundIncome.realizedGain - fundIncome.deductions)

  const totalCommitment = lps.reduce((s, l) => s + (l.commitment_amount ?? 0), 0)
  const startCut = `${taxYear - 1}-12-31T23:59:59Z`
  const endCut = `${taxYear}-12-31T23:59:59Z`

  const lines: K1Line[] = []
  for (const lp of lps) {
    const pct = ownershipWeight(lp, totalCommitment)
    const [start, end] = await Promise.all([
      buildStatement({ fundId, lpId: lp.id, asOfDate: startCut }),
      buildStatement({ fundId, lpId: lp.id, asOfDate: endCut }),
    ])
    const startContrib = start?.summary.totalContributed ?? 0
    const startDist = start?.summary.totalDistributed ?? 0
    const endContrib = end?.summary.totalContributed ?? 0
    const endDist = end?.summary.totalDistributed ?? 0

    const beginningCapital = round2(startContrib - startDist)
    const contributionsDuringYear = round2(endContrib - startContrib)
    const distributionsDuringYear = round2(endDist - startDist)
    const ordinaryIncome = round2(fundIncome.ordinaryIncome * pct)
    const realizedGain = round2(fundIncome.realizedGain * pct)
    const deductions = round2(fundIncome.deductions * pct)
    const netAllocated = round2(netAllocable * pct)
    const endingCapital = round2(beginningCapital + contributionsDuringYear - distributionsDuringYear + netAllocated)

    lines.push({
      lpId: lp.id, lpName: lp.lp_name, ownershipPct: pct,
      ordinaryIncome, realizedGain, deductions, netAllocated,
      beginningCapital, contributionsDuringYear, distributionsDuringYear, endingCapital,
    })
  }

  return {
    fund, taxYear, currency: (fund as any).currency ?? "USD",
    fundIncome, fromLedger,
    incomeBasisNote: fromLedger
      ? "Fund-level income defaulted from the fund ledger (kept to date; unrealized gains excluded as book-only). Confirm against the tax-year books before filing."
      : "Fund-level income supplied by the GP for this tax year.",
    lines,
  }
}

const money = (n: number, ccy: string) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 })

/** Render one LP's K-1 as Markdown for the branded docx generator. */
export function k1ToMarkdown(batch: K1Batch, line: K1Line): string {
  const c = batch.currency
  const pct = `${(line.ownershipPct * 100).toFixed(4)}%`
  return [
    `# Schedule K-1 (informational) — ${batch.fund.name}`,
    ``,
    `**Tax year:** ${batch.taxYear}  ·  **Partner:** ${line.lpName}  ·  **Ownership:** ${pct}`,
    ``,
    `## Part III — Partner's share of income, deductions`,
    ``,
    `| Box | Item | Amount |`,
    `|---|---|---|`,
    `| 1/5/11 | Ordinary business + interest + other income | ${money(line.ordinaryIncome, c)} |`,
    `| 8/9a | Net realized capital gain | ${money(line.realizedGain, c)} |`,
    `| 13 | Deductions | (${money(line.deductions, c)}) |`,
    `| — | **Net allocated income** | **${money(line.netAllocated, c)}** |`,
    ``,
    `## Part II, Item L — Partner's capital account (tax year ${batch.taxYear})`,
    ``,
    `| Line | Amount |`,
    `|---|---|`,
    `| Beginning capital account | ${money(line.beginningCapital, c)} |`,
    `| Capital contributed during the year | ${money(line.contributionsDuringYear, c)} |`,
    `| Current-year net income (loss) | ${money(line.netAllocated, c)} |`,
    `| Distributions during the year | (${money(line.distributionsDuringYear, c)}) |`,
    `| **Ending capital account** | **${money(line.endingCapital, c)}** |`,
    ``,
    `---`,
    ``,
    `*${batch.incomeBasisNote} Capital account on a contributed-capital basis plus current-year`,
    `allocated income; figures are engine-computed from paid capital-call and distribution`,
    `records and allocated by ownership. This is an informational summary, not a filed IRS`,
    `Schedule K-1 (Form 1065) — have your fund administrator or tax advisor prepare the final form.*`,
  ].join("\n")
}
