"use client"

/**
 * Fund ledger — statements + journal + manual-entry form.
 *
 * Zones:
 *   1. Statements header: P&L (income/expense fold) + balance sheet
 *      (assets = liabilities + equity check) + trial-balance status.
 *   2. Rebuild button: re-derives all auto entries from the record —
 *      calls, investments, valuation marks, exits, distributions.
 *   3. Journal table (auto + manual entries with DR/CR lines).
 *   4. Manual entry form: two+ lines against the venture chart,
 *      double-entry validated server-side.
 */

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, RefreshCw, Plus, Trash2, AlertTriangle, CheckCircle2, BookOpen,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import { VENTURE_CHART } from "@/lib/portfolio/ledger-constants"
import type { JournalEntryFull, FundStatements } from "@/lib/portfolio/fund-ledger"

interface Props {
  fund: FundFull
  initialEntries: JournalEntryFull[]
  initialStatements: FundStatements | null
  tablesReady: boolean
}

const usd = (n: number | null | undefined, showZero = true) => {
  if (n == null || (!showZero && n === 0)) return "—"
  const sign = n < 0 ? "-" : ""
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

interface DraftLine { accountCode: string; debit: string; credit: string }

export function FundLedgerClient({ fund, initialEntries, initialStatements, tablesReady }: Props) {
  const router = useRouter()
  const [entries, setEntries] = useState(initialEntries)
  const [statements, setStatements] = useState(initialStatements)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)

  // Manual entry draft
  const today = new Date().toISOString().slice(0, 10)
  const [mDate, setMDate] = useState(today)
  const [mMemo, setMMemo] = useState("")
  const [mLines, setMLines] = useState<DraftLine[]>([
    { accountCode: "5100", debit: "", credit: "" },
    { accountCode: "1000", debit: "", credit: "" },
  ])

  const api = `/api/portfolio/funds/${fund.id}/ledger`
  const s = statements

  async function refresh() {
    const res = await fetch(api)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setEntries(data.entries); setStatements(data.statements) }
  }

  async function rebuild() {
    setBusy("rebuild"); setError(null)
    try {
      const res = await fetch(`${api}/rebuild`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Rebuild failed (${res.status})`)
      await refresh()
      router.refresh()
    } catch (e: any) { setError(e?.message ?? "Rebuild failed") }
    finally { setBusy(null) }
  }

  async function postManual() {
    setBusy("manual"); setError(null)
    try {
      const lines = mLines
        .filter((l) => Number(l.debit) > 0 || Number(l.credit) > 0)
        .map((l) => ({
          accountCode: l.accountCode,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        }))
      const res = await fetch(`${api}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryDate: mDate, memo: mMemo, lines }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Post failed (${res.status})`)
      setMMemo("")
      setMLines([{ accountCode: "5100", debit: "", credit: "" }, { accountCode: "1000", debit: "", credit: "" }])
      setShowManual(false)
      await refresh()
      router.refresh()
    } catch (e: any) { setError(e?.message ?? "Post failed") }
    finally { setBusy(null) }
  }

  async function removeEntry(entryId: string) {
    setBusy(entryId); setError(null)
    try {
      const res = await fetch(`${api}/entries?entryId=${encodeURIComponent(entryId)}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Delete failed (${res.status})`)
      await refresh()
    } catch (e: any) { setError(e?.message ?? "Delete failed") }
    finally { setBusy(null) }
  }

  const draftDr = mLines.reduce((t, l) => t + (Number(l.debit) || 0), 0)
  const draftCr = mLines.reduce((t, l) => t + (Number(l.credit) || 0), 0)

  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
          <Link href="/dashboard/portfolio/fund"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" />
            {fund.name}
          </Link>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-3">
                <span className="w-8 h-px bg-foreground/30" />
                General ledger · double-entry from the record
              </span>
              <h1 className="text-4xl lg:text-5xl font-display tracking-tight leading-[0.95]">
                Fund books.
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowManual((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full h-11 px-5 border border-foreground/15 hover:bg-foreground/5 text-sm">
                <Plus className="w-4 h-4" />
                Manual entry
              </button>
              <button onClick={rebuild} disabled={busy === "rebuild" || !tablesReady}
                className="inline-flex items-center gap-2 rounded-full h-11 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {busy === "rebuild" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Rebuild from record
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8 space-y-8">
        {!tablesReady && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Journal tables missing. Run{" "}
              <code className="font-mono text-xs bg-foreground/10 px-1.5 py-0.5 rounded">
                NEON_DATABASE_URL=… node scripts/oneshot/run-fund-ledger-tables.mjs
              </code>{" "}
              and reload.
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">{error}</div>
        )}

        {s && (
          <>
            {/* Trial-balance status */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
              s.balanced ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"
            }`}>
              {s.balanced ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-destructive" />}
              <span>
                Trial balance {s.balanced ? "balances" : "DOES NOT balance"} — DR {usd(s.totalDebits)} · CR {usd(s.totalCredits)}
                {" · "}{s.entryCount} entries ({s.autoEntryCount} auto, {s.manualEntryCount} manual) · as of {s.asOf}
              </span>
            </div>

            {/* Statements */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* P&L */}
              <div className="border border-foreground/10 rounded-lg p-5">
                <h3 className="font-display text-lg mb-3">Fund P&amp;L</h3>
                <dl className="space-y-1.5 text-sm">
                  <Row k="Realized gain / (loss)" v={usd(s.pnl.realizedGain)} />
                  <Row k="Unrealized gain / (loss)" v={usd(s.pnl.unrealizedGain)} />
                  <Row k="Other income" v={usd(s.pnl.otherIncome)} />
                  <Row k="Management fees" v={usd(-s.pnl.managementFees, false)} />
                  <Row k="Fund expenses" v={usd(-s.pnl.fundExpenses, false)} />
                  <Row k="Organizational expenses" v={usd(-s.pnl.orgExpenses, false)} />
                  <div className="border-t border-foreground/10 pt-1.5 mt-1.5">
                    <Row k="Net income" v={usd(s.pnl.netIncome)} strong />
                  </div>
                </dl>
              </div>

              {/* Balance sheet */}
              <div className="border border-foreground/10 rounded-lg p-5">
                <h3 className="font-display text-lg mb-3">Balance sheet</h3>
                <dl className="space-y-1.5 text-sm">
                  <Row k="Cash" v={usd(s.balanceSheet.cash)} />
                  <Row k="Investments, at cost" v={usd(s.balanceSheet.investmentsAtCost)} />
                  <Row k="FV adjustment" v={usd(s.balanceSheet.fvAdjustment)} />
                  <div className="border-t border-foreground/10 pt-1.5 mt-1.5">
                    <Row k="Total assets" v={usd(s.balanceSheet.totalAssets)} strong />
                  </div>
                  <Row k="Liabilities" v={usd(s.balanceSheet.liabilities)} />
                  <Row k="Contributed capital" v={usd(s.balanceSheet.contributedCapital)} />
                  <Row k="Distributions to LPs" v={usd(-s.balanceSheet.distributions, false)} />
                  <Row k="Net result" v={usd(s.balanceSheet.retainedResult)} />
                  <div className="border-t border-foreground/10 pt-1.5 mt-1.5">
                    <Row k="Total equity" v={usd(s.balanceSheet.totalEquity)} strong />
                  </div>
                </dl>
              </div>

              {/* Trial balance */}
              <div className="border border-foreground/10 rounded-lg p-5 overflow-y-auto max-h-[360px]">
                <h3 className="font-display text-lg mb-3">Trial balance</h3>
                <table className="w-full text-xs">
                  <tbody>
                    {s.trialBalance.filter((r) => r.debits !== 0 || r.credits !== 0).map((r) => (
                      <tr key={r.code} className="border-t border-foreground/5">
                        <td className="py-1.5 font-mono text-muted-foreground">{r.code}</td>
                        <td className="py-1.5 pr-2">{r.name}</td>
                        <td className="py-1.5 font-mono text-right">{usd(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Manual entry form */}
        {showManual && (
          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <h3 className="font-display text-lg">Manual journal entry</h3>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Date</label>
                <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)}
                  className="h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
              </div>
              <div className="flex-1 min-w-[240px]">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Memo</label>
                <input value={mMemo} onChange={(e) => setMMemo(e.target.value)}
                  placeholder="e.g. Q3 management fee accrual, audit fee…"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              {mLines.map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select value={l.accountCode}
                    onChange={(e) => setMLines(mLines.map((x, j) => j === i ? { ...x, accountCode: e.target.value } : x))}
                    className="h-9 px-2 rounded-md border border-input bg-background text-sm font-mono min-w-[260px]">
                    {VENTURE_CHART.map((a) => (
                      <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
                    ))}
                  </select>
                  <input type="number" value={l.debit} placeholder="Debit"
                    onChange={(e) => setMLines(mLines.map((x, j) => j === i ? { ...x, debit: e.target.value, credit: "" } : x))}
                    className="h-9 w-32 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                  <input type="number" value={l.credit} placeholder="Credit"
                    onChange={(e) => setMLines(mLines.map((x, j) => j === i ? { ...x, credit: e.target.value, debit: "" } : x))}
                    className="h-9 w-32 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                  {mLines.length > 2 && (
                    <button onClick={() => setMLines(mLines.filter((_, j) => j !== i))}
                      className="p-1.5 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={() => setMLines([...mLines, { accountCode: "1000", debit: "", credit: "" }])}
                className="text-sm text-muted-foreground hover:text-foreground">+ line</button>
              <span className={`font-mono text-xs ${Math.abs(draftDr - draftCr) < 0.01 && draftDr > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                DR {usd(draftDr)} · CR {usd(draftCr)}
              </span>
              <button onClick={postManual}
                disabled={busy === "manual" || !mMemo.trim() || draftDr === 0 || Math.abs(draftDr - draftCr) > 0.01}
                className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {busy === "manual" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                Post entry
              </button>
            </div>
          </div>
        )}

        {/* Journal */}
        <div className="border border-foreground/10 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Journal · {entries.length} entries
          </div>
          {entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No entries yet. Hit &ldquo;Rebuild from record&rdquo; to derive the journal from
              paid capital calls, investments, valuation marks, and distributions.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-foreground/5">
                <tr>
                  {["Date", "Memo", "Source", "Account", "DR", "CR", ""].map((h) => (
                    <th key={h} className="p-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => e.lines.map((l, li) => (
                  <tr key={`${e.id}-${li}`} className={`border-t ${li === 0 ? "border-foreground/10" : "border-foreground/[0.03]"}`}>
                    <td className="p-2 font-mono">{li === 0 ? e.entry_date : ""}</td>
                    <td className="p-2 max-w-[280px] truncate">{li === 0 ? e.memo : ""}</td>
                    <td className="p-2 font-mono text-muted-foreground">{li === 0 ? e.source_kind : ""}</td>
                    <td className="p-2 font-mono">{l.account_code} · {l.account_name}</td>
                    <td className="p-2 font-mono text-right">{l.debit > 0 ? usd(l.debit) : ""}</td>
                    <td className="p-2 font-mono text-right">{l.credit > 0 ? usd(l.credit) : ""}</td>
                    <td className="p-2 text-right w-8">
                      {li === 0 && e.source_kind === "manual" && (
                        <button onClick={() => removeEntry(e.id)} disabled={busy === e.id}
                          className="p-1 text-muted-foreground hover:text-destructive" title="Delete manual entry">
                          {busy === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>{k}</dt>
      <dd className={`font-mono ${strong ? "font-medium" : ""}`}>{v}</dd>
    </div>
  )
}
