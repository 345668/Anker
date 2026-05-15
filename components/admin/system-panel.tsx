"use client"

import { useEffect, useState, useTransition } from "react"
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Database, Bot, Globe, Search, FileText, Cpu, ArrowUpDown, Upload, Download,
} from "lucide-react"

interface ServiceStatus {
  name: string
  configured: boolean
  reachable: boolean
  detail: string
  meta?: any
}

interface SystemPayload {
  snapshotAt: string
  services: ServiceStatus[]
  dbStats: any
}

const ICONS: Record<string, any> = {
  postgres: Database,
  ollama: Bot,
  twenty: Database,
  searxng: Search,
  marker: FileText,
}

interface TwentyResult {
  kind: "push-all" | "pull"
  processed?: number; ok?: number; errors?: number
  pulled?: number
  changes?: { crmEntryId: string; from: string; to: string }[]
  error?: string
}

export function SystemPanel() {
  const [data, setData] = useState<SystemPayload | null>(null)
  const [loading, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [auto, setAuto] = useState(false)
  const [twentyBusy, setTwentyBusy] = useState<"push" | "pull" | null>(null)
  const [twenty, setTwenty] = useState<TwentyResult | null>(null)

  function load() {
    setError(null)
    start(async () => {
      try {
        const res = await fetch("/api/admin/system", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
        setData(json)
      } catch (e: any) { setError(e?.message ?? "Load failed") }
    })
  }

  async function runTwenty(direction: "push" | "pull") {
    setTwentyBusy(direction); setError(null); setTwenty(null)
    try {
      const res = await fetch("/api/twenty/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(direction === "push" ? { all: true } : { pull: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
      setTwenty({ kind: direction === "push" ? "push-all" : "pull", ...json })
    } catch (e: any) { setError(e?.message ?? "Twenty sync failed") }
    finally { setTwentyBusy(null) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!auto) return
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [auto])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {data?.snapshotAt ? `snapshot ${new Date(data.snapshotAt).toLocaleTimeString()}` : "—"}
        </span>
        <label className="ml-auto inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto-refresh (15s)
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="text-rose-700 dark:text-rose-400">{error}</span>
        </div>
      )}

      {/* Service grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(data?.services ?? []).map((s) => {
          const Icon = ICONS[s.name] ?? Cpu
          const tone = !s.configured ? "muted" : s.reachable ? "good" : "bad"
          return (
            <div
              key={s.name}
              className={`border rounded-md p-4 ${
                tone === "good" ? "border-emerald-200 bg-emerald-50/30"
                : tone === "bad" ? "border-rose-200 bg-rose-50/30"
                : "border-foreground/10"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono text-xs uppercase tracking-wider">{s.name}</span>
                </div>
                {tone === "good" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  : tone === "bad" ? <XCircle className="w-4 h-4 text-rose-600" />
                  : <span className="text-[10px] font-mono text-muted-foreground">not configured</span>}
              </div>
              <div className="text-xs">{s.detail}</div>
              {s.meta?.url && (
                <a href={s.meta.url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-muted-foreground hover:text-foreground hover:underline truncate block mt-1">
                  {s.meta.url}
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Twenty bidirectional sync */}
      {(() => {
        const twentyService = data?.services.find((s) => s.name === "twenty")
        const twentyConfigured = !!twentyService?.configured
        return (
          <div className="border border-foreground/10 rounded-md p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-display text-sm">Twenty CRM sync</h3>
              {!twentyConfigured && (
                <span className="text-[10px] font-mono text-amber-700 ml-1">not configured</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Push every crm_entry into Twenty as Company + Person + Opportunity, or pull Opportunity.stage back from Twenty (forward-only). Schedule pull-stages every 15 min if you edit stages inside Twenty.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => runTwenty("push")}
                disabled={!twentyConfigured || twentyBusy !== null}
                className="px-3 py-1.5 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 inline-flex items-center gap-1"
                title="Push all CRM entries into Twenty (Company + Person + Opportunity)"
              >
                {twentyBusy === "push" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Push all → Twenty
              </button>
              <button
                type="button"
                onClick={() => runTwenty("pull")}
                disabled={!twentyConfigured || twentyBusy !== null}
                className="px-3 py-1.5 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 inline-flex items-center gap-1"
                title="Read Opportunity.stage from Twenty and apply forward-only to crm_entries.stage"
              >
                {twentyBusy === "pull" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Pull stages ← Twenty
              </button>
            </div>
            {twenty && twenty.kind === "push-all" && (
              <div className="text-[11px] font-mono text-muted-foreground">
                push-all: processed {twenty.processed} · ok {twenty.ok} · errors {twenty.errors}
              </div>
            )}
            {twenty && twenty.kind === "pull" && (
              <div className="text-[11px] font-mono text-muted-foreground">
                pull: read {twenty.pulled} opportunities · {twenty.changes?.length ?? 0} stage transitions applied
                {twenty.changes && twenty.changes.length > 0 && (
                  <ul className="mt-1 ml-3 space-y-0.5">
                    {twenty.changes.slice(0, 8).map((c, i) => (
                      <li key={i}>· {c.crmEntryId.slice(0, 10)}… {c.from} → {c.to}</li>
                    ))}
                    {twenty.changes.length > 8 && <li>· … {twenty.changes.length - 8} more</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* DB stats */}
      {data?.dbStats && (
        <div className="border border-foreground/10 rounded-md p-4 space-y-3">
          <h3 className="font-display text-sm">Database</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(data.dbStats).filter(([k]) => k !== "firms_by_source" && k !== "embeddings").map(([k, v]) => (
              <div key={k} className="border border-foreground/10 rounded px-3 py-2">
                <div className="font-mono uppercase tracking-wider text-[10px] text-muted-foreground">
                  {k.replace(/_/g, " ")}
                </div>
                <div className="font-display text-xl">{Number(v) === -1 ? "—" : Number(v).toLocaleString()}</div>
              </div>
            ))}
          </div>
          {data.dbStats.embeddings && (
            <div>
              <div className="font-mono uppercase tracking-wider text-[10px] text-muted-foreground mb-1.5">
                pgvector — rows with embeddings
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {Object.entries(data.dbStats.embeddings).map(([k, v]) => (
                  <div key={k} className="border border-foreground/10 rounded px-3 py-2 font-mono">
                    {k}: <span className="font-medium">{Number(v).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(data.dbStats.firms_by_source) && data.dbStats.firms_by_source.length > 0 && (
            <div>
              <div className="font-mono uppercase tracking-wider text-[10px] text-muted-foreground mb-1.5">
                Top firm sources
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-mono">
                {data.dbStats.firms_by_source.map((s: any) => (
                  <div key={s.source} className="flex items-center justify-between border border-foreground/10 rounded px-3 py-1.5">
                    <span className="truncate">{s.source}</span>
                    <span className="text-muted-foreground">{Number(s.n).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI router map */}
      {(() => {
        const ollama = data?.services.find((s) => s.name === "ollama")
        const routing = ollama?.meta?.routing as any[] | undefined
        const models = (ollama?.meta?.models ?? []) as string[]
        if (!routing || routing.length === 0) return null
        return (
          <div className="border border-foreground/10 rounded-md p-4">
            <h3 className="font-display text-sm mb-3">AI router · task → model</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Task</th>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Tier</th>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Model</th>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Source</th>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Pulled</th>
                  </tr>
                </thead>
                <tbody>
                  {routing.map((r: any, i: number) => {
                    const pulled = models.includes(r.model)
                    return (
                      <tr key={i} className="border-t border-foreground/5">
                        <td className="p-2 font-mono">{r.task}</td>
                        <td className="p-2 font-mono">{r.tier}</td>
                        <td className="p-2 font-mono">{r.model}</td>
                        <td className="p-2 font-mono text-muted-foreground">{r.source}</td>
                        <td className="p-2">
                          {pulled ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-[10px] font-mono">
                              <CheckCircle2 className="w-3 h-3" /> pulled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 text-[10px] font-mono">
                              <AlertTriangle className="w-3 h-3" /> ollama pull {r.model}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {models.length > 0 && (
              <div className="mt-3 text-[11px] font-mono text-muted-foreground">
                Pulled models: {models.join(", ")}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
