"use client"

/**
 * Capital account statement renderer.
 *
 * Pure presentation — the compute already happened in lib/portfolio/
 * capital-account.ts.  We just lay it out: header, summary cards, transaction
 * ledger.  Designed to look right on screen AND when printed (Cmd-P) — the
 * print stylesheet preserves typography and ledger structure so a copy of
 * this view IS the LP-deliverable artifact until the PDF endpoint lands.
 *
 * Two query-string knobs surface as inline editor inputs above the doc:
 *   - as_of: cutoff date for the transaction list + summary
 *   - nav:   per-LP NAV (drives TVPI / RVPI; DPI works without)
 *
 * Changing either re-navigates with the new query string; the server
 * component re-runs buildStatement and renders the updated artifact.
 */

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Printer, RefreshCw } from "lucide-react"
import type { CapitalAccountStatement } from "@/lib/portfolio/capital-account"

interface Props {
  statement: CapitalAccountStatement
}

export function StatementView({ statement }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { fund, lp, summary, transactions, asOfDate, generatedAt } = statement

  const [asOf, setAsOf] = useState<string>(asOfDate)
  const [nav, setNav] = useState<string>(summary.currentNav != null ? String(summary.currentNav) : "")
  const [refreshing, setRefreshing] = useState(false)

  function refresh() {
    setRefreshing(true)
    const sp = new URLSearchParams()
    if (asOf) sp.set("as_of", asOf)
    if (nav.trim()) sp.set("nav", nav.trim())
    const qs = sp.toString()
    router.replace(qs ? `?${qs}` : "?")
    router.refresh()
    // useRouter().refresh() resolves async via React; clear the spinner on
    // the next tick so the user gets feedback without us holding the button
    // permanently disabled if the server is slow.
    setTimeout(() => setRefreshing(false), 600)
  }

  return (
    <main className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      {/* Controls — hidden when printing */}
      <div className="border-b border-foreground/10 bg-foreground/[0.015] print:hidden">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-4 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/portfolio/fund"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to fund
          </Link>
          <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Capital account · {lp.lp_name}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase text-muted-foreground">
              As of
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="h-7 px-2 text-xs border border-foreground/15 rounded bg-background font-mono"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase text-muted-foreground">
              NAV ({fund.currency})
              <input
                type="number"
                step="1000"
                value={nav}
                onChange={(e) => setNav(e.target.value)}
                placeholder="optional"
                className="w-32 h-7 px-2 text-xs border border-foreground/15 rounded bg-background font-mono"
              />
            </label>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-foreground text-background hover:bg-foreground/90"
              title="Print / Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Statement body — same layout in print + screen */}
      <article className="max-w-5xl mx-auto px-6 lg:px-10 py-10 lg:py-14">
        {/* Header */}
        <header className="border-b border-foreground/15 pb-6 mb-8">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3 print:text-black/60">
            Capital Account Statement
          </div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-display text-3xl lg:text-4xl tracking-tight">{lp.lp_name}</h1>
              <div className="mt-1 text-sm text-muted-foreground print:text-black/70">
                {fund.name}
                {fund.vintage_year ? ` · Vintage ${fund.vintage_year}` : ""}
                {lp.lp_type ? ` · ${lp.lp_type.replace(/_/g, " ")}` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground print:text-black/60">
                Statement period
              </div>
              <div className="text-sm font-mono">As of {formatDate(asOfDate)}</div>
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5 print:text-black/50">
                Generated {formatTimestamp(generatedAt)}
              </div>
            </div>
          </div>
        </header>

        {/* Summary cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <Card label="Commitment" value={fmtMoney(summary.commitment, fund.currency)} />
          <Card label="Contributed (paid-in)" value={fmtMoney(summary.totalContributed, fund.currency)} />
          <Card label="Distributed" value={fmtMoney(summary.totalDistributed, fund.currency)} />
          <Card label="Uncalled" value={fmtMoney(summary.uncalledCommitment, fund.currency)} />
        </section>

        {/* Metrics — surface DPI always; TVPI/RVPI conditionally */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          <Card
            label="Net cash flow"
            value={fmtMoney(summary.netCashFlow, fund.currency)}
            tone={summary.netCashFlow >= 0 ? "positive" : "neutral"}
          />
          <Card label="DPI" value={fmtMultiple(summary.dpi)} hint="Distributions ÷ Contributions" />
          <Card
            label="TVPI"
            value={fmtMultiple(summary.tvpi)}
            hint={summary.currentNav == null ? "Pass ?nav=… to compute" : "(Dist + NAV) ÷ Contributions"}
            muted={summary.currentNav == null}
          />
          <Card
            label="RVPI"
            value={fmtMultiple(summary.rvpi)}
            hint={summary.currentNav == null ? "Pass ?nav=… to compute" : "NAV ÷ Contributions"}
            muted={summary.currentNav == null}
          />
        </section>

        {/* Ownership and ownership rail */}
        <section className="mb-8 flex flex-wrap items-center gap-6 text-sm">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-2 print:text-black/60">
              Ownership of fund
            </span>
            <span className="font-mono">
              {lp.ownership_pct != null ? `${(lp.ownership_pct * 100).toFixed(2)}%` : "—"}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-2 print:text-black/60">
              Status
            </span>
            <span className="font-mono uppercase">{lp.status.replace(/_/g, " ")}</span>
          </div>
          {lp.signed_at && (
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-2 print:text-black/60">
                Signed
              </span>
              <span className="font-mono">{formatDate(lp.signed_at)}</span>
            </div>
          )}
          {lp.contact_email && (
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-2 print:text-black/60">
                Primary contact
              </span>
              <span className="font-mono">{lp.contact_email}</span>
            </div>
          )}
        </section>

        {/* Transaction ledger */}
        <section className="mb-12">
          <h2 className="font-display text-xl tracking-tight mb-3">Transaction history</h2>
          {transactions.length === 0 ? (
            <div className="border border-foreground/10 rounded-md p-8 text-center text-sm text-muted-foreground print:text-black/60">
              No paid transactions recorded for this LP {asOfDate ? `as of ${formatDate(asOfDate)}` : ""}.
            </div>
          ) : (
            <div className="border border-foreground/15 rounded-md overflow-hidden print:rounded-none">
              <table className="w-full text-sm">
                <thead className="bg-foreground/5 print:bg-black/5">
                  <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground print:text-black/60">
                    <th className="px-3 py-2 w-24">Date</th>
                    <th className="px-3 py-2 w-24">Ref</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2 text-right">Contribution</th>
                    <th className="px-3 py-2 text-right">Distribution</th>
                    <th className="px-3 py-2 text-right">Uncalled</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t, idx) => (
                    <tr
                      key={`${t.date}-${t.type}-${t.referenceNumber}-${idx}`}
                      className="border-t border-foreground/5 align-top"
                    >
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground print:text-black/60">
                        {t.type === "contribution" ? `Call #${t.referenceNumber}` : `Dist #${t.referenceNumber}`}
                      </td>
                      <td className="px-3 py-2">
                        <div>{t.title}</div>
                        {t.notes && (
                          <div className="text-[11px] text-muted-foreground italic mt-0.5 print:text-black/60">
                            {t.notes}
                          </div>
                        )}
                        {t.paymentRef && (
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5 print:text-black/60">
                            Ref: {t.paymentRef}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                        {t.type === "contribution" ? fmtMoney(t.amount, fund.currency) : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                        {t.type === "distribution" ? fmtMoney(t.amount, fund.currency) : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap print:text-black/60">
                        {fmtMoney(t.runningUncalledCommitment, fund.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-foreground/20 bg-foreground/5 print:bg-black/5 font-medium">
                    <td className="px-3 py-2" colSpan={3}>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground print:text-black/60">
                        Totals
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtMoney(summary.totalContributed, fund.currency)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmtMoney(summary.totalDistributed, fund.currency)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground print:text-black/60">
                      {fmtMoney(summary.uncalledCommitment, fund.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="border-t border-foreground/10 pt-5 text-[11px] font-mono text-muted-foreground leading-relaxed print:text-black/60">
          <p>
            This statement reflects PAID transactions only as of {formatDate(asOfDate)}. Pending capital calls and
            notified-but-unpaid distributions are excluded. Performance multiples are computed on a per-LP basis
            using the values shown here.
          </p>
          <p className="mt-2">
            Generated by Anker on {formatTimestamp(generatedAt)}. For questions, contact{" "}
            <a href={`mailto:${lp.contact_email ?? "lps@an-ker.de"}`} className="underline">
              {lp.contact_email ?? "lps@an-ker.de"}
            </a>
            .
          </p>
        </footer>
      </article>

      {/* Print rules — keep the artifact clean on paper */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          article {
            padding: 24px !important;
            max-width: 100% !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
        }
      `}</style>
    </main>
  )
}

// ── small components ──────────────────────────────────────────────────

function Card({
  label, value, hint, tone, muted,
}: {
  label: string
  value: string
  hint?: string
  tone?: "positive" | "neutral"
  muted?: boolean
}) {
  return (
    <div
      className={`border border-foreground/10 rounded-md p-3 ${
        muted ? "bg-foreground/[0.015]" : "bg-background"
      } print:border-black/30`}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground print:text-black/60">
        {label}
      </div>
      <div
        className={`font-display text-xl mt-1 ${
          tone === "positive" ? "text-emerald-700 dark:text-emerald-400 print:text-emerald-700" : ""
        } ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px] font-mono text-muted-foreground mt-1 print:text-black/50">{hint}</div>
      )}
    </div>
  )
}

// ── formatters ────────────────────────────────────────────────────────

function fmtMoney(amount: number | null, currency: string): string {
  if (amount == null) return "—"
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    // Fallback when currency code is invalid for Intl.
    return `${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`
  }
}

function fmtMultiple(x: number | null): string {
  if (x == null) return "—"
  return `${x.toFixed(2)}×`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}
