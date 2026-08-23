"use client"

import { useState } from "react"
import { Sparkles, Loader2, ChevronDown, ShieldCheck, ShieldAlert } from "lucide-react"

type Position = "standard" | "deviation" | "missing" | "not_applicable"
type Finding = {
  id: string; label: string; position: Position; severity: "low" | "medium" | "high" | null
  finding: string; suggestedRedline: string | null; riskPoints: number
}
type Analysis = {
  ok: boolean; contractType?: string; riskScore: number; riskLevel: "low" | "medium" | "high"
  deviations: number; missing: number; findings: Finding[]; summary: string
}

const TYPES = ["", "NDA", "MSA", "SAFE", "Subscription", "Side Letter", "Term Sheet", "SOW", "Other"]
const POS_BADGE: Record<Position, string> = {
  deviation: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  missing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  standard: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  not_applicable: "bg-foreground/[0.06] text-muted-foreground",
}
const POS_LABEL: Record<Position, string> = { deviation: "Deviation", missing: "Missing", standard: "Standard", not_applicable: "N/A" }
const riskColor = (l: string) => (l === "high" ? "text-rose-600 dark:text-rose-400" : l === "medium" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")

export function ContractAnalyzer({ docuSignConfigured }: { docuSignConfigured: boolean }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [type, setType] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Analysis | null>(null)

  async function analyze() {
    setErr(null); setBusy(true); setResult(null)
    try {
      const res = await fetch("/api/contracts/analyze", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, contractType: type || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d?.error ?? "Analysis failed."); return }
      setResult(d)
    } catch (e: any) {
      setErr(e?.message ?? "Network error.")
    } finally { setBusy(false) }
  }

  // Deviations + missing first, then the rest.
  const ordered = result?.findings ? [...result.findings].sort((a, b) => b.riskPoints - a.riskPoints) : []

  return (
    <div className="mb-6 border border-foreground/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/[0.02] transition-colors">
        <Sparkles className="w-4 h-4 text-[#e5380f]" />
        <span className="text-sm font-semibold">AI contract review</span>
        <span className="text-[12px] text-muted-foreground">Paste a contract — get a clause-by-clause redline vs. the playbook.</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {docuSignConfigured ? <><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> e-sign ready</> : <><ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" /> e-sign off</>}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="border-t border-foreground/10 p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Contract type (optional)</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 px-3 rounded-md border border-foreground/15 bg-background text-sm">
                {TYPES.map((t) => <option key={t} value={t}>{t || "Auto-detect"}</option>)}
              </select>
            </label>
            <button onClick={analyze} disabled={busy || text.trim().length < 120} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c] disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analyze
            </button>
          </div>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={7}
            placeholder="Paste the full contract text here…"
            className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:border-foreground/40"
          />
          {err && <div className="rounded-md border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-600 dark:text-red-400">{err}</div>}

          {result && (
            <div className="space-y-4">
              {/* Risk header */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Risk score</div>
                  <div className={`text-2xl font-semibold tabular-nums ${riskColor(result.riskLevel)}`}>{result.riskScore}<span className="text-sm text-muted-foreground">/100 · {result.riskLevel}</span></div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="text-rose-600 dark:text-rose-400 font-medium">{result.deviations}</span> deviation{result.deviations === 1 ? "" : "s"} ·{" "}
                  <span className="text-amber-600 dark:text-amber-400 font-medium">{result.missing}</span> missing
                  {result.contractType && <> · detected <span className="text-foreground">{result.contractType}</span></>}
                </div>
              </div>
              {result.summary && <p className="text-sm text-muted-foreground">{result.summary}</p>}

              {/* Clause findings */}
              <div className="overflow-x-auto rounded-lg border border-foreground/10">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground text-left">
                    <th className="px-4 py-2.5">Clause</th><th className="px-4 py-2.5">Position</th><th className="px-4 py-2.5">Finding & suggested redline</th>
                  </tr></thead>
                  <tbody>
                    {ordered.map((f) => (
                      <tr key={f.id} className="border-b border-foreground/[0.06] last:border-0 align-top">
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">{f.label}</td>
                        <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${POS_BADGE[f.position]}`}>{POS_LABEL[f.position]}{f.severity && f.position !== "standard" ? ` · ${f.severity}` : ""}</span></td>
                        <td className="px-4 py-2.5">
                          <div className="text-foreground/90">{f.finding}</div>
                          {f.suggestedRedline && <div className="mt-1 text-[13px] text-[#2f45e0] dark:text-[#8ea2ff]">↳ {f.suggestedRedline}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                A first-pass review against a standard playbook — grounded, but not legal advice. The risk score is computed from the playbook weights; the clause analysis is AI-drafted. Have counsel confirm before you rely on it.
                {docuSignConfigured ? " Route the final version for e-signature via DocuSign." : " Configure DocuSign to enable e-signature."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
