"use client"

import { useState } from "react"
import { Printer, Check } from "lucide-react"

export type TearSheetData = {
  fundName: string
  vintage: string | number
  strategy: string
  currency: string
  asOf: string
  metrics: { label: string; value: string; hint?: string }[]
  positions: { company: string; round: string; invested: string; fairValue: string; moic: string }[]
  allocation: { name: string; pct: number }[]
  summary: string
}

const SECTIONS = [
  { key: "metrics", label: "Performance metrics" },
  { key: "allocation", label: "Portfolio allocation" },
  { key: "positions", label: "Top positions" },
  { key: "summary", label: "Fund summary" },
  { key: "disclaimer", label: "Confidential footer" },
] as const
type SectionKey = (typeof SECTIONS)[number]["key"]

const BAR = ["#2f45e0", "#e5380f", "#127c78", "#8b5cf6", "#f59e0b", "#0ea5e9", "#64748b"]

export function TearSheetBuilder({ data }: { data: TearSheetData }) {
  const [on, setOn] = useState<Record<SectionKey, boolean>>({ metrics: true, allocation: true, positions: true, summary: true, disclaimer: true })
  const [topN, setTopN] = useState(5)
  const [accent, setAccent] = useState("#2f45e0")

  const positions = data.positions.slice(0, topN)

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      {/* Print isolation */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #tear-sheet, #tear-sheet * { visibility: visible !important; }
        #tear-sheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: 0 !important; }
        @page { margin: 18mm; }
      }`}</style>

      {/* Builder controls */}
      <aside data-noprint className="lg:border-r lg:border-foreground/10 lg:pr-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Sections</div>
        <ul className="space-y-1 mb-6">
          {SECTIONS.map((s) => (
            <li key={s.key}>
              <button onClick={() => setOn((o) => ({ ...o, [s.key]: !o[s.key] }))}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-foreground/[0.04] transition-colors">
                <span className={`grid place-items-center w-4 h-4 rounded border ${on[s.key] ? "bg-[#2f45e0] border-[#2f45e0] text-white" : "border-foreground/25"}`}>
                  {on[s.key] ? <Check className="w-3 h-3" /> : null}
                </span>
                <span className={on[s.key] ? "" : "text-muted-foreground"}>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Top positions</div>
        <input type="range" min={3} max={Math.max(3, data.positions.length)} value={topN} onChange={(e) => setTopN(Number(e.target.value))} className="w-full accent-[#2f45e0]" />
        <div className="text-xs text-muted-foreground mb-6">Showing {positions.length} of {data.positions.length}</div>

        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Accent</div>
        <div className="flex gap-2 mb-6">
          {["#2f45e0", "#e5380f", "#127c78", "#111111"].map((c) => (
            <button key={c} onClick={() => setAccent(c)} className={`w-7 h-7 rounded-full ring-offset-2 ring-offset-background ${accent === c ? "ring-2 ring-foreground/40" : ""}`} style={{ backgroundColor: c }} />
          ))}
        </div>

        <button onClick={() => window.print()} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#2f45e0] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2637b8] transition-colors">
          <Printer className="w-4 h-4" /> Print / Save PDF
        </button>
      </aside>

      {/* Live preview — the printed sheet */}
      <div id="tear-sheet" className="bg-background border border-foreground/12 rounded-xl p-8 lg:p-10 max-w-3xl">
        <header className="flex items-start justify-between gap-6 pb-5 border-b-2" style={{ borderColor: accent }}>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.2em]" style={{ color: accent }}>Fund tear sheet · Confidential</div>
            <h1 className="mt-1.5 text-2xl font-serif tracking-tight">{data.fundName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{data.strategy} · Vintage {data.vintage}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">As of</div>
            <div className="text-sm font-medium">{data.asOf}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{data.currency}</div>
          </div>
        </header>

        {on.metrics ? (
          <section className="mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
              {data.metrics.map((m) => (
                <div key={m.label} className="bg-background p-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{m.label}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{m.value}</div>
                  {m.hint ? <div className="text-[11px] text-muted-foreground mt-0.5">{m.hint}</div> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {on.allocation && data.allocation.length ? (
          <section className="mt-6">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Portfolio allocation</h2>
            <div className="flex h-3 rounded-full overflow-hidden mb-3">
              {data.allocation.map((a, i) => <div key={a.name} style={{ width: `${a.pct}%`, backgroundColor: BAR[i % BAR.length] }} />)}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {data.allocation.map((a, i) => (
                <div key={a.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR[i % BAR.length] }} />{a.name}</span>
                  <span className="tabular-nums text-muted-foreground">{a.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {on.positions && positions.length ? (
          <section className="mt-6">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Top positions</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-foreground/10">
                  <th className="text-left py-2">Company</th>
                  <th className="text-left py-2 hidden sm:table-cell">Round</th>
                  <th className="text-right py-2">Invested</th>
                  <th className="text-right py-2">Fair value</th>
                  <th className="text-right py-2">MOIC</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.company} className="border-b border-foreground/[0.06] last:border-0">
                    <td className="py-2 font-medium">{p.company}</td>
                    <td className="py-2 text-muted-foreground hidden sm:table-cell">{p.round}</td>
                    <td className="py-2 text-right tabular-nums">{p.invested}</td>
                    <td className="py-2 text-right tabular-nums">{p.fairValue}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{p.moic}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {on.summary && data.summary ? (
          <section className="mt-6">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">Fund summary</h2>
            <p className="text-sm leading-relaxed text-foreground/80">{data.summary}</p>
          </section>
        ) : null}

        {on.disclaimer ? (
          <footer className="mt-8 pt-4 border-t border-foreground/10 text-[10px] leading-relaxed text-muted-foreground">
            Strictly private &amp; confidential. Prepared for existing and prospective limited partners of {data.fundName}. Past performance is not indicative of future results. Valuations are unaudited estimates as of {data.asOf}. Generated with Anker.
          </footer>
        ) : null}
      </div>
    </div>
  )
}
