/**
 * Fund ledger — pure constants (NO database imports).
 *
 * Safe to import from client components. The DB-backed journal functions
 * live in ./fund-ledger; importing runtime values from that module drags
 * the Postgres driver into the browser bundle and breaks the build
 * (same pattern as ./deal-constants).
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense"

export interface Account {
  code: string
  name: string
  type: AccountType
}

/** The venture-fund chart of accounts — a deliberately closed set.
 *  Journal lines denormalise code + name so history stays readable
 *  even if this chart evolves. */
export const VENTURE_CHART: Account[] = [
  { code: "1000", name: "Cash",                          type: "asset" },
  { code: "1100", name: "Investments, at cost",          type: "asset" },
  { code: "1200", name: "Investments, FV adjustment",    type: "asset" },
  { code: "1300", name: "Receivable from LPs",           type: "asset" },
  { code: "2000", name: "Due to manager (fees payable)", type: "liability" },
  { code: "2100", name: "Distributions payable",         type: "liability" },
  { code: "3000", name: "Contributed capital",           type: "equity" },
  { code: "3100", name: "Distributions to LPs",          type: "equity" },
  { code: "4000", name: "Realized gain / (loss)",        type: "income" },
  { code: "4100", name: "Unrealized gain / (loss)",      type: "income" },
  { code: "4200", name: "Interest & other income",       type: "income" },
  { code: "5000", name: "Management fees",               type: "expense" },
  { code: "5100", name: "Fund expenses",                 type: "expense" },
  { code: "5200", name: "Organizational expenses",       type: "expense" },
]

const ACCOUNT_BY_CODE = new Map(VENTURE_CHART.map((a) => [a.code, a]))

export function getAccount(code: string): Account | undefined {
  return ACCOUNT_BY_CODE.get(code)
}
