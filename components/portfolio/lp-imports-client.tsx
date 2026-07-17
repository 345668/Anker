"use client"

/**
 * LpImportsClient — paste an LP capital statement, review the extracted
 * dated positions, approve into fund_lps + lp_positions history.
 *
 *   Left: paste the statement → "Extract positions" runs the AI.
 *   Right: the pending queue. Each import shows the as-of date and an
 *   editable table of LP rows (match to an existing LP or leave a new name;
 *   commitment / called / distributed / NAV). Approve writes the dated
 *   positions and updates the LPs; Dismiss drops it.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */

import { useState } from "react"
import useSWR from "swr"
import { Sparkles, Loader2, Check, X, Trash2, Inbox, ClipboardPaste } from "lucide-react"

interface Lp { id: string; name: string }
interface Pos { lpId: string | null; lpName: string; commitment: number | null; called: number | null; distributed: number | null; nav: number | null }
interface Import {
  id: string; fund_id: string; as_of: string | null
  positions: Pos[]; confidence: number | null; status: string; created_at: string
}

const fetcher = (u: string) => fetch(u).then((r) => r.json())
const usd = (n: number | null) => (n == null ? "" : Number(n).toLocaleString())

export function LpImportsClient({ lps }: { lps: Lp[] }) {
  const [tab, setTab] = useState<"pending" | "approved" | "dismissed">("pending")
  const [raw, setRaw] = useState("")
  const [extracting, setExtracting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const { data, mutate, isLoading } = useSWR<{ imports: Import[] }>(
    `/api/portfolio/lp-imports?status=${tab}`, fetcher)
  const list = data?.imports ?? []

  async function extract() {
    if (raw.trim().length < 20) { setMsg("Paste a longer statement."); return }
    setExtracting(true); setMsg(null)
    try {
      const res = await fetch("/api/portfolio/lp-imports", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawText: raw }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? "Extraction failed")
      setMsg(`Found ${d.total} LP position(s), ${d.matched} matched to existing LPs.`)
      setRaw(""); setTab("pending"); mutate()
    } catch (e: any) { setMsg(e?.message ?? "Extraction failed") }
    finally { setExtracting(false) }
  }

  async function patch(imp: Import, body: Record<string, unknown>) {
    await fetch(`/api/portfolio/lp-imports/${imp.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }); mutate()
  }
  function editPos(imp: Import, i: number, field: keyof Pos, value: any) {
    const next = imp.positions.map((p, j) => j === i ? { ...p, [field]: value } : p)
    patch(imp, { positions: next })
  }
  async function approve(imp: Import) {
    const res = await fetch(`/api/portfolio/lp-imports/${imp.id}/approve`, { method: "POST" })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d?.error ?? "Approve failed"); return }
    setMsg(`Applied: ${d.updated} updated, ${d.created} new LP(s) as of ${d.asOf}.`); mutate()
  }
  async function dismiss(imp: Import) {
    await fetch(`/api/portfolio/lp-imports/${imp.id}/dismiss`, { method: "POST" }); mutate()
  }
  async function remove(imp: Import) {
    if (!confirm("Delete this import?")) return
    await fetch(`/api/portfolio/lp-imports/${imp.id}`, { method: "DELETE" }); mutate()
  }
  async function pasteClipboard() {
    try { const t = await navigator.clipboard.readText(); if (t) setRaw(t) } catch {}
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="px-6 lg:px-10 pt-6 pb-4 border-b border-foreground/10">
        <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-1.5">
          <span className="w-8 h-px bg-foreground/30" />
          Fund · LP statement → dated positions
        </span>
        <h1 className="text-3xl lg:text-4xl font-display tracking-tight leading-[0.95]">LP statement import.</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Paste a capital statement — commitments, called, distributed, NAV. The AI maps the columns
          into a dated position per LP; approve to update your LPs and build a history you can read
          as of any date.
        </p>
      </div>

      <div className="px-6 lg:px-10 py-6 grid lg:grid-cols-[360px_1fr] gap-6 items-start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Paste a statement</h2>
            <button onClick={pasteClipboard} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <ClipboardPaste className="w-3 h-3" /> paste
            </button>
          </div>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={16}
            placeholder="Paste the LP capital statement — copy straight from the spreadsheet or PDF. Rows of LP names with commitment / called / distributed / NAV columns."
            className="w-full p-3 rounded-md border border-input bg-background text-sm leading-relaxed font-mono" />
          <button onClick={extract} disabled={extracting || raw.trim().length < 20}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full h-11 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {extracting ? "Extracting…" : "Extract positions"}
          </button>
          {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
        </div>

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
              {tab === "pending" ? "No statements awaiting review. Paste one on the left." : `No ${tab} imports.`}
            </div>
          ) : (
            <div className="space-y-4">
              {list.map((imp) => (
                <div key={imp.id} className="border border-foreground/10 rounded-lg p-4">
                  <div className="flex items-center gap-3 flex-wrap mb-3">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">As of</label>
                    <input type="date" value={imp.as_of ? imp.as_of.slice(0, 10) : ""}
                      onChange={(e) => patch(imp, { asOf: e.target.value || null })}
                      disabled={tab !== "pending"}
                      className="h-8 px-2.5 rounded-md border border-input bg-background text-sm" />
                    {imp.confidence != null && (
                      <span className={`font-mono text-[10px] px-2 py-1 rounded-full ${
                        imp.confidence >= 0.7 ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
                        {Math.round(imp.confidence * 100)}% conf
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-muted-foreground">{imp.positions.length} LPs</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{new Date(imp.created_at).toLocaleDateString()}</span>
                  </div>

                  <div className="overflow-x-auto border border-foreground/10 rounded-md">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-foreground/10 bg-foreground/[0.02]">
                          {["LP", "Commitment", "Called", "Distributed", "NAV"].map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-foreground/5">
                        {imp.positions.map((p, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1">
                              {tab === "pending" ? (
                                <select value={p.lpId ?? ""} onChange={(e) => editPos(imp, i, "lpId", e.target.value || null)}
                                  className="h-7 px-1.5 rounded border border-input bg-background text-xs min-w-[150px]">
                                  <option value="">{`New: ${p.lpName}`}</option>
                                  {lps.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                              ) : (p.lpName)}
                            </td>
                            {(["commitment", "called", "distributed", "nav"] as const).map((f) => (
                              <td key={f} className="px-2 py-1">
                                {tab === "pending" ? (
                                  <input defaultValue={p[f] == null ? "" : String(p[f])}
                                    onBlur={(e) => { const v = e.target.value.trim(); editPos(imp, i, f, v === "" ? null : Number(v)) }}
                                    className="w-24 h-7 px-1.5 rounded border border-input bg-background text-xs font-mono text-right" />
                                ) : (<span className="font-mono">{usd(p[f])}</span>)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {tab === "pending" && (
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => approve(imp)} disabled={!imp.as_of}
                        title={!imp.as_of ? "Set the as-of date" : "Apply to LPs + position history"}
                        className="inline-flex items-center gap-1.5 rounded-full h-8 px-4 bg-foreground text-background hover:bg-foreground/90 text-xs disabled:opacity-40">
                        <Check className="w-3.5 h-3.5" /> Approve → LPs
                      </button>
                      <button onClick={() => dismiss(imp)}
                        className="inline-flex items-center gap-1.5 rounded-full h-8 px-3 border border-foreground/15 hover:bg-foreground/5 text-xs">
                        <X className="w-3.5 h-3.5" /> Dismiss
                      </button>
                      <button onClick={() => remove(imp)} className="ml-auto p-1.5 text-muted-foreground hover:text-destructive">
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
