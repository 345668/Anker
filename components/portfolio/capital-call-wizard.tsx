"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, ChevronRight, Loader2, Search, FileText, Mail, ArrowLeft, ArrowRight } from "lucide-react"

export type WizardLp = {
  id: string
  name: string
  lpClass: string
  committed: number
  called: number
}

type ActivityType = "pro_rata" | "subsequent_close" | "bring_in_line"
type Step = "type" | "details" | "breakdown" | "review"
type NoticePref = "both" | "email" | "pdf"

const money = (v: number) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`)

const TYPES: { key: ActivityType; label: string; desc: string; common?: boolean }[] = [
  { key: "pro_rata", label: "Pro rata", desc: "Call an equal percentage of commitments across investors", common: true },
  { key: "subsequent_close", label: "Subsequent close", desc: "Welcome newly closed investors, or call capital for increased commitments" },
  { key: "bring_in_line", label: "Bring investors in line", desc: "Bring all investors to an equal percentage of their commitments" },
]

const BUCKETS = [
  { key: "investments", label: "Investments" },
  { key: "mgmt_fees", label: "Management fees" },
  { key: "expenses", label: "Fund expenses" },
  { key: "other", label: "Other" },
] as const
type BucketKey = (typeof BUCKETS)[number]["key"]

const PREF_LABEL: Record<NoticePref, string> = { both: "PDF & Email", email: "Email only", pdf: "PDF only" }
const nextPref = (p: NoticePref): NoticePref => (p === "both" ? "email" : p === "email" ? "pdf" : "both")

export function CapitalCallWizard({ fundName, lps }: { fundName: string; lps: WizardLp[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("type")
  const [type, setType] = useState<ActivityType>("pro_rata")

  // Details / amounts
  const [callFrom, setCallFrom] = useState<"all" | "some">("all")
  const [selected, setSelected] = useState<Set<string>>(new Set(lps.map((l) => l.id)))
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"amount" | "pct">("amount")
  const [amount, setAmount] = useState("")
  const [pct, setPct] = useState("")
  const [title, setTitle] = useState("Capital Call")
  const [purpose, setPurpose] = useState("")
  const [includeOutstanding, setIncludeOutstanding] = useState(false)
  const [coverWireFees, setCoverWireFees] = useState(false)

  // Net amount breakdown (buckets)
  const [buckets, setBuckets] = useState<Record<BucketKey, string>>({ investments: "", mgmt_fees: "", expenses: "", other: "" })

  // Review
  const [prefs, setPrefs] = useState<Map<string, NoticePref>>(new Map())
  const [noticeIdx, setNoticeIdx] = useState(0)
  const [releaseDate, setReleaseDate] = useState("")
  const [timeWindow, setTimeWindow] = useState<"am" | "pm">("am")
  const [busy, setBusy] = useState(false)

  const activeLps = useMemo(() => (callFrom === "all" ? lps : lps.filter((l) => selected.has(l.id))), [lps, callFrom, selected])
  const totalCommitted = useMemo(() => lps.reduce((s, l) => s + l.committed, 0), [lps])
  const selectedCommit = useMemo(() => activeLps.reduce((s, l) => s + l.committed, 0), [activeLps])

  const totalToCall = useMemo(() => {
    if (mode === "amount") return Number(amount) || 0
    const p = (Number(pct) || 0) / 100
    return activeLps.reduce((s, l) => s + l.committed * p, 0)
  }, [mode, amount, pct, activeLps])

  const allocation = useMemo(() => {
    const p = (Number(pct) || 0) / 100
    return activeLps.map((l) => {
      const contribution = mode === "pct"
        ? l.committed * p
        : selectedCommit > 0 ? totalToCall * (l.committed / selectedCommit) : 0
      const postCall = l.called + contribution
      return { ...l, contribution, postCall, postPct: l.committed > 0 ? postCall / l.committed : 0, remaining: Math.max(0, l.committed - postCall) }
    })
  }, [activeLps, mode, pct, totalToCall, selectedCommit])

  const uncalled = totalCommitted - lps.reduce((s, l) => s + l.called, 0)
  const bucketSum = useMemo(() => BUCKETS.reduce((s, b) => s + (Number(buckets[b.key]) || 0), 0), [buckets])
  const prefOf = (id: string): NoticePref => prefs.get(id) ?? "both"

  const checks = useMemo(() => [
    { ok: activeLps.length > 0, label: "At least one investor is selected to call from" },
    { ok: totalToCall > 0, label: "Capital call has a positive amount" },
    { ok: totalToCall <= uncalled + 1, label: "Amount does not exceed uncalled commitments" },
    { ok: Math.abs(bucketSum - totalToCall) < 1, label: "Net amount breakdown reconciles to the call total" },
    { ok: activeLps.every((l) => l.committed > 0), label: "All participating partners have commitments on file" },
    { ok: !!title.trim(), label: "Capital activity has a title" },
    { ok: !!releaseDate, label: "A release date has been scheduled" },
  ], [activeLps, totalToCall, uncalled, bucketSum, title, releaseDate])
  const failed = checks.filter((c) => !c.ok)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? lps.filter((l) => l.name.toLowerCase().includes(q)) : lps
  }, [lps, search])

  const noticeLp = allocation[noticeIdx] ?? null

  function autofillInvestments() {
    setBuckets((b) => {
      const others = (Number(b.mgmt_fees) || 0) + (Number(b.expenses) || 0) + (Number(b.other) || 0)
      return { ...b, investments: String(Math.max(0, Math.round((totalToCall - others) * 100) / 100)) }
    })
  }

  async function submit(status: "draft" | "sent") {
    setBusy(true)
    try {
      const res = await fetch("/api/portfolio/calls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title, purpose, dueDate: releaseDate || null, activityType: type,
          mode, pct: (Number(pct) || 0) / 100, totalAmount: Number(amount) || 0,
          lpIds: activeLps.map((l) => l.id), status,
        }),
      })
      if (res.ok) router.push("/dashboard/portfolio/fund/calls")
      else setBusy(false)
    } catch { setBusy(false) }
  }

  const STEPS: { key: Step; label: string }[] = [
    { key: "type", label: "Activity Details" },
    { key: "details", label: "Set Amounts" },
    { key: "breakdown", label: "Net Amount Breakdown" },
    { key: "review", label: "Review" },
  ]
  const stepIdx = STEPS.findIndex((s) => s.key === step)
  const goNext = () => setStep(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)].key)
  const goBack = () => setStep(STEPS[Math.max(0, stepIdx - 1)].key)

  return (
    <div className="border border-foreground/12 rounded-2xl overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-foreground/10">
        <div>
          <h1 className="text-lg font-semibold">Initiate Capital Activity</h1>
          <p className="text-sm text-muted-foreground">{fundName}</p>
        </div>
        <button onClick={() => router.push("/dashboard/portfolio/fund/calls")} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-foreground/5">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr]">
        {/* Step rail */}
        <aside className="border-b lg:border-b-0 lg:border-r border-foreground/10 p-6">
          <ol className="space-y-4">
            {STEPS.map((s, i) => {
              const active = s.key === step
              const done = stepIdx > i
              return (
                <li key={s.key} className="flex items-center gap-3">
                  <span className={`grid place-items-center w-5 h-5 rounded-full text-[10px] font-medium shrink-0 ${active ? "bg-[#2f45e0] text-white" : done ? "bg-emerald-500 text-white" : "border border-foreground/25 text-muted-foreground"}`}>
                    {done ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span className={`text-sm ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s.label}</span>
                </li>
              )
            })}
          </ol>
        </aside>

        {/* Body */}
        <div className="p-6 lg:p-8 min-h-[440px]">
          {step === "type" ? (
            <div>
              <h2 className="text-xl font-semibold mb-6">What type of capital activity do you need?</h2>
              <div className="grid sm:grid-cols-3 gap-4">
                {TYPES.map((t) => {
                  const on = type === t.key
                  return (
                    <button key={t.key} onClick={() => setType(t.key)}
                      className={`text-left rounded-xl border p-5 transition-colors ${on ? "border-[#2f45e0] ring-1 ring-[#2f45e0]" : "border-foreground/15 hover:border-foreground/35"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium">{t.label}</span>
                        {t.common ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#2f45e0]/10 text-[#2f45e0]">Most common</span> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{t.desc}</p>
                      <span className={`mt-4 grid place-items-center w-5 h-5 rounded-full border ${on ? "border-[#2f45e0]" : "border-foreground/25"}`}>
                        {on ? <span className="w-2.5 h-2.5 rounded-full bg-[#2f45e0]" /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : step === "details" ? (
            <div className="grid lg:grid-cols-[1fr_260px] gap-8">
              <div>
                <h2 className="text-base font-semibold mb-1">Capital Call Details</h2>
                <p className="text-sm text-muted-foreground mb-5">Choose who to call from and how much.</p>

                <label className="block text-sm font-medium mb-1.5">Call from <span className="text-rose-500">*</span></label>
                <div className="flex gap-2 mb-4">
                  {(["all", "some"] as const).map((k) => (
                    <button key={k} onClick={() => setCallFrom(k)}
                      className={`rounded-lg border px-3.5 py-2 text-sm ${callFrom === k ? "border-foreground bg-foreground/[0.04]" : "border-foreground/15 hover:border-foreground/35"}`}>
                      {k === "all" ? "All investors" : "Some investors"}
                    </button>
                  ))}
                </div>

                {callFrom === "some" ? (
                  <div className="border border-foreground/10 rounded-xl mb-5">
                    <div className="p-2 border-b border-foreground/10 relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Enter investor name"
                        className="w-full rounded-lg bg-transparent pl-9 pr-3 py-1.5 text-sm focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-foreground/10">
                      <span className="w-4" /><span className="flex-1">Investor</span><span className="w-28 text-right">Committed</span><span className="w-28 text-right">Called to date</span>
                    </div>
                    <ul className="max-h-[260px] overflow-y-auto divide-y divide-foreground/[0.06]">
                      {filtered.map((l) => (
                        <li key={l.id}>
                          <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                            <Checkbox on={selected.has(l.id)} onClick={() => setSelected((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })} />
                            <span className="flex-1 text-sm truncate">{l.name}</span>
                            <span className="w-28 text-right text-sm tabular-nums">{money(l.committed)}</span>
                            <span className="w-28 text-right text-sm tabular-nums text-muted-foreground">{money(l.called)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <label className="block text-sm font-medium mb-1.5">Capital to be called <span className="text-rose-500">*</span></label>
                <div className="flex gap-4 mb-3">
                  {(["amount", "pct"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Radio on={mode === k} />
                      <input type="radio" className="sr-only" checked={mode === k} onChange={() => setMode(k)} />
                      {k === "amount" ? "Dollar amount" : "Percent of total commitments"}
                    </label>
                  ))}
                </div>
                {mode === "amount" ? (
                  <div>
                    <div className="flex items-center rounded-lg border border-foreground/15 overflow-hidden max-w-xs">
                      <span className="px-3 py-2 bg-foreground/[0.04] text-muted-foreground text-sm">$</span>
                      <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent tabular-nums" />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{money(totalToCall)} to be called of {money(uncalled)} available</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center rounded-lg border border-foreground/15 overflow-hidden max-w-xs">
                      <input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent tabular-nums" />
                      <span className="px-3 py-2 bg-foreground/[0.04] text-muted-foreground text-sm">%</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{money(totalToCall)} across {activeLps.length} investor{activeLps.length === 1 ? "" : "s"}</p>
                  </div>
                )}

                <div className="mt-4 space-y-2.5">
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <Checkbox on={includeOutstanding} onClick={() => setIncludeOutstanding((v) => !v)} />
                    Include outstanding capital call balance
                  </label>
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <Checkbox on={coverWireFees} onClick={() => setCoverWireFees((v) => !v)} />
                    Cover investor wire fees (up to $50.00)
                  </label>
                </div>

                <div className="mt-5 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Title</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Capital call purpose <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} placeholder="We are calling capital based on the LPA for investments and expenses." className="w-full rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 resize-none" />
                  </div>
                </div>
              </div>

              <aside className="rounded-xl border border-foreground/10 p-5 h-fit">
                <h3 className="text-sm font-semibold mb-4">Capital summary</h3>
                <div className="space-y-4 text-sm">
                  <Summary label="Total commitments" value={money(totalCommitted)} dotless />
                  <Summary label="Previously called" value={money(lps.reduce((s, l) => s + l.called, 0))} dot="#2f45e0" />
                  <Summary label="Amount to be called" value={money(totalToCall)} dot="#10b981" />
                  <Summary label="Left to call" value={money(Math.max(0, uncalled - totalToCall))} dot="#94a3b8" />
                </div>
              </aside>
            </div>
          ) : step === "breakdown" ? (
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold mb-1">Net Amount Breakdown</h2>
              <p className="text-sm text-muted-foreground mb-6">Allocate the {money(totalToCall)} call across purpose categories. Amounts must reconcile to the total.</p>

              <div className="space-y-3 mb-4">
                {BUCKETS.map((b) => (
                  <div key={b.key} className="flex items-center justify-between gap-4">
                    <label className="text-sm font-medium">{b.label}</label>
                    <div className="flex items-center rounded-lg border border-foreground/15 overflow-hidden w-48">
                      <span className="px-3 py-2 bg-foreground/[0.04] text-muted-foreground text-sm">$</span>
                      <input value={buckets[b.key]} onChange={(e) => setBuckets((s) => ({ ...s, [b.key]: e.target.value.replace(/[^0-9.]/g, "") }))} inputMode="decimal" placeholder="0" className="flex-1 px-3 py-2 text-sm text-right focus:outline-none bg-transparent tabular-nums" />
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={autofillInvestments} className="text-sm text-[#2f45e0] hover:underline mb-6">Auto-fill Investments with remainder</button>

              <div className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${Math.abs(bucketSum - totalToCall) < 1 ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-amber-500/30 bg-amber-500/[0.06]"}`}>
                <span className="font-medium">Allocated {money(bucketSum)} of {money(totalToCall)}</span>
                <span className={Math.abs(bucketSum - totalToCall) < 1 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {Math.abs(bucketSum - totalToCall) < 1 ? "Reconciled" : `${money(Math.abs(totalToCall - bucketSum))} ${bucketSum > totalToCall ? "over" : "remaining"}`}
                </span>
              </div>
            </div>
          ) : (
            /* Review */
            <div>
              <h2 className="text-base font-semibold mb-1">Let&apos;s review what you have</h2>
              <p className="text-sm text-muted-foreground mb-6">Confirm the details, set notice preferences, and schedule for release.</p>

              {/* Health checks */}
              <div className="rounded-xl border border-foreground/10 p-5 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  {failed.length === 0
                    ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Check className="w-4 h-4" /> All health checks passed</span>
                    : <span className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 dark:text-rose-400"><X className="w-4 h-4" /> {failed.length} health check{failed.length === 1 ? "" : "s"} failed</span>}
                </div>
                <ul className="space-y-2">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-sm">
                      {c.ok ? <Check className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <X className="w-4 h-4 mt-0.5 text-rose-600 dark:text-rose-400 shrink-0" />}
                      <span>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Amounts & preferences */}
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">Amounts and preferences</div>
              <div className="overflow-x-auto border border-foreground/10 rounded-xl mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-4 py-2.5">Investor</th>
                      <th className="text-left px-4 py-2.5">Notice</th>
                      <th className="text-left px-4 py-2.5 hidden sm:table-cell">Partner Class</th>
                      <th className="text-right px-4 py-2.5">Contribution</th>
                      <th className="text-right px-4 py-2.5">Post Call</th>
                      <th className="text-right px-4 py-2.5">Post Call %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.map((a) => (
                      <tr key={a.id} className="border-b border-foreground/[0.06] last:border-0">
                        <td className="px-4 py-2.5 font-medium">{a.name}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => setPrefs((m) => new Map(m).set(a.id, nextPref(prefOf(a.id))))}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20">
                            {prefOf(a.id) === "email" ? <Mail className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                            {PREF_LABEL[prefOf(a.id)]}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{a.lpClass}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{money(a.contribution)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{money(a.postCall)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{(a.postPct * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-foreground/10 font-medium">
                      <td className="px-4 py-2.5" colSpan={3}>Total</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(totalToCall)}</td>
                      <td className="px-4 py-2.5" /><td className="px-4 py-2.5" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Auto-generated notice preview */}
              {noticeLp ? (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Auto-generated notice</div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setNoticeIdx((i) => Math.max(0, i - 1))} disabled={noticeIdx === 0} className="inline-flex items-center gap-1 rounded-lg border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/[0.04] disabled:opacity-40"><ArrowLeft className="w-3.5 h-3.5" /> Prev</button>
                      <span className="text-xs text-muted-foreground tabular-nums">{noticeIdx + 1} of {allocation.length}</span>
                      <button onClick={() => setNoticeIdx((i) => Math.min(allocation.length - 1, i + 1))} disabled={noticeIdx >= allocation.length - 1} className="inline-flex items-center gap-1 rounded-lg border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/[0.04] disabled:opacity-40">Next <ArrowRight className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <NoticeDoc fundName={fundName} purpose={purpose} noticeDate={new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    dueDate={releaseDate ? new Date(releaseDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"} lp={noticeLp} />
                </div>
              ) : null}

              {/* Schedule for release */}
              <div className="rounded-xl border border-foreground/10 p-5">
                <h3 className="text-sm font-semibold mb-1">Schedule Capital Activity for Release</h3>
                <p className="text-sm text-muted-foreground mb-4">Specify a date and time to release this capital activity.</p>
                <div className="flex flex-wrap items-center gap-8">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Release date <span className="text-rose-500">*</span></label>
                    <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Release time window <span className="text-rose-500">*</span></label>
                    <div className="flex flex-col gap-2">
                      {([["am", "9:00AM – 10:00AM"], ["pm", "4:00PM – 5:00PM"]] as const).map(([k, lbl]) => (
                        <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Radio on={timeWindow === k} />
                          <input type="radio" className="sr-only" checked={timeWindow === k} onChange={() => setTimeWindow(k)} /> {lbl}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-foreground/10">
        <button onClick={goBack} disabled={step === "type"} className="rounded-lg border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/[0.04] disabled:opacity-40">Back</button>
        <div className="flex items-center gap-2">
          {step === "review" ? (
            <>
              <button onClick={() => submit("draft")} disabled={busy} className="rounded-lg border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/[0.04] disabled:opacity-50">Save as draft</button>
              <button onClick={() => submit("sent")} disabled={busy || failed.length > 0} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-40">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit
              </button>
            </>
          ) : (
            <button
              onClick={() => { if (step === "details") autofillInvestments(); goNext() }}
              disabled={step === "details" && totalToCall <= 0}
              className="inline-flex items-center gap-1 rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-40"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Carta-style Capital Call Notice document. */
function NoticeDoc({ fundName, purpose, noticeDate, dueDate, lp }: {
  fundName: string; purpose: string; noticeDate: string; dueDate: string
  lp: { name: string; committed: number; contribution: number; postCall: number; remaining: number }
}) {
  return (
    <div className="border border-foreground/12 rounded-xl bg-background p-6 lg:p-8 max-w-2xl">
      <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-foreground/80">
        <div>
          <h4 className="text-lg font-serif tracking-tight">{fundName}</h4>
          <p className="text-sm text-muted-foreground">Capital Call Notice</p>
        </div>
        <span className="inline-flex items-center rounded border border-foreground/20 px-2.5 py-1 font-display font-semibold">Anker</span>
      </div>

      <h5 className="mt-5 mb-3 text-sm font-semibold">Details for {lp.name}</h5>
      <dl className="space-y-1.5 text-sm">
        <Row k="Initiated by" v={fundName} />
        <Row k="Date of notice" v={noticeDate} />
        <Row k="Due date" v={dueDate} />
      </dl>

      <h5 className="mt-5 mb-2 text-sm font-semibold border-b border-foreground/10 pb-1">Capital Call details</h5>
      <dl className="space-y-1.5 text-sm">
        <Row k="Contribution" v={money(lp.contribution)} />
        <Row k="Amount due to fund" v={money(lp.contribution)} bold />
      </dl>

      <h5 className="mt-5 mb-2 text-sm font-semibold border-b border-foreground/10 pb-1">Commitment summary</h5>
      <dl className="space-y-1.5 text-sm">
        <Row k="Commitment" v={money(lp.committed)} />
        <Row k="Called capital (post call)" v={money(lp.postCall)} />
        <Row k="Remaining uncalled commitment (post call)" v={money(lp.remaining)} />
      </dl>

      {purpose ? (
        <div className="mt-5">
          <h5 className="text-sm font-semibold mb-1">Capital call purpose</h5>
          <p className="text-sm text-muted-foreground leading-relaxed">{purpose}</p>
        </div>
      ) : null}

      <div className="mt-6 pt-3 border-t border-foreground/10 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center rounded border border-foreground/15 px-1.5 py-0.5 font-display font-semibold">Anker</span>
        <span className="font-mono uppercase tracking-wider">Confidential</span>
      </div>
    </div>
  )
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={`text-muted-foreground ${bold ? "font-semibold text-foreground" : ""}`}>{k}</dt>
      <dd className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{v}</dd>
    </div>
  )
}

function Summary({ label, value, dot, dotless }: { label: string; value: string; dot?: string; dotless?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {dotless ? null : <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot ?? "#94a3b8" }} />}
        {label}
      </div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
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

function Radio({ on }: { on: boolean }) {
  return (
    <span className={`grid place-items-center w-4 h-4 rounded-full border shrink-0 ${on ? "border-foreground" : "border-foreground/30"}`}>
      {on ? <span className="w-2 h-2 rounded-full bg-foreground" /> : null}
    </span>
  )
}
