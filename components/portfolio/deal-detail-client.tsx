"use client"

/**
 * Deal workroom — one screen for the whole evaluation lifecycle:
 *
 *   header    stage stepper + advance / pass actions
 *   left      facts (editable), scorecard, IC votes
 *   right     term grid versions, AI memo, close panel
 *
 * The close panel only renders at `committed` — it calls the close
 * endpoint which writes the Phase-1 investments row and links it back.
 */

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, Sparkles, CheckCircle2, XCircle, ArrowRight,
  Landmark, FileText, Scale as ScaleIcon,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
// Runtime value + stage type come from the DB-free constants module so this
// client component never pulls the Postgres driver into the browser bundle.
import { DEAL_CRITERIA, type DealStage } from "@/lib/portfolio/deal-constants"
import type {
  DealFull, DealEvaluation, IcVote, VoteTally, TermGrid, IcVoteValue,
} from "@/lib/portfolio/deal-pipeline"

interface Props {
  fund: FundFull
  initialDeal: DealFull
  initialEvaluation: DealEvaluation | null
  initialVotes: IcVote[]
  initialTally: VoteTally
  initialTerms: TermGrid[]
}

const STAGE_FLOW: DealStage[] = [
  "sourced", "screened", "deep_dive", "ic_scheduled", "ic_approved", "term_sheet", "committed", "closed",
]
const STAGE_LABEL: Record<DealStage, string> = {
  sourced: "Sourced", screened: "Screened", deep_dive: "Deep dive",
  ic_scheduled: "IC", ic_approved: "IC approved", term_sheet: "Term sheet",
  committed: "Committed", closed: "Closed", passed: "Passed",
}

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export function DealDetailClient({
  fund, initialDeal, initialEvaluation, initialVotes, initialTally, initialTerms,
}: Props) {
  const router = useRouter()
  const [deal, setDeal] = useState(initialDeal)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Scorecard state
  const [scores, setScores] = useState<Record<string, { score: number; note?: string | null }>>(
    initialEvaluation?.scores ?? {},
  )
  const [evalSummary, setEvalSummary] = useState(initialEvaluation?.summary ?? "")
  const [weighted, setWeighted] = useState<number | null>(initialEvaluation?.weighted_score ?? null)

  // Votes
  const [votes, setVotes] = useState(initialVotes)
  const [tally, setTally] = useState(initialTally)
  const [voteMember, setVoteMember] = useState("")
  const [voteValue, setVoteValue] = useState<IcVoteValue>("approve")
  const [voteNote, setVoteNote] = useState("")

  // Terms
  const [terms, setTerms] = useState(initialTerms)
  const [tPre, setTPre] = useState("")
  const [tRound, setTRound] = useState("")
  const [tCheck, setTCheck] = useState("")
  const [tSecurity, setTSecurity] = useState("preferred")
  const [tOther, setTOther] = useState("")

  // Pass panel
  const [showPass, setShowPass] = useState(false)
  const [passReason, setPassReason] = useState("")

  // Close panel
  const [closeCost, setCloseCost] = useState("")
  const [closeFd, setCloseFd] = useState("")
  // Reserve check (Phase 7): validates the proposed check against the fund
  // plan's remaining initial-check budget. Null when no plan is saved.
  const [reserveCheck, setReserveCheck] = useState<{ fits: boolean; message: string } | null>(null)

  const effectiveCheck =
    Number(closeCost) || initialTerms[0]?.check_amount || initialDeal.proposed_check || 0

  useEffect(() => {
    if (initialDeal.stage !== "committed" || !(effectiveCheck > 0)) { setReserveCheck(null); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/portfolio/funds/${fund.id}/plan?check=${effectiveCheck}`)
        const data = await res.json().catch(() => ({}))
        setReserveCheck(res.ok && data?.check ? data.check : null)
      } catch { setReserveCheck(null) }
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCheck, initialDeal.stage])

  const api = `/api/portfolio/funds/${fund.id}/deals/${deal.id}`
  const isTerminal = deal.stage === "closed" || deal.stage === "passed"
  const stageIdx = STAGE_FLOW.indexOf(deal.stage)
  const nextStage: DealStage | null =
    !isTerminal && stageIdx >= 0 && stageIdx < STAGE_FLOW.length - 1
      ? STAGE_FLOW[stageIdx + 1]
      : null

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

  async function advance(to: DealStage, reason?: string) {
    const data = await call(api, { method: "PATCH", body: JSON.stringify({ stage: to, passedReason: reason ?? null }) }, "advance")
    if (data) { setDeal(data); setShowPass(false); router.refresh() }
  }

  async function saveScores() {
    const data = await call(`${api}/evaluation`, { method: "PUT", body: JSON.stringify({ scores, summary: evalSummary || null }) }, "scorecard")
    if (data) { setWeighted(data.weighted_score); }
  }

  async function submitVote() {
    const data = await call(`${api}/votes`, {
      method: "POST",
      body: JSON.stringify({ member: voteMember || undefined, vote: voteValue, note: voteNote || null }),
    }, "vote")
    if (data) { setVotes(data.votes); setTally(data.tally); setVoteNote("") }
  }

  async function addTerms() {
    const data = await call(`${api}/terms`, {
      method: "POST",
      body: JSON.stringify({
        securityType: tSecurity,
        preMoney: tPre ? Number(tPre) : null,
        roundSize: tRound ? Number(tRound) : null,
        checkAmount: tCheck ? Number(tCheck) : null,
        otherTerms: tOther || null,
      }),
    }, "terms")
    if (data) { setTerms(data.rows); setTPre(""); setTRound(""); setTCheck(""); setTOther("") }
  }

  async function generateMemo() {
    const data = await call(`${api}/memo`, { method: "POST" }, "memo")
    if (data) setDeal(data)
  }

  async function doClose() {
    const data = await call(`${api}/close`, {
      method: "POST",
      body: JSON.stringify({
        costBasis: closeCost ? Number(closeCost) : null,
        fullyDilutedPct: closeFd ? Number(closeFd) / 100 : null,
      }),
    }, "close")
    if (data) { setDeal(data.deal); router.refresh() }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8">
          <Link href="/dashboard/portfolio/fund/deals"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5">
            <ArrowLeft className="w-4 h-4" />
            Deal pipeline
          </Link>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <h1 className="text-3xl lg:text-4xl font-display tracking-tight">{deal.company_name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {deal.one_liner ?? "—"} {deal.sector && <>· {deal.sector}</>} {deal.round_name && <>· {deal.round_name}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isTerminal && nextStage && nextStage !== "closed" && (
                <button onClick={() => advance(nextStage)} disabled={busy === "advance"}
                  className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                  {busy === "advance" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Advance to {STAGE_LABEL[nextStage]}
                </button>
              )}
              {!isTerminal && (
                <button onClick={() => setShowPass((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full h-10 px-4 border border-foreground/15 hover:bg-foreground/5 text-sm">
                  <XCircle className="w-4 h-4" />
                  Pass
                </button>
              )}
            </div>
          </div>

          {/* Stepper */}
          <div className="mt-6 flex items-center gap-1 flex-wrap">
            {STAGE_FLOW.map((s, i) => {
              const active = deal.stage === s
              const done = stageIdx > i || deal.stage === "closed"
              return (
                <div key={s} className="flex items-center gap-1">
                  {i > 0 && <span className="w-4 h-px bg-foreground/20" />}
                  <span className={`px-2 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider border ${
                    active ? "bg-foreground text-background border-foreground"
                    : done ? "text-emerald-700 border-emerald-500/30 bg-emerald-500/5"
                    : "text-muted-foreground border-foreground/10"
                  }`}>
                    {STAGE_LABEL[s]}
                  </span>
                </div>
              )
            })}
            {deal.stage === "passed" && (
              <span className="ml-2 px-2 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider border border-destructive/30 text-destructive bg-destructive/5">
                Passed {deal.passed_reason ? `· ${deal.passed_reason}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8 space-y-6">
        {error && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">{error}</div>
        )}

        {showPass && (
          <div className="border border-destructive/30 rounded-lg p-4 flex flex-wrap items-end gap-3 bg-destructive/5">
            <div className="flex-1 min-w-[240px]">
              <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pass reason</label>
              <input value={passReason} onChange={(e) => setPassReason(e.target.value)}
                placeholder="valuation, timing, out of thesis…"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" />
            </div>
            <button onClick={() => advance("passed", passReason || null as any)} disabled={busy === "advance"}
              className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-destructive text-white hover:bg-destructive/90 text-sm disabled:opacity-50">
              Confirm pass
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* ── Left column ─────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Facts */}
            <div className="border border-foreground/10 rounded-lg p-5">
              <h3 className="font-display text-lg mb-3">Deal facts</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Fact k="Raise" v={usd(deal.raise_amount)} />
                <Fact k="Pre-money" v={usd(deal.pre_money)} />
                <Fact k="Proposed check" v={usd(deal.proposed_check)} />
                <Fact k="Source" v={deal.source ?? "—"} />
                <Fact k="Geography" v={deal.geography ?? "—"} />
                <Fact k="Owner" v={deal.owner_email ?? "—"} />
              </dl>
              {deal.notes && <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{deal.notes}</p>}
              {deal.investment_id && (
                <Link href="/dashboard/portfolio/fund/investments"
                  className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-700 hover:underline">
                  <Landmark className="w-4 h-4" />
                  Position created — view in position book
                </Link>
              )}
            </div>

            {/* Scorecard */}
            <div className="border border-foreground/10 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg">Scorecard</h3>
                <span className="font-display text-2xl">{weighted != null ? weighted.toFixed(2) : "—"}<span className="text-sm text-muted-foreground"> / 5</span></span>
              </div>
              <div className="space-y-3">
                {DEAL_CRITERIA.map((c) => {
                  const cur = scores[c.key]?.score ?? 0
                  return (
                    <div key={c.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium" title={c.hint}>{c.label}
                          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{(c.weight * 100).toFixed(0)}%</span>
                        </span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n}
                              onClick={() => setScores({ ...scores, [c.key]: { ...scores[c.key], score: n } })}
                              className={`w-7 h-7 rounded text-xs font-mono border ${
                                cur >= n ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-muted-foreground hover:border-foreground/40"
                              }`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <textarea value={evalSummary} onChange={(e) => setEvalSummary(e.target.value)}
                placeholder="Evaluation summary…"
                className="mt-4 w-full min-h-[70px] p-3 rounded-md border border-input bg-background text-sm" />
              <button onClick={saveScores} disabled={busy === "scorecard" || isTerminal}
                className="mt-3 inline-flex items-center gap-2 rounded-full h-9 px-4 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {busy === "scorecard" && <Loader2 className="w-4 h-4 animate-spin" />}
                Save scorecard
              </button>
            </div>

            {/* IC votes */}
            <div className="border border-foreground/10 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg">IC votes</h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {tally.approve + tally.approveWithConditions} for · {tally.decline} against · {tally.abstain} abstain
                </span>
              </div>
              {votes.length > 0 && (
                <ul className="space-y-1.5 mb-4">
                  {votes.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 text-sm">
                      {v.vote === "decline"
                        ? <XCircle className="w-4 h-4 text-destructive shrink-0" />
                        : v.vote === "abstain"
                          ? <span className="w-4 h-4 shrink-0 text-muted-foreground text-center leading-4">·</span>
                          : <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      <span className="font-medium">{v.member}</span>
                      <span className="font-mono text-xs text-muted-foreground">{v.vote.replace(/_/g, " ")}</span>
                      {v.note && <span className="text-xs text-muted-foreground truncate">— {v.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {!isTerminal && (
                <div className="flex flex-wrap items-end gap-2">
                  <input value={voteMember} onChange={(e) => setVoteMember(e.target.value)} placeholder="Member (default: you)"
                    className="h-9 flex-1 min-w-[140px] px-3 rounded-md border border-input bg-background text-sm" />
                  <select value={voteValue} onChange={(e) => setVoteValue(e.target.value as IcVoteValue)}
                    className="h-9 px-2 rounded-md border border-input bg-background text-sm font-mono">
                    <option value="approve">Approve</option>
                    <option value="approve_with_conditions">Approve w/ conditions</option>
                    <option value="decline">Decline</option>
                    <option value="abstain">Abstain</option>
                  </select>
                  <input value={voteNote} onChange={(e) => setVoteNote(e.target.value)} placeholder="Note"
                    className="h-9 flex-1 min-w-[120px] px-3 rounded-md border border-input bg-background text-sm" />
                  <button onClick={submitVote} disabled={busy === "vote"}
                    className="h-9 px-4 rounded-full bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                    {busy === "vote" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cast"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Right column ────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Term grid */}
            <div className="border border-foreground/10 rounded-lg p-5">
              <h3 className="font-display text-lg mb-3 flex items-center gap-2"><ScaleIcon className="w-4 h-4" /> Term grid</h3>
              {terms.length > 0 && (
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs">
                    <thead className="bg-foreground/5">
                      <tr>
                        {["v", "Security", "Pre-money", "Round", "Check", "Other"].map((h) => (
                          <th key={h} className="p-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {terms.map((t) => (
                        <tr key={t.id} className="border-t border-foreground/5">
                          <td className="p-2 font-mono">v{t.version}</td>
                          <td className="p-2 font-mono">{t.security_type ?? "—"}</td>
                          <td className="p-2 font-mono">{usd(t.pre_money)}</td>
                          <td className="p-2 font-mono">{usd(t.round_size)}</td>
                          <td className="p-2 font-mono">{usd(t.check_amount)}</td>
                          <td className="p-2 text-muted-foreground truncate max-w-[160px]">{t.other_terms ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!isTerminal && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={tSecurity} onChange={(e) => setTSecurity(e.target.value)}
                    className="h-9 px-2 rounded-md border border-input bg-background text-sm font-mono">
                    <option value="preferred">Preferred</option>
                    <option value="safe">SAFE</option>
                    <option value="convertible_note">Convertible note</option>
                    <option value="common">Common</option>
                  </select>
                  <input type="number" value={tCheck} onChange={(e) => setTCheck(e.target.value)} placeholder="Check (USD)"
                    className="h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                  <input type="number" value={tPre} onChange={(e) => setTPre(e.target.value)} placeholder="Pre-money"
                    className="h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                  <input type="number" value={tRound} onChange={(e) => setTRound(e.target.value)} placeholder="Round size"
                    className="h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                  <input value={tOther} onChange={(e) => setTOther(e.target.value)} placeholder="Other terms"
                    className="col-span-2 h-9 px-3 rounded-md border border-input bg-background text-sm" />
                  <button onClick={addTerms} disabled={busy === "terms"}
                    className="col-span-2 h-9 rounded-full border border-foreground/15 hover:bg-foreground/5 text-sm disabled:opacity-50">
                    {busy === "terms" ? "Saving…" : `Add term grid v${(terms[0]?.version ?? 0) + 1}`}
                  </button>
                </div>
              )}
            </div>

            {/* AI memo */}
            <div className="border border-foreground/10 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg flex items-center gap-2"><FileText className="w-4 h-4" /> IC memo</h3>
                <button onClick={generateMemo} disabled={busy === "memo"}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-full border border-foreground/15 hover:bg-foreground/5 text-sm disabled:opacity-50">
                  {busy === "memo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {deal.memo_md ? "Regenerate" : "Generate with AI"}
                </button>
              </div>
              {deal.memo_md ? (
                <>
                  <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap max-h-[420px] overflow-y-auto border border-foreground/5 rounded-md p-4 bg-foreground/[0.02]">
                    {deal.memo_md}
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    Generated {deal.memo_generated_at?.slice(0, 16).replace("T", " ")} · context frozen at generation
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No memo yet. Fill in facts, scorecard, and terms first — the memo is generated
                  from exactly that data and the context is stored with it.
                </p>
              )}
            </div>

            {/* Close panel */}
            {deal.stage === "committed" && (
              <div className="border border-emerald-500/30 rounded-lg p-5 bg-emerald-500/5">
                <h3 className="font-display text-lg mb-2 flex items-center gap-2">
                  <Landmark className="w-4 h-4" /> Close deal → create position
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Writes the investment into the fund&apos;s position book, seeded at cost —
                  NAV and LP statements update immediately.
                </p>
                {reserveCheck && (
                  <p className={`mb-3 text-xs font-mono px-3 py-2 rounded-md border ${
                    reserveCheck.fits
                      ? "text-emerald-700 border-emerald-500/30 bg-emerald-500/5"
                      : "text-destructive border-destructive/30 bg-destructive/5"
                  }`}>
                    Reserve check: {reserveCheck.message}{" "}
                    <Link href="/dashboard/portfolio/fund/plan" className="underline">plan →</Link>
                  </p>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Cost basis (default: latest term-grid check)
                    </label>
                    <input type="number" value={closeCost} onChange={(e) => setCloseCost(e.target.value)}
                      placeholder={String(terms[0]?.check_amount ?? deal.proposed_check ?? "")}
                      className="h-10 w-44 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">FD %</label>
                    <input type="number" step="0.01" value={closeFd} onChange={(e) => setCloseFd(e.target.value)}
                      placeholder="e.g. 8.5"
                      className="h-10 w-28 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                  </div>
                  <button onClick={doClose} disabled={busy === "close"}
                    className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-emerald-600 text-white hover:bg-emerald-700 text-sm disabled:opacity-50">
                    {busy === "close" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Close &amp; book position
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stage history */}
        {deal.stage_history.length > 1 && (
          <div className="border border-foreground/10 rounded-lg p-5">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Stage history</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-muted-foreground">
              {deal.stage_history.map((h, i) => (
                <span key={i}>{h.stage} · {h.at.slice(0, 16).replace("T", " ")}{h.by ? ` · ${h.by}` : ""}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground self-center">{k}</dt>
      <dd className="font-mono text-sm">{v}</dd>
    </>
  )
}
