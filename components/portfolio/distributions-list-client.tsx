"use client"

/**
 * Distributions list + create panel.
 *
 * The create panel is richer than the capital-calls one because the GP
 * actually has to make decisions here: which portco the proceeds trace
 * to, what the gross was, what the mgmt-fee + carry deductions are, and
 * what the net distributable is. We compute net live as the user types.
 *
 * DPI rollup at top is the KPI LPs ask about most: distributions / called
 * capital. Numbers update after each new distribution is created.
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Plus, Loader2, AlertTriangle, ArrowUpRight, Calendar,
  Banknote, CheckCircle2, Send, XCircle, TrendingUp, Building2,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type {
  DistributionFull, DistributionStatus, FundDistributionRollup,
} from "@/lib/portfolio/distributions"

interface CompanyLite { id: string; name: string; status: string }

interface Props {
  fund: FundFull
  initialDistributions: DistributionFull[]
  rollup: FundDistributionRollup
  activeLpCount: number
  companies: CompanyLite[]
}

const STATUS_META: Record<DistributionStatus, { label: string; tone: string; Icon: any }> = {
  draft:     { label: "Draft",     tone: "text-foreground/70 bg-foreground/5 border-foreground/10",       Icon: undefined },
  notified:  { label: "Notified",  tone: "text-blue-600 bg-blue-500/10 border-blue-500/20",                Icon: Send },
  paid:      { label: "Paid",      tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",       Icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "text-muted-foreground bg-foreground/5 border-foreground/10",     Icon: XCircle },
}

export function DistributionsListClient({
  fund, initialDistributions, rollup, activeLpCount, companies,
}: Props) {
  const router = useRouter()
  const [items] = useState(initialDistributions)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create-panel inputs
  const [title, setTitle] = useState("")
  const [source, setSource] = useState("")
  const [sourceCompanyId, setSourceCompanyId] = useState("")
  const [gross, setGross] = useState("")
  const [mgmtFee, setMgmtFee] = useState("")
  const [carry, setCarry] = useState("")
  const [netOverride, setNetOverride] = useState("")
  const [paymentDate, setPaymentDate] = useState("")

  const computedNet = useMemo(() => {
    if (netOverride) return Number(netOverride) || 0
    const g = Number(gross) || 0
    const m = Number(mgmtFee) || 0
    const c = Number(carry) || 0
    return Math.max(0, g - m - c)
  }, [gross, mgmtFee, carry, netOverride])

  async function create() {
    if (!title.trim()) { setError("title required"); return }
    setCreating(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          source: source.trim() || null,
          sourceCompanyId: sourceCompanyId || null,
          grossAmount: gross ? Number(gross) : null,
          mgmtFeeDeduction: mgmtFee ? Number(mgmtFee) : null,
          carryDeduction: carry ? Number(carry) : null,
          netAmount: netOverride ? Number(netOverride) : null,
          paymentDate: paymentDate || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Create failed (${res.status})`)
      router.push(`/dashboard/portfolio/fund/distributions/${data.distribution.id}`)
    } catch (e: any) { setError(e?.message ?? "Create failed") }
    finally { setCreating(false) }
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8">
      <div>
        <Link href="/dashboard/portfolio/fund" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Fund & LPs
        </Link>
        <div className="mt-3 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">Distributions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fund.name} · {activeLpCount} active LP{activeLpCount === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button" onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="w-4 h-4" /> New distribution
          </button>
        </div>
      </div>

      {/* Rollup */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden">
        <Rollup label="Distributed"      value={shortMoney(rollup.total_distributed, fund.currency)} />
        <Rollup label="Called"           value={shortMoney(rollup.total_called, fund.currency)} />
        <Rollup
          label="DPI"
          value={rollup.dpi != null ? rollup.dpi.toFixed(2) + "x" : "—"}
          sub="distributed / called"
        />
        <Rollup
          label="Of commitments"
          value={rollup.pct_of_commitment != null ? (rollup.pct_of_commitment * 100).toFixed(1) + "%" : "—"}
          sub={`${rollup.num_paid}/${rollup.num_distributions} paid`}
        />
      </div>

      {/* Create panel */}
      {showCreate && (
        <div className="border border-foreground/15 rounded-md p-5 bg-foreground/[0.02]">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Title">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Acme Labs — Series A secondary" className={input} autoFocus />
            </Field>
            <Field label="Payment date">
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={input} />
            </Field>
            <Field label="Source company" hint="Optional — links to a portco">
              <select value={sourceCompanyId} onChange={(e) => setSourceCompanyId(e.target.value)} className={input}>
                <option value="">—</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.status !== "active" ? `· ${c.status}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source description">
              <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Series A secondary sale to Lead Co" className={input} />
            </Field>
            <Field label={`Gross (${fund.currency})`}>
              <input type="number" step="10000" value={gross} onChange={(e) => setGross(e.target.value)} className={input} />
            </Field>
            <Field label={`Mgmt fee deduction (${fund.currency})`}>
              <input type="number" step="1000" value={mgmtFee} onChange={(e) => setMgmtFee(e.target.value)} className={input} />
            </Field>
            <Field label={`Carry deduction (${fund.currency})`}>
              <input type="number" step="1000" value={carry} onChange={(e) => setCarry(e.target.value)} className={input} />
            </Field>
            <Field label={`Net distributable override (${fund.currency})`} hint="Leave blank to use gross - mgmt - carry">
              <input type="number" step="1000" value={netOverride} onChange={(e) => setNetOverride(e.target.value)} className={input} />
            </Field>
          </div>

          {computedNet > 0 && (
            <div className="mt-4 text-xs font-mono text-muted-foreground border-t border-foreground/10 pt-3">
              Net distributable: <span className="text-foreground text-sm">{shortMoney(computedNet, fund.currency)}</span>
              {" "}allocated pro-rata across {activeLpCount} LPs based on ownership share.
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={create} disabled={creating || !title.trim()} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create distribution
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">Cancel</button>
          </div>
          {error && (
            <div className="mt-3 px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
              <AlertTriangle className="w-3 h-3" /> {error}
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="border border-foreground/10 rounded-md divide-y divide-foreground/10 bg-background">
        {items.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Banknote className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No distributions yet. Click "New distribution" to log the first.
          </div>
        ) : items.map((d) => (
          <Link
            key={d.id}
            href={`/dashboard/portfolio/fund/distributions/${d.id}`}
            className="flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] group"
          >
            <div className="w-10 h-10 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0 font-mono text-xs">
              #{d.distribution_number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-base text-foreground group-hover:translate-x-0.5 transition-transform">
                  {d.title}
                </span>
                <StatusChip status={d.status} />
                {d.payment_date && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    <Calendar className="w-2.5 h-2.5 inline mr-1" /> {d.payment_date}
                  </span>
                )}
                {d.source_company_id && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-0.5">
                    <Building2 className="w-2.5 h-2.5" /> portco
                  </span>
                )}
              </div>
              {d.source && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-1 max-w-2xl">
                  {d.source}
                </div>
              )}
            </div>
            <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 text-right">
              <div className="text-sm font-mono text-emerald-600">
                {shortMoney(d.net_amount, fund.currency)}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                net distributable
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

const input = "w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
        {hint && <span className="text-[10px] font-mono text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Rollup({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background p-4 lg:p-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="font-display text-2xl lg:text-3xl mt-1 tracking-tight">{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function StatusChip({ status }: { status: DistributionStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.Icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${meta.tone}`}>
      {Icon && <Icon className="w-2.5 h-2.5" />}
      {meta.label}
    </span>
  )
}

function shortMoney(n: number, currency: string): string {
  if (!n) return `${currency} 0`
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${currency} ${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${currency} ${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${currency} ${(n / 1e3).toFixed(0)}K`
  return `${currency} ${n.toFixed(0)}`
}
