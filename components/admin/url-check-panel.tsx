"use client"

import { useState, useTransition } from "react"
import { Loader2, AlertTriangle, Link2 } from "lucide-react"

type Verdict =
  | "live" | "redirect" | "redirected_off"
  | "dead" | "blocked" | "rate_limited" | "server_error"
  | "timeout" | "tls_error" | "dns_error" | "unreachable" | "invalid_url"

interface CheckRow {
  url: string
  finalUrl: string | null
  status: number
  verdict: Verdict
  detail: string
  durationMs: number
  domainChanged: boolean
  owner?: { id: string; field: string }
}

const TONES: Record<Verdict, string> = {
  live:           "bg-emerald-100 text-emerald-700",
  redirect:       "bg-emerald-100 text-emerald-700",
  redirected_off: "bg-amber-100 text-amber-700",
  dead:           "bg-rose-100 text-rose-700",
  blocked:        "bg-amber-100 text-amber-700",
  rate_limited:   "bg-amber-100 text-amber-700",
  server_error:   "bg-rose-100 text-rose-700",
  timeout:        "bg-amber-100 text-amber-700",
  tls_error:      "bg-rose-100 text-rose-700",
  dns_error:      "bg-rose-100 text-rose-700",
  unreachable:    "bg-rose-100 text-rose-700",
  invalid_url:    "bg-rose-100 text-rose-700",
}

export function UrlCheckPanel() {
  const [singleUrl, setSingleUrl] = useState("")
  const [bulkSource, setBulkSource] = useState<"firms" | "investors">("firms")
  const [bulkLimit, setBulkLimit] = useState(50)
  const [pending, start] = useTransition()
  const [results, setResults] = useState<CheckRow[]>([])
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)

  function runSingle() {
    if (!singleUrl.trim()) { setError("Enter a URL."); return }
    runPost({ url: singleUrl.trim() })
  }
  function runBulk() {
    runPost({ source: bulkSource, limit: bulkLimit })
  }
  function runPost(body: any) {
    setError(null); setResults([]); setSummary(null)
    start(async () => {
      try {
        const res = await fetch("/api/admin/url-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`)
        setResults(data.results ?? [])
        setSummary(data.summary ?? null)
      } catch (e: any) { setError(e?.message ?? "Check failed") }
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-foreground/10 rounded-lg p-5 space-y-3">
          <h3 className="font-display text-base">Single URL</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={singleUrl}
              onChange={(e) => setSingleUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 h-10 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            />
            <button
              type="button"
              onClick={runSingle}
              disabled={pending}
              className="px-4 py-2 rounded-md bg-foreground text-background text-sm hover:bg-foreground/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Check
            </button>
          </div>
        </div>

        <div className="border border-foreground/10 rounded-lg p-5 space-y-3">
          <h3 className="font-display text-base">Bulk from DB</h3>
          <div className="flex gap-2 items-center">
            <select
              value={bulkSource}
              onChange={(e) => setBulkSource(e.target.value as any)}
              className="h-10 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            >
              <option value="firms">Firm websites</option>
              <option value="investors">Investor LinkedIn URLs</option>
            </select>
            <input
              type="number"
              value={bulkLimit}
              min={1} max={500}
              onChange={(e) => setBulkLimit(+e.target.value || 50)}
              className="w-24 h-10 px-3 text-sm font-mono text-right border border-foreground/15 rounded-md bg-background"
            />
            <button
              type="button"
              onClick={runBulk}
              disabled={pending}
              className="ml-auto px-4 py-2 rounded-md bg-foreground text-background text-sm hover:bg-foreground/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Run sweep
            </button>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground">
            Pulls oldest-updated rows first. Results don't write back to the DB — admin reviews verdicts manually.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="text-rose-700 dark:text-rose-400">{error}</span>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {Object.entries(summary).filter(([, n]) => n > 0).map(([v, n]) => (
            <div key={v} className={`px-3 py-2 rounded-md ${TONES[v as Verdict]}`}>
              <div className="text-[10px] font-mono uppercase tracking-wider opacity-80">{v.replace(/_/g, " ")}</div>
              <div className="text-xl font-display">{n}</div>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="border border-foreground/10 rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-foreground/5">
              <tr>
                <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">URL</th>
                <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Verdict</th>
                <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Final / detail</th>
                <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">ms</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-foreground/5 align-top">
                  <td className="p-2 font-mono">
                    <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline truncate inline-block max-w-xs">
                      {r.url}
                    </a>
                    {r.owner && (
                      <div className="text-[10px] text-muted-foreground">{r.owner.id} · {r.owner.field}</div>
                    )}
                  </td>
                  <td className="p-2">
                    <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${TONES[r.verdict]}`}>
                      {r.verdict.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="p-2 font-mono text-right">{r.status || "—"}</td>
                  <td className="p-2">
                    {r.finalUrl && r.finalUrl !== r.url && (
                      <div className="font-mono truncate max-w-md">→ {r.finalUrl}</div>
                    )}
                    <div className="text-muted-foreground">{r.detail}</div>
                  </td>
                  <td className="p-2 font-mono text-right">{r.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
