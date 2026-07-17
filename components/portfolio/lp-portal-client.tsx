"use client"

/**
 * LpPortalClient — the LP-facing portal surface.
 *
 * Capital summary (commitment/called/distributed/NAV + ownership), the
 * position history table, quarterly letters (open inline), fund documents
 * (download), and an AI analyst scoped to ONLY this LP's materials.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */

import { useState } from "react"
import {
  FileText, Download, Send, Loader2, X, Sparkles, ExternalLink,
} from "lucide-react"

interface PortalData {
  fundName: string | null
  lp: { name: string; commitment: number | null; called: number | null; distributed: number | null; nav: number | null; ownershipPct: number | null }
  positions: Array<{ asOf: string; commitment: number | null; called: number | null; distributed: number | null; nav: number | null }>
  letters: Array<{ id: string; title: string; quarter: string | null; sentAt: string | null }>
  documents: Array<{ id: string; title: string; type: string | null; url: string | null; at: string | null }>
}

const usd = (n: number | null) => (n == null ? "—" : "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }))

export function LpPortalClient({ token, data }: { token: string; data: PortalData }) {
  const [letter, setLetter] = useState<{ title: string; html: string } | null>(null)
  const [loadingLetter, setLoadingLetter] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [chat, setChat] = useState<Array<{ role: "you" | "analyst"; text: string }>>([])
  const [asking, setAsking] = useState(false)

  const uncalled = data.lp.commitment != null && data.lp.called != null
    ? Math.max(0, data.lp.commitment - data.lp.called) : null
  const dpi = data.lp.called && data.lp.distributed != null ? data.lp.distributed / data.lp.called : null

  async function openLetter(id: string) {
    setLoadingLetter(id)
    try {
      const r = await fetch(`/api/portal/${token}/letters/${id}`)
      const d = await r.json()
      if (r.ok) setLetter({ title: d.title, html: d.html })
    } finally { setLoadingLetter(null) }
  }

  async function ask() {
    const question = q.trim()
    if (!question || asking) return
    setChat((c) => [...c, { role: "you", text: question }])
    setQ(""); setAsking(true)
    try {
      const r = await fetch(`/api/portal/${token}/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }),
      })
      const d = await r.json()
      setChat((c) => [...c, { role: "analyst", text: r.ok ? d.answer : (d.error ?? "Something went wrong.") }])
    } catch {
      setChat((c) => [...c, { role: "analyst", text: "Network error — please try again." }])
    } finally { setAsking(false) }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Masthead */}
      <header className="border-b border-foreground/10">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            {data.fundName ?? "Fund"} · Investor portal
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight">{data.lp.name}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-10">
        {/* Capital summary */}
        <section>
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Capital account</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 rounded-lg overflow-hidden">
            {[
              ["Commitment", usd(data.lp.commitment)],
              ["Called", usd(data.lp.called)],
              ["Uncalled", usd(uncalled)],
              ["Distributed", usd(data.lp.distributed)],
              ["NAV", usd(data.lp.nav)],
              ["DPI", dpi != null ? dpi.toFixed(2) + "×" : "—"],
              ["Ownership", data.lp.ownershipPct != null ? data.lp.ownershipPct.toFixed(2) + "%" : "—"],
            ].map(([label, val]) => (
              <div key={label} className="bg-background p-4">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="font-display text-xl mt-0.5">{val}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Position history */}
        {data.positions.length > 1 && (
          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Position history</h2>
            <div className="border border-foreground/10 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/10 bg-foreground/[0.02]">
                    {["As of", "Commitment", "Called", "Distributed", "NAV"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/5">
                  {data.positions.map((p) => (
                    <tr key={p.asOf}>
                      <td className="px-3 py-2 font-mono text-xs">{p.asOf}</td>
                      <td className="px-3 py-2 font-mono text-xs">{usd(p.commitment)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{usd(p.called)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{usd(p.distributed)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{usd(p.nav)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Letters + documents */}
        <div className="grid md:grid-cols-2 gap-8">
          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Quarterly letters</h2>
            {data.letters.length ? (
              <ul className="space-y-1.5">
                {data.letters.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => openLetter(l.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-foreground/10 hover:bg-foreground/[0.03] text-left">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm truncate">{l.title}{l.quarter ? ` · ${l.quarter}` : ""}</span>
                      {loadingLetter === l.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No letters published yet.</p>}
          </section>

          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Documents</h2>
            {data.documents.length ? (
              <ul className="space-y-1.5">
                {data.documents.map((d) => (
                  <li key={d.id}>
                    <a href={d.url ?? "#"} target="_blank" rel="noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-foreground/10 hover:bg-foreground/[0.03]">
                      <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm truncate">{d.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No documents on file.</p>}
          </section>
        </div>

        {/* Scoped AI analyst */}
        <section className="border border-foreground/10 rounded-lg p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Ask about your investment
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Answers come only from your own capital account and the letters above.
          </p>
          {chat.length > 0 && (
            <div className="space-y-3 mb-3 max-h-80 overflow-y-auto">
              {chat.map((m, i) => (
                <div key={i} className={m.role === "you" ? "flex justify-end" : ""}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "you" ? "bg-foreground text-background rounded-br-sm" : "border border-foreground/10 rounded-bl-sm"}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {asking && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</div>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") ask() }}
              placeholder="e.g. How much of my commitment is still uncalled?"
              className="flex-1 h-11 px-3 rounded-full border border-input bg-background text-sm" />
            <button onClick={ask} disabled={asking || !q.trim()}
              className="h-11 w-11 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-40">
              {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </section>

        <p className="text-[11px] text-muted-foreground pt-4 border-t border-foreground/10">
          This is a private, personalized page for {data.lp.name}. Figures are provided for information and are
          not a capital call, distribution notice, or offer. Please contact the fund team with any questions.
        </p>
      </main>

      {/* Letter modal */}
      {letter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLetter(null)}>
          <div className="fixed inset-0 bg-black/40" />
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-background border border-foreground/10 rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-foreground/10 px-6 py-3 flex items-center justify-between">
              <h3 className="font-display text-lg truncate">{letter.title}</h3>
              <button onClick={() => setLetter(null)} className="p-1.5 rounded-md hover:bg-foreground/5 text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: letter.html }} />
          </div>
        </div>
      )}
    </div>
  )
}
