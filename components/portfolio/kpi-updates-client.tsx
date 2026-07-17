"use client"

/**
 * KpiUpdatesClient — paste-an-update ingestion + review queue.
 *
 *   Left: paste an investor update → "Extract KPIs" runs the AI, which
 *   queues a pending extraction.
 *   Right: the pending queue. Each card shows the matched company (editable
 *   picker), the reporting month, and every extracted metric as an editable
 *   field with the AI's confidence. Approve writes portfolio_kpis_monthly;
 *   Dismiss drops it. A tab switches to the approved/dismissed history.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */

import { useState } from "react"
import useSWR from "swr"
import {
  Sparkles, Loader2, Check, X, Trash2, Inbox, Mail, ClipboardPaste,
} from "lucide-react"

interface Company { id: string; name: string }

interface Extraction {
  id: string
  company_id: string | null
  matched_name: string | null
  company_name: string | null
  month_end: string | null
  cash_balance: number | null
  monthly_burn: number | null
  runway_months: number | null
  monthly_revenue: number | null
  revenue_growth_mom: number | null
  gross_margin_pct: number | null
  headcount: number | null
  customers: number | null
  arr: number | null
  highlights: string | null
  confidence: number | null
  status: string
  created_at: string
}

const fetcher = (u: string) => fetch(u).then((r) => r.json())

const METRICS: { key: keyof Extraction; label: string; money?: boolean }[] = [
  { key: "monthly_revenue", label: "MRR", money: true },
  { key: "arr", label: "ARR", money: true },
  { key: "monthly_burn", label: "Burn", money: true },
  { key: "cash_balance", label: "Cash", money: true },
  { key: "runway_months", label: "Runway (mo)" },
  { key: "revenue_growth_mom", label: "Growth MoM %" },
  { key: "gross_margin_pct", label: "Gross margin %" },
  { key: "headcount", label: "Headcount" },
  { key: "customers", label: "Customers" },
]

export function KpiUpdatesClient({ companies }: { companies: Company[] }) {
  const [tab, setTab] = useState<"pending" | "approved" | "dismissed">("pending")
  const [raw, setRaw] = useState("")
  const [extracting, setExtracting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const { data, mutate, isLoading } = useSWR<{ extractions: Extraction[] }>(
    `/api/portfolio/kpi-updates?status=${tab}`, fetcher)
  const list = data?.extractions ?? []

  async function extract() {
    if (raw.trim().length < 20) { setMsg("Paste a longer update."); return }
    setExtracting(true); setMsg(null)
    try {
      const res = await fetch("/api/portfolio/kpi-updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: raw }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? "Extraction failed")
      setMsg(d.matched ? `Matched ${d.matched.name} — review it on the right.` : "Extracted — pick the company on the right.")
      setRaw(""); setTab("pending"); mutate()
    } catch (e: any) { setMsg(e?.message ?? "Extraction failed") }
    finally { setExtracting(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/portfolio/kpi-updates/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    mutate()
  }
  async function approve(id: string) {
    const res = await fetch(`/api/portfolio/kpi-updates/${id}/approve`, { method: "POST" })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d?.error ?? "Approve failed"); return }
    setMsg("Saved to portfolio KPIs."); mutate()
  }
  async function dismiss(id: string) {
    await fetch(`/api/portfolio/kpi-updates/${id}/dismiss`, { method: "POST" }); mutate()
  }
  async function remove(id: string) {
    if (!confirm("Delete this extraction?")) return
    await fetch(`/api/portfolio/kpi-updates/${id}`, { method: "DELETE" }); mutate()
  }
  async function pasteClipboard() {
    try { const t = await navigator.clipboard.readText(); if (t) setRaw(t) } catch {}
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="px-6 lg:px-10 pt-6 pb-4 border-b border-foreground/10">
        <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-1.5">
          <span className="w-8 h-px bg-foreground/30" />
          Portfolio · investor updates → KPIs
        </span>
        <h1 className="text-3xl lg:text-4xl font-display tracking-tight leading-[0.95]">Portfolio updates.</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Paste a founder&apos;s update in any format. The AI pulls the month&apos;s KPIs and queues them
          for your review — approve to write them into the company&apos;s KPI history.
        </p>
      </div>

      <div className="px-6 lg:px-10 py-6 grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Paste + extract */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Paste an update</h2>
            <button onClick={pasteClipboard} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <ClipboardPaste className="w-3 h-3" /> paste
            </button>
          </div>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={14}
            placeholder="Forward or paste the founder's monthly investor update here — email body, Slack message, doc text…"
            className="w-full p-3 rounded-md border border-input bg-background text-sm leading-relaxed" />
          <button onClick={extract} disabled={extracting || raw.trim().length < 20}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full h-11 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {extracting ? "Extracting…" : "Extract KPIs"}
          </button>
          {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
          <div className="flex items-center gap-2 pt-2 text-[11px] text-muted-foreground">
            <Mail className="w-3.5 h-3.5" />
            Inbound email auto-ingest can post to this same queue once a mailbox is wired.
          </div>
        </div>

        {/* Queue */}
        <div>
          <div className="flex items-center gap-1 mb-3">
            {(["pending", "approved", "dismissed"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs ${
                  tab === t ? "bg-foreground text-background" : "border border-foreground/15 text-muted-foreground hover:bg-foreground/5"}`}>
                {t === "pending" && <Inbox className="w-3.5 h-3.5" />}
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : !list.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground border border-foreground/10 rounded-lg">
              {tab === "pending" ? "No updates awaiting review. Paste one on the left." : `No ${tab} extractions.`}
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((x) => (
                <div key={x.id} className="border border-foreground/10 rounded-lg p-4">
                  <div className="flex items-center gap-3 flex-wrap mb-3">
                    <select value={x.company_id ?? ""} onChange={(e) => patch(x.id, { companyId: e.target.value || null })}
                      disabled={tab !== "pending"}
                      className="h-9 px-2.5 rounded-md border border-input bg-background text-sm min-w-[180px]">
                      <option value="">{x.matched_name ? `Unmatched: ${x.matched_name}` : "Pick company…"}</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input type="month" value={x.month_end ? x.month_end.slice(0, 7) : ""}
                      onChange={(e) => patch(x.id, { monthEnd: e.target.value ? `${e.target.value}-01` : null })}
                      disabled={tab !== "pending"}
                      className="h-9 px-2.5 rounded-md border border-input bg-background text-sm" />
                    {x.confidence != null && (
                      <span className={`font-mono text-[10px] px-2 py-1 rounded-full ${
                        x.confidence >= 0.7 ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
                        {Math.round(x.confidence * 100)}% conf
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {new Date(x.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                    {METRICS.map((m) => (
                      <div key={m.key as string}>
                        <label className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{m.label}</label>
                        <input
                          defaultValue={x[m.key] == null ? "" : String(x[m.key])}
                          onBlur={(e) => { const v = e.target.value.trim(); patch(x.id, { [camel(m.key as string)]: v === "" ? null : Number(v) }) }}
                          disabled={tab !== "pending"}
                          className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-mono" />
                      </div>
                    ))}
                  </div>

                  {x.highlights && (
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed border-l-2 border-foreground/10 pl-2">{x.highlights}</p>
                  )}

                  {tab === "pending" && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => approve(x.id)} disabled={!x.company_id || !x.month_end}
                        title={!x.company_id ? "Pick a company" : !x.month_end ? "Set the month" : "Save to KPI history"}
                        className="inline-flex items-center gap-1.5 rounded-full h-8 px-4 bg-foreground text-background hover:bg-foreground/90 text-xs disabled:opacity-40">
                        <Check className="w-3.5 h-3.5" /> Approve → KPIs
                      </button>
                      <button onClick={() => dismiss(x.id)}
                        className="inline-flex items-center gap-1.5 rounded-full h-8 px-3 border border-foreground/15 hover:bg-foreground/5 text-xs">
                        <X className="w-3.5 h-3.5" /> Dismiss
                      </button>
                      <button onClick={() => remove(x.id)} className="ml-auto p-1.5 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function camel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}
