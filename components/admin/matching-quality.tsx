"use client"

/**
 * LP scoring factors (docs/architecture/63 M6): where each stands, the owner's own labelled LPs, and what the labels say about each factor. A factor is promoted only when the
 * evaluation recommends it; promoting against it needs a written reason and is recorded.
 */
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Factor { key: string; label: string; description: string; status: string; weight: number; decidedBy: string | null; decidedAt: string | null; note: string | null; evidence: any }
interface Result { key: string; weight: number; status: string; coverage: number; auc: number; delta: number; ciLow: number; ciHigh: number; verdict: "promote" | "keep_shadow" | "retire"; reason: string }
interface Report { n: number; fit: number; notFit: number; bySource: { founder_set: number; feedback: number }; baselineAuc: number; factors: Result[]; combined: Result; blocked: string | null }
interface Evaluation { session: { id: string; fundName: string; createdAt: string } | null; labelled: number; inRun: number; withoutFactors: number; firms: Report | null; contacts: Report | null; error: string | null }
interface State {
  factors: Factor[]; guards: Record<string, number>
  workspace: { orgId: string; funds: Array<{ id: string; name: string }>; labels: { founder_set: number; feedback: number }; latestRun: { id: string; fundName: string; createdAt: string } | null } | null
  note?: string; evaluation?: Evaluation
}

const VERDICT: Record<string, string> = { promote: "Recommended", keep_shadow: "Keep measuring", retire: "Makes it worse" }
const pc = (v: number) => `${Math.round(v * 100)}%`
const sg = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(3)}`

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error || "That did not work.")
  return j
}

function ReportTable({ title, r }: { title: string; r: Report }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h3 className="font-display text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground">{r.n} labelled in the run ({r.fit} fit, {r.notFit} not a fit; {r.bySource.founder_set} from your list, {r.bySource.feedback} from verdicts in the app). Ranking by the base score alone: AUC {r.baselineAuc} (0.5 is a coin toss).</p>
      {r.blocked ? <p role="status" className="text-sm rounded-md bg-foreground/[0.04] p-3">{r.blocked}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground border-b border-foreground/10"><th className="py-2 pr-3">Factor</th><th className="pr-3">Known for</th><th className="pr-3">AUC</th><th className="pr-3">Change</th><th className="pr-3">95% interval</th><th>Verdict</th></tr></thead>
            <tbody>
              {[...r.factors, r.combined].map((f) => (
                <tr key={f.key} className="border-b border-foreground/5 align-top">
                  <td className="py-2 pr-3">{f.key === "all" ? "All together" : f.key.replace(/_/g, " ")}</td>
                  <td className="pr-3">{pc(f.coverage)}</td><td className="pr-3 font-mono">{f.auc}</td><td className="pr-3 font-mono">{sg(f.delta)}</td>
                  <td className="pr-3 font-mono">{sg(f.ciLow)} to {sg(f.ciHigh)}</td>
                  <td><span className={cn("font-medium", f.verdict === "promote" && "text-emerald-700", f.verdict === "retire" && "text-destructive")}>{VERDICT[f.verdict]}</span><span className="block text-xs text-muted-foreground">{f.reason}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function MatchingQuality() {
  const [st, setSt] = useState<State | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null)
  const [fund, setFund] = useState(""), [text, setText] = useState("")
  const [pending, setPending] = useState<{ key: string; status: string } | null>(null), [why, setWhy] = useState("")
  const load = useCallback(async () => {
    try { setSt(await call(`/api/admin/lp-scoring?report=1${fund ? `&fundProfileId=${encodeURIComponent(fund)}` : ""}`)); setErr(null) } catch (e: any) { setErr(e.message) }
  }, [fund])
  useEffect(() => { void load() }, [load])

  const act = async (body: unknown, done: (j: any) => string) => {
    setBusy(true); setMsg(null)
    try { const j = await call("/api/admin/lp-scoring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(body as object), fundProfileId: fund || undefined }) }); setMsg(done(j)); await load() }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  const verdictOf = (key: string) => st?.evaluation?.firms?.factors.find((f) => f.key === key)
  const decide = (key: string, status: string, override = false) => act({ action: "decide", key, status, note: why, override }, (j) => `${key.replace(/_/g, " ")} is now ${j.status}${j.overridden ? " (against the evaluation, recorded)" : ""}.`).then(() => { setPending(null); setWhy("") })

  if (err && !st) return <p role="alert" className="text-sm text-destructive">{err}</p>
  if (!st) return <p className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Loading</p>
  const ev = st.evaluation
  return (
    <div className="space-y-10">
      <section aria-label="Factors" className="space-y-3">
        <h2 className="font-display text-xl">The extra factors</h2>
        <p className="text-sm text-muted-foreground">Every match stores each factor&apos;s value, but only a promoted factor changes a score, by its weight times its value (at most {15} points in all). A factor is promoted after it has been measured against LPs you have labelled.</p>
        <ul className="space-y-3">
          {st.factors.map((f) => {
            const v = verdictOf(f.key)
            return (
              <li key={f.key} className="border border-foreground/10 rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div><span className="font-medium">{f.label}</span> <span className={cn("ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase", f.status === "promoted" ? "bg-emerald-500/10 text-emerald-700" : f.status === "retired" ? "bg-foreground/10" : "bg-amber-500/10 text-amber-700")}>{f.status === "shadow" ? "measuring" : f.status}</span></div>
                  <span className="font-mono text-xs text-muted-foreground">weight {f.weight}</span>
                </div>
                <p className="text-sm text-muted-foreground">{f.description}</p>
                {v && !ev?.firms?.blocked && <p className="text-xs">On your labelled firms: <strong>{VERDICT[v.verdict]}</strong>. {v.reason}</p>}
                {f.decidedAt && <p className="text-xs text-muted-foreground">Last decided by {f.decidedBy} on {new Date(f.decidedAt).toLocaleDateString()}{f.note ? `: ${f.note}` : ""}{f.evidence?.overridden ? " (against the evaluation)" : ""}.</p>}
                <div className="flex flex-wrap gap-2">
                  {f.status !== "promoted" && <Button size="sm" disabled={busy || v?.verdict !== "promote"} onClick={() => decide(f.key, "promoted")} title={v?.verdict === "promote" ? "" : "The evaluation does not recommend it yet"}>Promote</Button>}
                  {f.status !== "promoted" && v?.verdict !== "promote" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending({ key: f.key, status: "promoted" })}>Promote anyway…</Button>}
                  {f.status !== "shadow" && <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(f.key, "shadow")}>Back to measuring</Button>}
                  {f.status !== "retired" && <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(f.key, "retired")}>Retire</Button>}
                </div>
                {pending?.key === f.key && (
                  <div className="rounded-md bg-foreground/[0.04] p-3 space-y-2" role="group" aria-label="Promote against the evaluation">
                    <p className="text-sm">The evaluation does not recommend this. Say why you are promoting it anyway; the reason is kept with the decision.</p>
                    <textarea value={why} onChange={(e) => setWhy(e.target.value)} className="w-full h-16 p-2 text-sm border border-foreground/10 rounded-md bg-background" aria-label="Reason" />
                    <div className="flex gap-2"><Button size="sm" disabled={busy || why.trim().length < 10} onClick={() => decide(f.key, "promoted", true)}>Promote, recording the reason</Button><Button size="sm" variant="outline" onClick={() => { setPending(null); setWhy("") }}>Cancel</Button></div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {st.workspace ? (
        <>
          <section aria-label="Labelled LPs" className="space-y-3">
            <h2 className="font-display text-xl">Your labelled LPs</h2>
            <p className="text-sm text-muted-foreground">One per line: a name as it appears in your newest run (or a key such as <code>firm:123</code>), a comma, and <em>fit</em> or <em>not fit</em>. A fit is an LP you would approach for this fund. Verdicts you give on the Matchmaking page count too. Labels stay in your workspace and are never pooled with anyone else&apos;s.</p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {st.workspace.funds.length > 1 && <select value={fund} onChange={(e) => setFund(e.target.value)} className="h-8 px-2 border border-foreground/10 rounded-md bg-background" aria-label="Fund">{[{ id: "", name: "Newest run of any fund" }, ...st.workspace.funds].map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
              <span className="text-muted-foreground">{st.workspace.labels.founder_set} on your list · {st.workspace.labels.feedback} verdicts in the app · newest run: {st.workspace.latestRun ? `${st.workspace.latestRun.fundName}, ${new Date(st.workspace.latestRun.createdAt).toLocaleDateString()}` : "none"}</span>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"Alpha Family Office, fit\nBeta Trust, not fit"} className="w-full h-40 p-3 text-sm font-mono border border-foreground/10 rounded-md bg-background" aria-label="Labelled LPs" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !text.trim()} onClick={() => act({ action: "labels", text }, (j) => `Saved ${j.saved}.${j.unresolved.length ? ` Not found in the run: ${j.unresolved.slice(0, 6).join(", ")}${j.unresolved.length > 6 ? ", …" : ""}.` : ""}${j.ambiguous.length ? ` More than one match: ${j.ambiguous.join(", ")}.` : ""}${j.skipped.length ? ` Could not read ${j.skipped.length} line${j.skipped.length === 1 ? "" : "s"}.` : ""}`).then(() => setText(""))}>Save the list</Button>
              <Button size="sm" variant="outline" disabled={busy || !st.workspace.labels.founder_set} onClick={() => act({ action: "clear_labels" }, (j) => `Removed ${j.removed} labels.`)}>Remove my list</Button>
            </div>
          </section>
          <section aria-label="Evaluation" className="space-y-6">
            <h2 className="font-display text-xl">What the labels say</h2>
            {ev?.error ? <p role="status" className="text-sm rounded-md bg-foreground/[0.04] p-3">{ev.error}</p> : null}
            {ev && !ev.error && <p className="text-sm text-muted-foreground">{ev.labelled} labelled in all, {ev.inRun} of them in the newest run{ev.session ? ` (${ev.session.fundName}, ${new Date(ev.session.createdAt).toLocaleDateString()})` : ""}. A factor is recommended only when it adds at least {st.guards.minAucGain} to the AUC and its whole 95% interval is above zero; with {st.guards.minLabelled}+ labels, {st.guards.minFit}+ of each kind.</p>}
            {ev?.firms && <ReportTable title="Firms" r={ev.firms} />}
            {ev?.contacts && <ReportTable title="People" r={ev.contacts} />}
          </section>
        </>
      ) : <p className="text-sm rounded-md bg-foreground/[0.04] p-3">{st.note}</p>}
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    </div>
  )
}
