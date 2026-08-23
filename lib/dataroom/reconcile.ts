/**
 * Data-room reconciliation engine (Phiner-style "sealed engine").
 *
 * Deterministic, dependency-free reconciliation of a financial export (trial balance or
 * general ledger). The model never writes a final number — this code recomputes and
 * proves every figure, and anything that doesn't tie becomes an exception with a trace
 * to its source row. A person approves only the exceptions.
 *
 * Scope (MVP): a single sheet given as an array-of-arrays (from xlsx/csv). It:
 *   1. locates the header row + maps account / debit / credit / amount / balance columns,
 *   2. sums debits & credits and checks the trial balance ties (Σdebit = Σcredit),
 *   3. verifies each total / subtotal row equals the sum of its components,
 *   4. flags non-numeric amounts, blank accounts, and sign anomalies,
 *   5. emits a normalized ledger with a per-row status + source-row trace.
 */

const TOL = 0.005 // half a cent

export interface Exception {
  /** 1-based source row in the original sheet. */
  row: number
  kind: "unbalanced" | "total_mismatch" | "non_numeric" | "blank_account" | "sign"
  detail: string
  expected?: number
  got?: number
}

export interface ReconcileResult {
  kind: "trial_balance" | "ledger" | "unknown"
  headerRow: number // 1-based
  columns: { account: number; debit?: number; credit?: number; amount?: number; balance?: number }
  dataRows: number
  totals: { debit: number; credit: number; net: number; difference: number }
  balanced: boolean
  exceptions: Exception[]
  /** Normalized output: header + rows + Status + "Source row" trace columns. */
  normalized: (string | number)[][]
}

export const norm = (v: unknown) => String(v ?? "").trim().toLowerCase()

/** Parse a currency-ish cell to a number. Returns NaN if not parseable, null if blank. */
export function num(v: unknown): number | null {
  if (v === "" || v == null) return null
  if (typeof v === "number") return v
  let s = String(v).trim()
  if (!s) return null
  const neg = /^\(.*\)$/.test(s) // (1,234.00) = negative
  s = s.replace(/[(),$£€\s]/g, "").replace(/[^0-9.\-]/g, "")
  if (s === "" || s === "-" || s === ".") return NaN
  const n = Number(s)
  if (Number.isNaN(n)) return NaN
  return neg ? -Math.abs(n) : n
}

/** Find the header row and map columns by keyword. Shared by the normalize / statement
 *  stages so every data-room engine reads the same export the same way. */
export function detectHeader(aoa: (string | number)[][]): { headerRow: number; cols: ReconcileResult["columns"] } | null {
  const find = (cells: string[], keys: string[]) => cells.findIndex((c) => keys.some((k) => c.includes(k)))
  for (let r = 0; r < Math.min(aoa.length, 8); r++) {
    const cells = (aoa[r] ?? []).map(norm)
    const account = find(cells, ["account", "description", "gl name", "name", "ledger"])
    const debit = find(cells, ["debit", "dr"])
    const credit = find(cells, ["credit", "cr"])
    const amount = find(cells, ["amount", "value", "net"])
    const balance = find(cells, ["balance", "ending", "closing"])
    if (account >= 0 && (debit >= 0 || credit >= 0 || amount >= 0 || balance >= 0)) {
      return {
        headerRow: r,
        cols: {
          account,
          debit: debit >= 0 ? debit : undefined,
          credit: credit >= 0 ? credit : undefined,
          amount: amount >= 0 ? amount : undefined,
          balance: balance >= 0 ? balance : undefined,
        },
      }
    }
  }
  return null
}

export function reconcileSheet(aoa: (string | number)[][]): ReconcileResult {
  const det = detectHeader(aoa)
  if (!det) {
    return {
      kind: "unknown", headerRow: 0, columns: { account: -1 }, dataRows: 0,
      totals: { debit: 0, credit: 0, net: 0, difference: 0 }, balanced: false,
      exceptions: [{ row: 1, kind: "non_numeric", detail: "No recognizable header (need an account column + a debit/credit/amount/balance column)." }],
      normalized: [],
    }
  }
  const { headerRow, cols } = det
  const hasDC = cols.debit != null || cols.credit != null
  const kind: ReconcileResult["kind"] = hasDC ? "trial_balance" : "ledger"
  const exceptions: Exception[] = []
  let sumDebit = 0, sumCredit = 0, sumAmount = 0
  const out: (string | number)[][] = []

  // Normalized header
  const header = [...(aoa[headerRow] ?? []).map((c) => String(c ?? ""))]
  out.push([...header, "Status", "Source row"])

  const isTotalLabel = (acct: string) => /\b(total|subtotal|sum)\b/.test(acct.toLowerCase())
  let runningComponentDebit = 0, runningComponentCredit = 0, runningComponentAmount = 0

  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? []
    const srcRow = r + 1 // 1-based
    const acct = String(row[cols.account] ?? "").trim()
    if (!acct && row.every((c) => norm(c) === "")) continue // blank spacer row
    const status: string[] = []

    const dc = (idx: number | undefined) => (idx == null ? null : num(row[idx]))
    const dv = dc(cols.debit), cv = dc(cols.credit), av = dc(cols.amount), bv = dc(cols.balance)

    if (!acct) { exceptions.push({ row: srcRow, kind: "blank_account", detail: "Amount present with no account label." }); status.push("EXCEPTION:blank-account") }
    for (const [label, val, idx] of [["debit", dv, cols.debit], ["credit", cv, cols.credit], ["amount", av, cols.amount]] as const) {
      if (idx != null && Number.isNaN(val as number)) { exceptions.push({ row: srcRow, kind: "non_numeric", detail: `Non-numeric ${label}: "${row[idx]}"` }); status.push(`EXCEPTION:non-numeric-${label}`) }
    }

    if (isTotalLabel(acct)) {
      // Verify the total ties to the components accumulated since the last total.
      if (cols.debit != null && dv != null && !Number.isNaN(dv) && Math.abs(dv - runningComponentDebit) > TOL) {
        exceptions.push({ row: srcRow, kind: "total_mismatch", detail: `Debit total for "${acct}" does not tie.`, expected: round2(runningComponentDebit), got: round2(dv) }); status.push("EXCEPTION:total-mismatch")
      }
      if (cols.credit != null && cv != null && !Number.isNaN(cv) && Math.abs(cv - runningComponentCredit) > TOL) {
        exceptions.push({ row: srcRow, kind: "total_mismatch", detail: `Credit total for "${acct}" does not tie.`, expected: round2(runningComponentCredit), got: round2(cv) }); status.push("EXCEPTION:total-mismatch")
      }
      if (cols.amount != null && av != null && !Number.isNaN(av) && Math.abs(av - runningComponentAmount) > TOL) {
        exceptions.push({ row: srcRow, kind: "total_mismatch", detail: `Amount total for "${acct}" does not tie.`, expected: round2(runningComponentAmount), got: round2(av) }); status.push("EXCEPTION:total-mismatch")
      }
      runningComponentDebit = runningComponentCredit = runningComponentAmount = 0 // reset scope after a total
    } else {
      // A component line — accumulate (into grand totals + the current subtotal scope).
      if (dv != null && !Number.isNaN(dv)) { sumDebit += dv; runningComponentDebit += dv }
      if (cv != null && !Number.isNaN(cv)) { sumCredit += cv; runningComponentCredit += cv }
      if (av != null && !Number.isNaN(av)) { sumAmount += av; runningComponentAmount += av }
      if (cols.debit != null && dv != null && dv < 0) status.push("NOTE:negative-debit")
    }

    out.push([...header.map((_, i) => (row[i] ?? "") as string | number), status.length ? status.join("; ") : "OK", srcRow])
  }

  const difference = round2(sumDebit - sumCredit)
  const balanced = hasDC ? Math.abs(difference) <= TOL : true
  if (hasDC && !balanced) {
    exceptions.unshift({ row: headerRow + 1, kind: "unbalanced", detail: `Trial balance does not tie: debits ${round2(sumDebit)} vs credits ${round2(sumCredit)}.`, expected: round2(sumDebit), got: round2(sumCredit) })
  }

  return {
    kind, headerRow: headerRow + 1, columns: cols,
    dataRows: out.length - 1,
    totals: { debit: round2(sumDebit), credit: round2(sumCredit), net: round2(sumAmount), difference },
    balanced, exceptions, normalized: out,
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
