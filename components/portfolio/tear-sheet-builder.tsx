"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Check, Search, ZoomIn, ZoomOut, Maximize2, Download, ArrowLeft, ArrowRight } from "lucide-react"

const COBALT = "#2f45e0"

export type TearSheetCompany = {
  name: string
  heldBy: string
  heldSince: string
  itdValue: string
  gainLoss: string
  gainPositive: boolean
  ownership: string
  latestMark: string
  overview: string
  history: { date: string; round: string; cost: string; multiple: string; irr: string }[]
}
export type TearSheetFund = { id: string; name: string }

const TEMPLATES = ["Anker Template", "Anker Default Portrait Template"]

export function TearSheetBuilder({
  firmName,
  funds,
  companies,
}: {
  firmName: string
  funds: TearSheetFund[]
  companies: TearSheetCompany[]
}) {
  const [template, setTemplate] = useState(TEMPLATES[1])
  const [fundSel, setFundSel] = useState<Set<string>>(new Set(funds.map((f) => f.id)))
  const [compSel, setCompSel] = useState<Set<string>>(new Set(companies.map((c) => c.name)))
  const [open, setOpen] = useState<{ template: boolean; funds: boolean; companies: boolean }>({ template: false, funds: false, companies: true })
  const [search, setSearch] = useState("")
  const [generated, setGenerated] = useState(false)
  const [idx, setIdx] = useState(0)

  const selectedCompanies = useMemo(() => companies.filter((c) => compSel.has(c.name)), [companies, compSel])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? companies.filter((c) => c.name.toLowerCase().includes(q)) : companies
  }, [companies, search])

  const preview = selectedCompanies[idx] ?? null

  function toggle<T>(set: Set<T>, v: T): Set<T> {
    const next = new Set(set)
    next.has(v) ? next.delete(v) : next.add(v)
    return next
  }

  return (
    <div>
      {/* Print isolation */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #ts-preview, #ts-preview * { visibility: visible !important; }
        #ts-preview { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; }
        @page { margin: 16mm; }
      }`}</style>

      {/* Serif title + Data Warehouse badge */}
      <div className="flex items-center justify-between gap-4 mb-6" data-noprint>
        <h1 className="text-3xl font-serif tracking-tight">Tear Sheet Builder</h1>
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.15em]">Powered by</span>
          <span className="inline-flex items-center rounded border border-foreground/15 overflow-hidden">
            <span className="px-2 py-1 font-display font-semibold">Anker</span>
            <span className="px-2 py-1 border-l border-foreground/15">Data Warehouse</span>
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Config column ── */}
        <div className="space-y-4" data-noprint>
          {/* Template */}
          <Section title="Template" value={template} open={open.template} onToggle={() => setOpen((o) => ({ ...o, template: !o.template }))}>
            <div className="space-y-2 pt-1">
              {TEMPLATES.map((t) => (
                <label key={t} className="flex items-center gap-3 cursor-pointer py-1.5">
                  <span className={`grid place-items-center w-4 h-4 rounded-full border ${template === t ? "border-foreground" : "border-foreground/30"}`}>
                    {template === t ? <span className="w-2 h-2 rounded-full bg-foreground" /> : null}
                  </span>
                  <span className="text-sm">{t}</span>
                </label>
              ))}
            </div>
          </Section>

          {/* Funds */}
          <Section title="Funds" value={`${fundSel.size} out of ${funds.length} selected`} open={open.funds} onToggle={() => setOpen((o) => ({ ...o, funds: !o.funds }))}>
            <ul className="pt-1 divide-y divide-foreground/[0.06]">
              {funds.map((f) => (
                <li key={f.id}>
                  <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                    <Checkbox on={fundSel.has(f.id)} onClick={() => setFundSel((s) => toggle(s, f.id))} />
                    <span className="text-sm">{f.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Section>

          {/* Companies */}
          <Section title="Companies" value={`${compSel.size} out of ${companies.length} selected`} open={open.companies} onToggle={() => setOpen((o) => ({ ...o, companies: !o.companies }))}>
            <div className="pt-1">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
                  className="w-full rounded-lg border border-foreground/12 bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
              </div>
              <div className="flex items-center gap-3 px-1 py-2 border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <Checkbox
                  on={filtered.every((c) => compSel.has(c.name)) && filtered.length > 0}
                  onClick={() => {
                    const allOn = filtered.every((c) => compSel.has(c.name))
                    setCompSel((s) => {
                      const next = new Set(s)
                      filtered.forEach((c) => (allOn ? next.delete(c.name) : next.add(c.name)))
                      return next
                    })
                  }}
                />
                <span className="flex-1">Name</span>
                <span>Held by</span>
              </div>
              <ul className="max-h-[320px] overflow-y-auto divide-y divide-foreground/[0.06]">
                {filtered.map((c) => (
                  <li key={c.name}>
                    <label className="flex items-center gap-3 py-2.5 px-1 cursor-pointer">
                      <Checkbox on={compSel.has(c.name)} onClick={() => setCompSel((s) => toggle(s, c.name))} />
                      <span className="text-sm flex-1">{c.name}</span>
                      <span className="text-sm text-muted-foreground">{c.heldBy}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => { setGenerated(true); setIdx(0) }}
              disabled={selectedCompanies.length === 0}
              className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-40"
            >
              Generate preview
            </button>
            <button onClick={() => window.print()} disabled={!generated} className="rounded-lg border border-foreground/15 px-5 py-2.5 text-sm hover:bg-foreground/[0.04] disabled:opacity-40">
              Download all
            </button>
          </div>
        </div>

        {/* ── Preview column ── */}
        <div className="border border-foreground/10 rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-foreground/10 bg-foreground/[0.015]" data-noprint>
            <span className="text-sm text-muted-foreground truncate">
              {preview && generated ? `Preview — ${preview.name}` : "Preview"}
            </span>
            <div className="flex items-center gap-1 text-muted-foreground">
              <button className="p-1.5 hover:text-foreground" title="Zoom in"><ZoomIn className="w-4 h-4" /></button>
              <button className="p-1.5 hover:text-foreground" title="Zoom out"><ZoomOut className="w-4 h-4" /></button>
              <button className="p-1.5 hover:text-foreground" title="Fullscreen"><Maximize2 className="w-4 h-4" /></button>
              <button onClick={() => generated && window.print()} className="p-1.5 hover:text-foreground" title="Download"><Download className="w-4 h-4" /></button>
            </div>
          </div>

          {!generated ? (
            <div className="flex-1 grid place-items-center p-16 text-center text-sm text-muted-foreground bg-foreground/[0.01]">
              Select companies and hit <span className="mx-1 font-medium text-foreground">Generate preview</span> to render tear sheets.
            </div>
          ) : preview ? (
            <>
              <div id="ts-preview" className="flex-1 overflow-y-auto p-6 lg:p-8 bg-background">
                <TearSheetDoc firmName={firmName} c={preview} />
              </div>
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-foreground/10" data-noprint>
                <span className="mr-auto text-xs text-muted-foreground">{idx + 1} of {selectedCompanies.length}</span>
                <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-foreground/15 px-3 py-1.5 text-sm hover:bg-foreground/[0.04] disabled:opacity-40">
                  <ArrowLeft className="w-4 h-4" /> Previous
                </button>
                <button onClick={() => setIdx((i) => Math.min(selectedCompanies.length - 1, i + 1))} disabled={idx >= selectedCompanies.length - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-foreground/15 px-3 py-1.5 text-sm hover:bg-foreground/[0.04] disabled:opacity-40">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** A single company tear sheet document — the Carta portrait layout. */
function TearSheetDoc({ firmName, c }: { firmName: string; c: TearSheetCompany }) {
  const tiles = [
    { label: "Held since", value: c.heldSince },
    { label: "ITD value", value: c.itdValue },
    { label: "Gain / Loss", value: c.gainLoss, tone: c.gainPositive ? "up" : "down" as const },
    { label: "Current Ownership", value: c.ownership },
    { label: "Latest 409A value", value: c.latestMark },
  ]
  return (
    <div className="mx-auto max-w-2xl">
      {/* Header: firm + company logos */}
      <div className="flex items-center gap-4 pb-5 mb-5 border-b border-foreground/10">
        <div className="w-11 h-11 rounded-lg bg-[#2f45e0]/10 grid place-items-center text-[#2f45e0] font-serif text-lg shrink-0">
          {c.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-serif tracking-tight truncate">{c.name}</h2>
          <p className="text-xs text-muted-foreground truncate">Held by {firmName}</p>
        </div>
      </div>

      {/* Overview */}
      {c.overview ? (
        <section className="mb-5">
          <h3 className="text-sm font-semibold mb-1.5">Overview</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{c.overview}</p>
        </section>
      ) : null}

      {/* Metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden mb-6">
        {tiles.map((t) => (
          <div key={t.label} className="bg-background p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{t.label}</div>
            <div className={`mt-1 text-sm font-semibold tabular-nums ${t.tone === "up" ? "text-emerald-600 dark:text-emerald-400" : t.tone === "down" ? "text-rose-600 dark:text-rose-400" : ""}`}>
              {t.tone === "up" ? "↑" : t.tone === "down" ? "↓" : ""}{t.value}
            </div>
          </div>
        ))}
      </div>

      {/* Investment History */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold mb-2">Investment History</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-foreground/10">
              <th className="text-left py-2">Round</th>
              <th className="text-left py-2">Date</th>
              <th className="text-right py-2">Cost</th>
              <th className="text-right py-2">Multiple</th>
              <th className="text-right py-2">IRR</th>
            </tr>
          </thead>
          <tbody>
            {c.history.map((h, i) => (
              <tr key={i} className="border-b border-foreground/[0.06] last:border-0">
                <td className="py-2 font-medium">{h.round}</td>
                <td className="py-2 text-muted-foreground">{h.date}</td>
                <td className="py-2 text-right tabular-nums">{h.cost}</td>
                <td className="py-2 text-right tabular-nums">{h.multiple}</td>
                <td className="py-2 text-right tabular-nums">{h.irr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="pt-4 border-t border-foreground/10 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center rounded border border-foreground/15 px-1.5 py-0.5 font-display font-semibold">Anker</span>
        <span className="font-mono uppercase tracking-wider">Confidential</span>
        <span>{new Date().toLocaleDateString("en-US")}</span>
      </footer>
    </div>
  )
}

function Section({ title, value, open, onToggle, children }: { title: string; value: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-foreground/12 rounded-xl">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-4 py-3.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{value}</span>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </span>
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  )
}

function Checkbox({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); onClick() }}
      className={`grid place-items-center w-4 h-4 rounded border shrink-0 ${on ? "bg-foreground border-foreground text-background" : "border-foreground/30"}`}>
      {on ? <Check className="w-3 h-3" /> : null}
    </button>
  )
}
