"use client"

/**
 * Deal-flow board — stage columns, rollup header, new-deal panel.
 * Cards link into the deal workroom (deal-detail-client.tsx).
 */

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Loader2, AlertTriangle } from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type { DealFull, DealStage, PipelineRollup } from "@/lib/portfolio/deal-pipeline"

interface Props {
  fund: FundFull
  initialDeals: DealFull[]
  rollup: PipelineRollup | null
  tablesReady: boolean
}

const BOARD_STAGES: { key: DealStage; label: string }[] = [
  { key: "sourced",      label: "Sourced" },
  { key: "screened",     label: "Screened" },
  { key: "deep_dive",    label: "Deep dive" },
  { key: "ic_scheduled", label: "IC" },
  { key: "ic_approved",  label: "IC approved" },
  { key: "term_sheet",   label: "Term sheet" },
  { key: "committed",    label: "Committed" },
]

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export function DealBoardClient({ fund, initialDeals, rollup, tablesReady }: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [oneLiner, setOneLiner] = useState("")
  const [sector, setSector] = useState("")
  const [roundName, setRoundName] = useState("")
  const [proposedCheck, setProposedCheck] = useState("")
  const [source, setSource] = useState("")

  const q = query.trim().toLowerCase()
  const visibleDeals = q
    ? initialDeals.filter((d) =>
        [d.company_name, d.one_liner, d.sector, d.source, d.contact_email]
          .some((v) => v?.toLowerCase().includes(q)))
    : initialDeals
  const terminal = visibleDeals.filter((d) => d.stage === "closed" || d.stage === "passed")

  async function createDealRow() {
    if (!companyName.trim()) { setError("Company name required"); return }
    setCreating(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          oneLiner: oneLiner.trim() || null,
          sector: sector.trim() || null,
          roundName: roundName.trim() || null,
          proposedCheck: proposedCheck ? Number(proposedCheck) : null,
          source: source.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Create failed (${res.status})`)
      router.push(`/dashboard/portfolio/fund/deals/${data.id}`)
    } catch (e: any) { setError(e?.message ?? "Create failed") }
    finally { setCreating(false) }
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1500px] mx-auto px-6 lg:px-12 py-10">
          <Link href="/dashboard/portfolio/fund"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" />
            {fund.name}
          </Link>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-3">
                <span className="w-8 h-px bg-foreground/30" />
                Deal pipeline · sourcing → commitment
              </span>
              <h1 className="text-4xl lg:text-5xl font-display tracking-tight leading-[0.95]">
                Deal flow.
              </h1>
            </div>
            <div className="flex items-center gap-6">
              {rollup && (
                <div className="text-right">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Active · proposed checks</div>
                  <div className="font-display text-2xl">
                    {rollup.totalActive} · {usd(rollup.proposedCheckTotal)}
                  </div>
                </div>
              )}
              <button onClick={() => setShowCreate((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full h-11 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm">
                <Plus className="w-4 h-4" />
                New deal
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-6 lg:px-12 py-8 space-y-8">
        {!tablesReady && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Deal pipeline tables missing. Run{" "}
              <code className="font-mono text-xs bg-foreground/10 px-1.5 py-0.5 rounded">
                NEON_DATABASE_URL=… node scripts/oneshot/run-deal-pipeline-tables.mjs
              </code>{" "}
              and reload.
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">{error}</div>
        )}

        {showCreate && (
          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <h3 className="font-display text-lg">New deal</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <F label="Company *"><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" /></F>
              <F label="One-liner"><input value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" /></F>
              <F label="Sector"><input value={sector} onChange={(e) => setSector(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" /></F>
              <F label="Round"><input value={roundName} onChange={(e) => setRoundName(e.target.value)} placeholder="Seed, Series A…" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" /></F>
              <F label="Proposed check (USD)"><input type="number" value={proposedCheck} onChange={(e) => setProposedCheck(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" /></F>
              <F label="Source"><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="referral, inbound, event…" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" /></F>
            </div>
            <div className="flex gap-3">
              <button onClick={createDealRow} disabled={creating}
                className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create deal
              </button>
              <button onClick={() => setShowCreate(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        {/* Search (ported from the deprecated /dashboard/pipeline page) */}
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search deals — company, one-liner, sector, source, contact…"
          className="w-full max-w-md h-10 px-3 rounded-md border border-input bg-background text-sm" />

        {/* Board */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {BOARD_STAGES.map(({ key, label }) => {
            const cards = visibleDeals.filter((d) => d.stage === key)
            return (
              <div key={key} className="rounded-lg border border-foreground/10 bg-foreground/[0.02] min-h-[160px]">
                <div className="px-3 py-2 border-b border-foreground/10 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
                  <span className="font-mono text-xs">{cards.length}</span>
                </div>
                <div className="p-2 space-y-2">
                  {cards.map((d) => (
                    <Link key={d.id} href={`/dashboard/portfolio/fund/deals/${d.id}`}
                      className="block p-3 rounded-md border border-foreground/10 bg-background hover:border-foreground/30 transition-colors">
                      <div className="font-medium text-sm truncate">
                        {d.company_name}
                        {d.submitted_via === "public_form" && (
                          <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider px-1 py-0.5 rounded border border-blue-500/30 text-blue-600 bg-blue-500/5 align-middle">
                            inbound
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{d.one_liner ?? d.sector ?? "—"}</div>
                      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                        <span>{d.round_name ?? ""}</span>
                        <span>{d.proposed_check ? usd(d.proposed_check) : ""}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Terminal deals */}
        {terminal.length > 0 && (
          <div className="border border-foreground/10 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Closed &amp; passed
            </div>
            <table className="w-full text-sm">
              <tbody>
                {terminal.map((d) => (
                  <tr key={d.id} className="border-t border-foreground/5">
                    <td className="p-3">
                      <Link href={`/dashboard/portfolio/fund/deals/${d.id}`} className="font-medium hover:underline">
                        {d.company_name}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      <span className={d.stage === "closed" ? "text-emerald-600" : "text-muted-foreground"}>
                        {d.stage}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{d.stage === "passed" ? (d.passed_reason ?? "") : (d.closed_at ?? "").slice(0, 10)}</td>
                    <td className="p-3 font-mono text-xs text-right">{d.proposed_check ? usd(d.proposed_check) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}
