"use client"

/**
 * Syndication — three zones:
 *
 *   1. SPV list + create panel (from a committed/closed deal or free-form).
 *      Each SPV is a real fund — calls/distributions/statements work on it.
 *   2. Partner directory (the co-invest network) with inline add/edit.
 *   3. Funnel drawer per SPV: invite partners, advance stages
 *      (invited → viewed → soft_committed → docs_out → signed → funded),
 *      funded auto-promotes the partner to an LP row on the SPV.
 */

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Plus, Loader2, AlertTriangle, Users, Landmark, Send, Trash2,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type {
  SyndicateFull, SyndicatePartnerFull, SpvFunnel, CommitmentStage, PartnerType,
} from "@/lib/portfolio/syndication"

interface Props {
  fund: FundFull
  initialSyndicates: SyndicateFull[]
  initialPartners: SyndicatePartnerFull[]
  syndicatableDeals: { id: string; companyName: string; stage: string }[]
  tablesReady: boolean
}

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const STAGES: { v: CommitmentStage; l: string }[] = [
  { v: "invited", l: "Invited" }, { v: "viewed", l: "Viewed" },
  { v: "soft_committed", l: "Soft commit" }, { v: "docs_out", l: "Docs out" },
  { v: "signed", l: "Signed" }, { v: "funded", l: "Funded" },
  { v: "declined", l: "Declined" },
]
const PARTNER_TYPES: { v: PartnerType; l: string }[] = [
  { v: "angel", l: "Angel" }, { v: "family_office", l: "Family office" },
  { v: "vc_fund", l: "VC fund" }, { v: "corporate", l: "Corporate" },
  { v: "hnwi", l: "HNWI" }, { v: "other", l: "Other" },
]

export function SyndicationClient({
  fund, initialSyndicates, initialPartners, syndicatableDeals, tablesReady,
}: Props) {
  const router = useRouter()
  const [syndicates, setSyndicates] = useState(initialSyndicates)
  const [partners, setPartners] = useState(initialPartners)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Create SPV
  const [showCreate, setShowCreate] = useState(false)
  const [dealId, setDealId] = useState("")
  const [freeName, setFreeName] = useState("")
  const [allocation, setAllocation] = useState("")
  const [minTicket, setMinTicket] = useState("")
  const [carryToLead, setCarryToLead] = useState("20")

  // Partner form
  const [showPartner, setShowPartner] = useState(false)
  const [pName, setPName] = useState("")
  const [pFirm, setPFirm] = useState("")
  const [pEmail, setPEmail] = useState("")
  const [pType, setPType] = useState<PartnerType>("angel")
  const [pTicket, setPTicket] = useState("")

  // Funnel
  const [openSyn, setOpenSyn] = useState<string | null>(null)
  const [funnel, setFunnel] = useState<SpvFunnel | null>(null)
  const [invitees, setInvitees] = useState<string[]>([])
  const [eventAmount, setEventAmount] = useState("")

  const api = `/api/portfolio/funds/${fund.id}/syndicates`

  async function call(path: string, init: RequestInit, tag: string): Promise<any> {
    setBusy(tag); setError(null)
    try {
      const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `${tag} failed (${res.status})`)
      return data
    } catch (e: any) { setError(e?.message ?? `${tag} failed`); return null }
    finally { setBusy(null) }
  }

  async function createSpv() {
    const data = await call(api, {
      method: "POST",
      body: JSON.stringify({
        dealId: dealId || null,
        companyName: freeName.trim() || null,
        allocationAmount: allocation ? Number(allocation) : null,
        minTicket: minTicket ? Number(minTicket) : null,
        carryToLeadPct: (Number(carryToLead) || 20) / 100,
      }),
    }, "create-spv")
    if (data) {
      setSyndicates([data, ...syndicates])
      setShowCreate(false); setDealId(""); setFreeName(""); setAllocation(""); setMinTicket("")
      router.refresh()
    }
  }

  async function savePartner() {
    const data = await call(`${api}/partners`, {
      method: "POST",
      body: JSON.stringify({
        name: pName, firm: pFirm || null, email: pEmail || null,
        partnerType: pType, typicalTicket: pTicket ? Number(pTicket) : null,
      }),
    }, "partner")
    if (data) {
      setPartners(data.partners)
      setPName(""); setPFirm(""); setPEmail(""); setPTicket(""); setShowPartner(false)
    }
  }

  async function removePartner(id: string) {
    const data = await call(`${api}/partners?partnerId=${encodeURIComponent(id)}`, { method: "DELETE" }, id)
    if (data) setPartners(partners.filter((p) => p.id !== id))
  }

  async function openFunnel(synId: string) {
    if (openSyn === synId) { setOpenSyn(null); setFunnel(null); return }
    setOpenSyn(synId); setFunnel(null); setInvitees([])
    const data = await call(`${api}/${synId}`, { method: "GET" }, "funnel")
    if (data) setFunnel(data.funnel)
  }

  async function invite(synId: string) {
    if (invitees.length === 0) return
    const data = await call(`${api}/${synId}/events`, {
      method: "POST",
      body: JSON.stringify({ partnerIds: invitees, stage: "invited" }),
    }, "invite")
    if (data) { setFunnel(data.funnel); setInvitees([]) }
  }

  async function advance(synId: string, partnerId: string, stage: CommitmentStage) {
    const data = await call(`${api}/${synId}/events`, {
      method: "POST",
      body: JSON.stringify({
        partnerId, stage,
        amount: eventAmount ? Number(eventAmount) : null,
      }),
    }, `${partnerId}-${stage}`)
    if (data) { setFunnel(data.funnel); setEventAmount("") }
  }

  const invitedIds = new Set(funnel?.rows.map((r) => r.partnerId) ?? [])

  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
          <Link href="/dashboard/portfolio/fund"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" />
            {fund.name}
          </Link>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-3">
                <span className="w-8 h-px bg-foreground/30" />
                Syndication · SPVs + co-invest network
              </span>
              <h1 className="text-4xl lg:text-5xl font-display tracking-tight leading-[0.95]">
                Syndicates.
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowPartner((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full h-11 px-5 border border-foreground/15 hover:bg-foreground/5 text-sm">
                <Users className="w-4 h-4" />
                Add partner
              </button>
              <button onClick={() => setShowCreate((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full h-11 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm">
                <Plus className="w-4 h-4" />
                New SPV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8 space-y-6">
        {!tablesReady && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Syndication tables missing. Run{" "}
              <code className="font-mono text-xs bg-foreground/10 px-1.5 py-0.5 rounded">
                NEON_DATABASE_URL=… node scripts/oneshot/run-syndication-tables.mjs
              </code>{" "}
              and reload.
            </span>
          </div>
        )}
        {error && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">{error}</div>
        )}

        {/* Create SPV */}
        {showCreate && (
          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <h3 className="font-display text-lg">New SPV</h3>
            <p className="text-xs text-muted-foreground">
              An SPV is a real fund on the platform — capital calls, distributions, LP statements,
              ledger, and the waterfall all work on it once created.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <F label="Syndicate a deal">
                <select value={dealId} onChange={(e) => setDealId(e.target.value)}
                  className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm">
                  <option value="">— free-form (name below) —</option>
                  {syndicatableDeals.map((dl) => (
                    <option key={dl.id} value={dl.id}>{dl.companyName} ({dl.stage})</option>
                  ))}
                </select>
              </F>
              <F label="Company name (free-form)">
                <input value={freeName} onChange={(e) => setFreeName(e.target.value)} disabled={!!dealId}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-50" />
              </F>
              <F label="Allocation (USD)">
                <input type="number" value={allocation} onChange={(e) => setAllocation(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
              </F>
              <F label="Min ticket (USD)">
                <input type="number" value={minTicket} onChange={(e) => setMinTicket(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
              </F>
              <F label="Carry to lead %">
                <input type="number" value={carryToLead} onChange={(e) => setCarryToLead(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
              </F>
            </div>
            <div className="flex gap-3">
              <button onClick={createSpv} disabled={busy === "create-spv" || (!dealId && !freeName.trim())}
                className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {busy === "create-spv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
                Create SPV
              </button>
              <button onClick={() => setShowCreate(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        {/* Add partner */}
        {showPartner && (
          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <h3 className="font-display text-lg">Add co-invest partner</h3>
            <div className="grid md:grid-cols-5 gap-3">
              <F label="Name *"><input value={pName} onChange={(e) => setPName(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" /></F>
              <F label="Firm"><input value={pFirm} onChange={(e) => setPFirm(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" /></F>
              <F label="Email"><input value={pEmail} onChange={(e) => setPEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" /></F>
              <F label="Type">
                <select value={pType} onChange={(e) => setPType(e.target.value as PartnerType)}
                  className="w-full h-10 px-2 rounded-md border border-input bg-background text-sm font-mono">
                  {PARTNER_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </F>
              <F label="Typical ticket (USD)"><input type="number" value={pTicket} onChange={(e) => setPTicket(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" /></F>
            </div>
            <div className="flex gap-3">
              <button onClick={savePartner} disabled={busy === "partner" || !pName.trim()}
                className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {busy === "partner" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Save partner
              </button>
              <button onClick={() => setShowPartner(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* SPVs */}
          <div className="lg:col-span-2 space-y-4">
            {syndicates.length === 0 && (
              <div className="border border-foreground/10 rounded-lg p-8 text-center text-sm text-muted-foreground">
                No SPVs yet. Create one from a committed or closed deal — the SPV becomes a real
                fund with its own LP register, calls, and statements.
              </div>
            )}
            {syndicates.map((s) => (
              <div key={s.id} className="border border-foreground/10 rounded-lg">
                <button onClick={() => openFunnel(s.id)}
                  className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-foreground/[0.02]">
                  <div>
                    <div className="font-medium">{s.spv_name ?? s.company_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {usd(s.allocation_amount)} allocation · {(s.carry_to_lead_pct * 100).toFixed(0)}% carry to lead ·{" "}
                      <span className={s.status === "raising" ? "text-amber-700" : s.status === "closed" ? "text-emerald-700" : ""}>{s.status}</span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {openSyn === s.id ? "close" : "funnel →"}
                  </span>
                </button>

                {openSyn === s.id && (
                  <div className="border-t border-foreground/10 p-4 space-y-4">
                    {busy === "funnel" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    {funnel && (
                      <>
                        <div className="grid grid-cols-4 gap-3 text-center">
                          <Kpi label="Invited" v={String(funnel.totals.invited)} />
                          <Kpi label="Soft committed" v={`${funnel.totals.softCommitted} · ${usd(funnel.totals.softCommittedAmount)}`} />
                          <Kpi label="Signed" v={`${funnel.totals.signed} · ${usd(funnel.totals.signedAmount)}`} />
                          <Kpi label="Funded" v={`${funnel.totals.funded} · ${usd(funnel.totals.fundedAmount)}`} strong />
                        </div>

                        {/* Invite */}
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[220px]">
                            <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                              Invite partners
                            </label>
                            <select multiple value={invitees}
                              onChange={(e) => setInvitees([...e.target.selectedOptions].map((o) => o.value))}
                              className="w-full min-h-[70px] px-2 py-1 rounded-md border border-input bg-background text-sm">
                              {partners.filter((p) => !invitedIds.has(p.id)).map((p) => (
                                <option key={p.id} value={p.id}>{p.name}{p.firm ? ` · ${p.firm}` : ""}</option>
                              ))}
                            </select>
                          </div>
                          <button onClick={() => invite(s.id)} disabled={busy === "invite" || invitees.length === 0}
                            className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                            {busy === "invite" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Invite
                          </button>
                        </div>

                        {/* Funnel rows */}
                        {funnel.rows.length > 0 && (
                          <table className="w-full text-xs">
                            <thead className="bg-foreground/5">
                              <tr>
                                {["Partner", "Stage", "Amount", "Advance to"].map((h) => (
                                  <th key={h} className="p-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {funnel.rows.map((r) => (
                                <tr key={r.partnerId} className="border-t border-foreground/5">
                                  <td className="p-2">{r.partnerName}{r.partnerFirm ? <span className="text-muted-foreground"> · {r.partnerFirm}</span> : null}</td>
                                  <td className="p-2">
                                    <span className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border ${
                                      r.currentStage === "funded" ? "text-emerald-700 border-emerald-500/30 bg-emerald-500/5"
                                      : r.currentStage === "declined" ? "text-destructive border-destructive/30 bg-destructive/5"
                                      : "text-foreground/70 border-foreground/10"
                                    }`}>{r.currentStage.replace(/_/g, " ")}</span>
                                  </td>
                                  <td className="p-2 font-mono">{usd(r.amount)}</td>
                                  <td className="p-2">
                                    {r.currentStage !== "funded" && r.currentStage !== "declined" && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <input type="number" value={eventAmount} onChange={(e) => setEventAmount(e.target.value)}
                                          placeholder="amount"
                                          className="h-7 w-24 px-2 rounded border border-input bg-background text-xs font-mono" />
                                        {STAGES.filter((st) => st.v !== "invited" && st.v !== r.currentStage).map((st) => (
                                          <button key={st.v}
                                            onClick={() => advance(s.id, r.partnerId, st.v)}
                                            disabled={busy === `${r.partnerId}-${st.v}`}
                                            className="font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground hover:underline">
                                            {st.l}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Funding a partner creates their LP row on the SPV automatically — capital calls
                          and statements pick them up from there.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Partner directory */}
          <div className="border border-foreground/10 rounded-lg p-4 h-fit">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
              Co-invest network · {partners.length}
            </h3>
            {partners.length === 0 ? (
              <p className="text-sm text-muted-foreground">No partners yet.</p>
            ) : (
              <ul className="space-y-2">
                {partners.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 text-sm border-t border-foreground/5 pt-2 first:border-0 first:pt-0">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[p.firm, p.partner_type.replace("_", " "), p.typical_ticket ? usd(p.typical_ticket) : null]
                          .filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button onClick={() => removePartner(p.id)} disabled={busy === p.id}
                      className="p-1 text-muted-foreground hover:text-destructive shrink-0">
                      {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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

function Kpi({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <div className={`p-3 rounded-md border ${strong ? "border-emerald-500/30 bg-emerald-500/5" : "border-foreground/10"}`}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="font-display text-sm">{v}</div>
    </div>
  )
}
