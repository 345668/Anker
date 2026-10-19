"use client"

/**
 * The ranked LPs of one saved run, with the reasons behind each and what a person can do with them (docs/architecture/63 M3, M4).
 * Nothing here sends anything: adding puts people in the CRM, drafts become proposals in the Actions inbox, verdicts are kept as the workspace's labels.
 */
import { useCallback, useEffect, useState } from "react"
import { Loader2, Mail, Linkedin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type Kind = "firm" | "contact"
interface Row {
  kind: Kind; id: string; name: string; title: string | null; type: string; location: string; tier: string; score: number; stage: string
  confidence: string | null; gaps: string[]; reasons: string[]; why: string; expectedTicket: number | null; aumUsd: number | null
  hasEmail: boolean; hasLinkedIn: boolean; verdict: string | null; excluded: boolean
}
interface Detail extends Row { sessionId: string; factors: Array<{ key: string; label: string; points: number }> }

const TIERS = [["", "All tiers"], ["champion", "Champion"], ["priority_a", "Priority A"], ["priority_b", "Priority B"], ["prospect_c", "Prospect C"]]
const CONF = [["", "Any confidence"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]
const REASONS: Array<[string, string]> = [["", "No reason"], ["wrong_type", "Wrong kind of investor"], ["too_small", "Too small"], ["wrong_geography", "Wrong geography"], ["wrong_sector", "Wrong sector"], ["already_in_touch", "Already in touch"], ["not_investing", "Not investing in funds"], ["other", "Other"]]
const VERDICT_LABEL: Record<string, string> = { fit: "Fit", not_a_fit: "Not a fit", already_known: "Already known", wrong_data: "Wrong data" }
const money = (n: number | null) => (n == null ? "" : n >= 1e9 ? `$${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`)

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, init)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error || "That did not work. Please try again.")
  return j
}
const post = (url: string, body: unknown) => call(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

function ConfidenceBadge({ c }: { c: string | null }) {
  if (!c) return null
  return <span className={cn("px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider", c === "high" ? "bg-emerald-500/10 text-emerald-700" : c === "medium" ? "bg-amber-500/10 text-amber-700" : "bg-foreground/5 text-muted-foreground")}>{c}</span>
}

export function LpResultsPanel({ sessionId }: { sessionId: string }) {
  const [kind, setKind] = useState<Kind>("firm")
  const [tier, setTier] = useState(""), [confidence, setConfidence] = useState(""), [q, setQ] = useState(""), [hideJudged, setHideJudged] = useState(false)
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<Row[]>([]), [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState<Detail | null>(null)
  const [reason, setReason] = useState(""), [never, setNever] = useState(false)
  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ kind, limit: String(LIMIT), offset: String(offset) })
      if (tier) qs.set("tier", tier); if (confidence) qs.set("confidence", confidence); if (q.trim()) qs.set("q", q.trim()); if (hideJudged) qs.set("hideJudged", "1")
      const j = await call(`/api/lp/matching/sessions/${sessionId}/matches?${qs}`)
      setRows(j.rows); setTotal(j.total)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [sessionId, kind, tier, confidence, q, hideJudged, offset])
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t) }, [load, q])
  useEffect(() => { setOffset(0); setPicked(new Set()) }, [kind, tier, confidence, q, hideJudged, sessionId])

  const refs = (ids: Iterable<string>) => [...ids].map((id) => ({ kind, id }))
  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setNotice(null)
    try { setNotice(await fn()); setPicked(new Set()); await load() } catch (e: any) { setNotice(e.message) } finally { setBusy(false) }
  }
  const addToCrm = (ids: string[]) => run(async () => {
    const j = await post("/api/lp/matching/actions", { action: "add_to_crm", sessionId, refs: refs(ids) })
    return `Added ${j.added.length} to the CRM board "${j.boardName}".${j.already.length ? ` ${j.already.length} already there.` : ""}${j.skipped.length ? ` Not added: ${j.skipped.map((s: any) => `${s.name} (${s.reason})`).join("; ")}.` : ""}`
  })
  const draft = (ids: string[]) => run(async () => {
    const j = await post("/api/lp/matching/actions", { action: "draft_intros", sessionId, refs: refs(ids) })
    return `${j.proposed} draft${j.proposed === 1 ? "" : "s"} written as proposals in the Actions inbox. Nothing was sent.${j.skipped.length ? ` Skipped: ${j.skipped.map((s: any) => `${s.name} (${s.reason})`).join("; ")}.` : ""}`
  })
  const judge = (ids: string[], verdict: string) => run(async () => {
    for (const id of ids) await post("/api/lp/matching/feedback", { kind, matchId: id, verdict, reason: reason || null, neverAgain: never && verdict !== "fit" })
    setOpen(null)
    return `Recorded "${VERDICT_LABEL[verdict]}" for ${ids.length}.${never && verdict !== "fit" ? " They will not be suggested again." : ""}`
  })
  const openRow = async (r: Row) => { setReason(""); setNever(false); try { setOpen(await call(`/api/lp/matching/matches/${r.kind}/${r.id}`)) } catch (e: any) { setNotice(e.message) } }
  const allOnPage = rows.length > 0 && rows.every((r) => picked.has(r.id))
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Ranked LPs</h2>
          <p className="text-sm text-muted-foreground">Open one to see why it is suggested and what is not known. Nothing here sends anything.</p>
        </div>
        <div className="inline-flex rounded-md border border-foreground/10 overflow-hidden text-sm">
          {(["firm", "contact"] as Kind[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cn("px-3 h-8", kind === k ? "bg-foreground text-background" : "hover:bg-foreground/5")}>{k === "firm" ? "Firms" : "People"}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="h-8 px-3 border border-foreground/10 rounded-md bg-background w-48" aria-label="Search by name" />
        <select value={tier} onChange={(e) => setTier(e.target.value)} className="h-8 px-2 border border-foreground/10 rounded-md bg-background" aria-label="Tier">{TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={confidence} onChange={(e) => setConfidence(e.target.value)} className="h-8 px-2 border border-foreground/10 rounded-md bg-background" aria-label="Confidence">{CONF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <label className="flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked={hideJudged} onChange={(e) => setHideJudged(e.target.checked)} /> Hide ones I have judged</label>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{total.toLocaleString("en-US")} shown</span>
      </div>

      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-foreground/[0.04] px-3 py-2 text-sm">
          <span className="font-medium">{picked.size} chosen</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => addToCrm([...picked])}>Add to CRM</Button>
          {kind === "contact" && <Button size="sm" variant="outline" disabled={busy || picked.size > 10} onClick={() => draft([...picked])} title={picked.size > 10 ? "Up to 10 at a time" : "Writes first-contact drafts as proposals"}>Draft intros</Button>}
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 px-2 border border-foreground/10 rounded-md bg-background" aria-label="Reason">{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Never suggest again</label>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => judge([...picked], "not_a_fit")}>Not a fit</Button>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setPicked(new Set())} aria-label="Clear selection"><X className="w-4 h-4" /></button>
        </div>
      )}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground border-b border-foreground/10">
              <th className="py-2 pr-2 w-8"><input type="checkbox" checked={allOnPage} onChange={() => setPicked(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Choose all on this page" /></th>
              <th className="py-2 pr-3">{kind === "firm" ? "Firm" : "Person"}</th><th className="py-2 pr-3 hidden md:table-cell">Why</th><th className="py-2 pr-3">Score</th><th className="py-2 pr-3 hidden sm:table-cell">Confidence</th><th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? <tr><td colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading</td></tr> : null}
            {!loading && !rows.length && !error ? <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nothing matches these filters.</td></tr> : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-foreground/5 hover:bg-foreground/[0.03] align-top">
                <td className="py-2 pr-2"><input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Choose ${r.name}`} /></td>
                <td className="py-2 pr-3">
                  <button onClick={() => openRow(r)} className="text-left font-medium hover:underline">{r.name || "Unnamed"}</button>
                  <div className="text-[11px] text-muted-foreground">{[r.title, r.type, r.location].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="py-2 pr-3 hidden md:table-cell text-muted-foreground max-w-[26rem]"><span className="line-clamp-2">{r.why}</span></td>
                <td className="py-2 pr-3 font-mono">{r.score.toFixed(1)}<div className="text-[10px] text-muted-foreground">{r.tier.replace("_", " ")}</div></td>
                <td className="py-2 pr-3 hidden sm:table-cell"><ConfidenceBadge c={r.confidence} /></td>
                <td className="py-2 text-[11px] text-muted-foreground">
                  {r.excluded ? "Never again" : r.verdict ? VERDICT_LABEL[r.verdict] : r.stage === "identified" ? "" : r.stage}
                  {r.kind === "contact" && <span className="inline-flex gap-1 ml-1 align-middle">{r.hasEmail && <Mail className="w-3 h-3" aria-label="Has email" />}{r.hasLinkedIn && <Linkedin className="w-3 h-3" aria-label="Has LinkedIn" />}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > LIMIT && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Previous</Button>
          <span className="font-mono text-[11px] text-muted-foreground">{offset + 1} to {Math.min(total, offset + LIMIT)} of {total.toLocaleString("en-US")}</span>
          <Button size="sm" variant="outline" disabled={offset + LIMIT >= total || loading} onClick={() => setOffset(offset + LIMIT)}>Next</Button>
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.name}</SheetTitle>
                <SheetDescription>{[open.title, open.type, open.location].filter(Boolean).join(" · ") || "No details recorded"}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-5 text-sm">
                <div className="flex items-center gap-2"><span className="font-mono text-lg">{open.score.toFixed(1)}</span><span className="text-muted-foreground">{open.tier.replace("_", " ")}</span><ConfidenceBadge c={open.confidence} /></div>
                <p>{open.why}</p>
                {open.reasons.length > 0 && <section><h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Why it is suggested</h3><ul className="list-disc pl-4 space-y-0.5">{open.reasons.map((x) => <li key={x}>{x}</li>)}</ul></section>}
                {(open.expectedTicket || open.aumUsd) && <p className="text-muted-foreground">{open.aumUsd ? `AUM ${money(open.aumUsd)}. ` : ""}{open.expectedTicket ? `Likely cheque about ${money(open.expectedTicket)}.` : ""}</p>}
                {open.gaps.length > 0 && <section><h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Not known</h3><ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">{open.gaps.map((x) => <li key={x}>{x}</li>)}</ul></section>}
                <section>
                  <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">How it scored (the engine&apos;s points)</h3>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">{open.factors.map((f) => (<div key={f.key} className="contents"><dt>{f.label}</dt><dd className="font-mono text-right">{f.points}</dd></div>))}</dl>
                </section>
                {open.verdict && <p className="text-muted-foreground">Your verdict: {VERDICT_LABEL[open.verdict]}{open.excluded ? " (never suggested again)" : ""}</p>}
                {open.excluded && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await post("/api/lp/matching/feedback", { kind: open.kind, matchId: open.id, undoExclusion: true }); setOpen(null); return "They can be suggested again." })}>Suggest again</Button>}
                <section className="space-y-2 border-t border-foreground/10 pt-4">
                  <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Your verdict</h3>
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 px-2 border border-foreground/10 rounded-md bg-background w-full" aria-label="Reason">{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Never suggest again</label>
                  <div className="flex flex-wrap gap-2">
                    {["fit", "not_a_fit", "already_known", "wrong_data"].map((v) => <Button key={v} size="sm" variant="outline" disabled={busy} onClick={() => judge([open.id], v)}>{VERDICT_LABEL[v]}</Button>)}
                  </div>
                </section>
                <div className="flex flex-wrap gap-2 border-t border-foreground/10 pt-4">
                  <Button size="sm" disabled={busy} onClick={() => addToCrm([open.id])}>Add to CRM</Button>
                  {open.kind === "contact" && <Button size="sm" variant="outline" disabled={busy} onClick={() => draft([open.id])}>Draft an intro</Button>}
                </div>
                {notice && <p role="status" className="text-muted-foreground">{notice}</p>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
