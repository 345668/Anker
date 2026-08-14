"use client"

/**
 * Capital calls — list + create panel.
 *
 * Rollup cards summarise the fund's commitment/called/uncalled position
 * pulled from getFundLpRollup so the operator sees at a glance how much
 * room there is for the next call.
 *
 * The "New call" panel shows the previewed total before submit
 * (commitment × pct), so a fund manager never accidentally calls 50%
 * when they meant 5%.
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Plus, Loader2, AlertTriangle, ArrowUpRight, Calendar,
  Wallet, CheckCircle2, AlertOctagon, XCircle, Send,
} from "lucide-react"
import type {
  FundFull, FundLpRollup,
} from "@/lib/portfolio/funds"
import type {
  CapitalCallFull, CallStatus,
} from "@/lib/portfolio/capital-calls"

interface Props {
  fund: FundFull
  initialCalls: CapitalCallFull[]
  rollup: FundLpRollup
  lpCount: number
}

const STATUS_META: Record<CallStatus, { label: string; tone: string; Icon: any }> = {
  draft:     { label: "Draft",     tone: "text-foreground/70 bg-foreground/5 border-foreground/10", Icon: undefined },
  sent:      { label: "Sent",      tone: "text-blue-600 bg-blue-500/10 border-blue-500/20",          Icon: Send },
  settled:   { label: "Settled",   tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", Icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "text-muted-foreground bg-foreground/5 border-foreground/10", Icon: XCircle },
}

export function CapitalCallsListClient({ fund, initialCalls, rollup, lpCount }: Props) {
  const router = useRouter()
  const [calls] = useState(initialCalls)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create-panel inputs
  const [title, setTitle] = useState("")
  const [purpose, setPurpose] = useState("")
  const [pct, setPct] = useState("")
  const [dueDate, setDueDate] = useState("")

  const previewTotal = useMemo(() => {
    const p = pct ? Number(pct) / 100 : 0
    if (!Number.isFinite(p) || p <= 0) return 0
    return Math.round(rollup.total_committed * p * 100) / 100
  }, [pct, rollup.total_committed])

  async function create() {
    if (!title.trim()) { setError("title required"); return }
    setCreating(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/capital-calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          purpose: purpose.trim() || null,
          defaultCallPct: pct ? Number(pct) / 100 : null,
          dueDate: dueDate || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Create failed (${res.status})`)
      router.push(`/dashboard/portfolio/fund/calls/${data.call.id}`)
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
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">Capital calls</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fund.name} · {lpCount} active LP{lpCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5"
            >
              <Plus className="w-4 h-4" /> Quick call
            </button>
            <Link
              href="/dashboard/portfolio/fund/calls/new"
              className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-4 h-4" /> Initiate capital activity
            </Link>
          </div>
        </div>
      </div>

      {/* Rollup */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden">
        <Rollup label="Committed" value={shortMoney(rollup.total_committed, fund.currency)} />
        <Rollup label="Called"    value={shortMoney(rollup.total_called, fund.currency)} />
        <Rollup label="Uncalled"  value={shortMoney(rollup.uncalled_remaining, fund.currency)} />
        <Rollup label="Calls"     value={calls.length.toString()} sub={`${calls.filter((c) => c.status === "draft").length} draft, ${calls.filter((c) => c.status === "sent").length} sent`} />
      </div>

      {/* Create panel */}
      {showCreate && (
        <div className="border border-foreground/15 rounded-md p-5 bg-foreground/[0.02]">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Title">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q2 2026 — Series A reserves" className={input} autoFocus />
            </Field>
            <Field label="Default call %" hint="e.g. 15 for 15%">
              <input type="number" step="0.1" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} className={input} />
            </Field>
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={input} />
            </Field>
            <Field label="Purpose" className="md:col-span-2">
              <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} placeholder="What this capital will be used for. Surfaced in the LP notice." className={`${input} resize-y`} />
            </Field>
          </div>
          {previewTotal > 0 && (
            <div className="mt-4 text-xs font-mono text-muted-foreground border-t border-foreground/10 pt-3">
              Preview total: <span className="text-foreground">{shortMoney(previewTotal, fund.currency)}</span> across {lpCount} LPs ({pct}% of {shortMoney(rollup.total_committed, fund.currency)} committed).
              Line items are computed per LP at create time; you can edit them on the detail page.
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={create} disabled={creating || !title.trim()} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create call
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

      {/* Calls list */}
      <div className="border border-foreground/10 rounded-md divide-y divide-foreground/10 bg-background">
        {calls.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Wallet className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No capital calls yet. Click "New call" to draft the first.
          </div>
        ) : calls.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard/portfolio/fund/calls/${c.id}`}
            className="flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] group"
          >
            <div className="w-10 h-10 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0 font-mono text-xs">
              #{c.call_number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-base text-foreground group-hover:translate-x-0.5 transition-transform">
                  {c.title}
                </span>
                <StatusChip status={c.status} />
                {c.due_date && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    <Calendar className="w-2.5 h-2.5 inline mr-1" /> due {c.due_date}
                  </span>
                )}
              </div>
              {c.purpose && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-1 max-w-2xl">
                  {c.purpose}
                </div>
              )}
            </div>
            <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 text-right">
              <div className="text-sm font-mono text-foreground">
                {shortMoney(c.total_amount, fund.currency)}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {c.default_call_pct != null ? `${(c.default_call_pct * 100).toFixed(1)}% of commitments` : "manual"}
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

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
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

function StatusChip({ status }: { status: CallStatus }) {
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
