"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, ChevronRight, Loader2, Search, HelpCircle } from "lucide-react"

const COBALT = "#2f45e0"

export type WizardLp = {
  id: string
  name: string
  lpClass: string
  committed: number
  called: number
}

type ActivityType = "pro_rata" | "subsequent_close" | "bring_in_line"
type Step = "type" | "details" | "review"

const money = (v: number) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`)

const TYPES: { key: ActivityType; label: string; desc: string; common?: boolean }[] = [
  { key: "pro_rata", label: "Pro rata", desc: "Call an equal percentage of commitments across investors", common: true },
  { key: "subsequent_close", label: "Subsequent close", desc: "Welcome newly closed investors, or call capital for increased commitments" },
  { key: "bring_in_line", label: "Bring investors in line", desc: "Bring all investors to an equal percentage of their commitments" },
]

export function CapitalCallWizard({ fundName, lps }: { fundName: string; lps: WizardLp[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("type")
  const [type, setType] = useState<ActivityType>("pro_rata")

  // Activity details
  const [callFrom, setCallFrom] = useState<"all" | "some">("all")
  const [selected, setSelected] = useState<Set<string>>(new Set(lps.map((l) => l.id)))
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"amount" | "pct">("amount")
  const [amount, setAmount] = useState("")
  const [pct, setPct] = useState("")
  const [title, setTitle] = useState("Capital Call")
  const [purpose, setPurpose] = useState("")

  // Review / schedule
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
      return { ...l, contribution, postCall, postPct: l.committed > 0 ? postCall / l.committed : 0 }
    })
  }, [activeLps, mode, pct, totalToCall, selectedCommit])

  const uncalled = totalCommitted - lps.reduce((s, l) => s + l.called, 0)

  const checks = useMemo(() => [
    { ok: activeLps.length > 0, label: "At least one investor is selected to call from" },
    { ok: totalToCall > 0, label: "Capital call has a positive amount" },
    { ok: totalToCall <= uncalled + 1, label: "Amount does not exceed uncalled commitments" },
    { ok: activeLps.every((l) => l.committed > 0), label: "All participating partners have commitments on file" },
    { ok: !!title.trim(), label: "Capital activity has a title" },
    { ok: !!releaseDate, label: "A release date has been scheduled" },
  ], [activeLps, totalToCall, uncalled, title, releaseDate])
  const failed = checks.filter((c) => !c.ok)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? lps.filter((l) => l.name.toLowerCase().includes(q)) : lps
  }, [lps, search])

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
    { key: "review", label: "Review" },
  ]

  return (
    <div className="border border-foreground/12 rounded-2xl overflow-hidden">
      {/* Modal header */}
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-foreground/10">
        <div>
          <h1 className="text-lg font-semibold">Initiate Capital Activity</h1>
          <p className="text-sm text-muted-foreground">{fundName}</p>
        </div>
        <button onClick={() => router.push("/dashboard/portfolio/fund/calls")} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-foreground/5">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid lg:grid-cols-[200px_1fr]">
        {/* Step rail */}
        <aside className="border-b lg:border-b-0 lg:border-r border-foreground/10 p-6">
          <ol className="space-y-4">
            {STEPS.map((s, i) => {
              const active = s.key === step
              const done = STEPS.findIndex((x) => x.key === step) > i
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
        <div className="p-6 lg:p-8 min-h-[420px]">
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

                {/* Call from */}
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
                      <span className="w-4" />
                      <span className="flex-1">Investor</span>
                      <span className="w-28 text-right">Committed</span>
                      <span className="w-28 text-right">Called to date</span>
                    </div>
                    <ul className="max-h-[280px] overflow-y-auto divide-y divide-foreground/[0.06]">
                      {filtered.map((l) => (
                        <li key={l.id}>
                          <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                            <button type="button" onClick={(e) => { e.preventDefault(); setSelected((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n }) }}
                              className={`grid place-items-center w-4 h-4 rounded border shrink-0 ${selected.has(l.id) ? "bg-foreground border-foreground text-background" : "border-foreground/30"}`}>
                              {selected.has(l.id) ? <Check className="w-3 h-3" /> : null}
                            </button>
                            <span className="flex-1 text-sm truncate">{l.name}</span>
                            <span className="w-28 text-right text-sm tabular-nums">{money(l.committed)}</span>
                            <span className="w-28 text-right text-sm tabular-nums text-muted-foreground">{money(l.called)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Amount */}
                <label className="block text-sm font-medium mb-1.5">Capital to be called <span className="text-rose-500">*</span></label>
                <div className="flex gap-4 mb-3">
                  {(["amount", "pct"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                      <span className={`grid place-items-center w-4 h-4 rounded-full border ${mode === k ? "border-foreground" : "border-foreground/30"}`}>
                        {mode === k ? <span className="w-2 h-2 rounded-full bg-foreground" /> : null}
                      </span>
                      <input type="radio" className="sr-only" checked={mode === k} onChange={() => setMode(k)} />
                      {k === "amount" ? "Dollar amount" : "Percent of total commitments"}
                    </label>
                  ))}
                </div>
                {mode === "amount" ? (
                  <div>
                    <div className="flex items-center rounded-lg border border-foreground/15 overflow-hidden max-w-xs">
                      <span className="px-3 py-2 bg-foreground/[0.04] text-muted-foreground text-sm">$</span>
                      <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0"
                        className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent tabular-nums" />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{money(totalToCall)} to be called of {money(uncalled)} available</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center rounded-lg border border-foreground/15 overflow-hidden max-w-xs">
                      <input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0"
                        className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent tabular-nums" />
                      <span className="px-3 py-2 bg-foreground/[0.04] text-muted-foreground text-sm">%</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{money(totalToCall)} across {activeLps.length} investor{activeLps.length === 1 ? "" : "s"}</p>
                  </div>
                )}

                <div className="mt-5 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Title</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Capital call purpose <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2}
                      placeholder="We are calling capital based on the LPA for investments and expenses."
                      className="w-full rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 resize-none" />
                  </div>
                </div>
              </div>

              {/* Capital summary sidebar */}
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
          ) : (
            /* Review */
            <div>
              <h2 className="text-base font-semibold mb-1">Let&apos;s review what you have</h2>
              <p className="text-sm text-muted-foreground mb-6">Ensure the following information is correct, then schedule and submit.</p>

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
                      {c.ok
                        ? <Check className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        : <X className="w-4 h-4 mt-0.5 text-rose-600 dark:text-rose-400 shrink-0" />}
                      <span className={c.ok ? "" : "text-foreground"}>{c.label}</span>
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
                      <th className="text-left px-4 py-2.5 hidden sm:table-cell">Partner Class</th>
                      <th className="text-right px-4 py-2.5">Contribution</th>
                      <th className="text-right px-4 py-2.5 hidden md:table-cell">Total Due to Fund</th>
                      <th className="text-right px-4 py-2.5">Post Call</th>
                      <th className="text-right px-4 py-2.5">Post Call %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.map((a) => (
                      <tr key={a.id} className="border-b border-foreground/[0.06] last:border-0">
                        <td className="px-4 py-2.5 font-medium">{a.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{a.lpClass}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{money(a.contribution)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">{money(a.contribution)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{money(a.postCall)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{(a.postPct * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-foreground/10 font-medium">
                      <td className="px-4 py-2.5" colSpan={2}>Total</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(totalToCall)}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell" />
                      <td className="px-4 py-2.5" />
                      <td className="px-4 py-2.5" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Schedule for release */}
              <div className="rounded-xl border border-foreground/10 p-5">
                <h3 className="text-sm font-semibold mb-1">Schedule Capital Activity for Release</h3>
                <p className="text-sm text-muted-foreground mb-4">Specify a date and time to release this capital activity.</p>
                <div className="flex flex-wrap items-center gap-8">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Release date <span className="text-rose-500">*</span></label>
                    <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)}
                      className="rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Release time window <span className="text-rose-500">*</span></label>
                    <div className="flex flex-col gap-2">
                      {([["am", "9:00AM – 10:00AM"], ["pm", "4:00PM – 5:00PM"]] as const).map(([k, lbl]) => (
                        <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                          <span className={`grid place-items-center w-4 h-4 rounded-full border ${timeWindow === k ? "border-foreground" : "border-foreground/30"}`}>
                            {timeWindow === k ? <span className="w-2 h-2 rounded-full bg-foreground" /> : null}
                          </span>
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
        <button
          onClick={() => setStep(step === "review" ? "details" : step === "details" ? "type" : "type")}
          disabled={step === "type"}
          className="rounded-lg border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/[0.04] disabled:opacity-40"
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          {step === "review" ? (
            <>
              <button onClick={() => submit("draft")} disabled={busy} className="rounded-lg border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/[0.04] disabled:opacity-50">
                Save as draft
              </button>
              <button onClick={() => submit("sent")} disabled={busy || failed.length > 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-40">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit
              </button>
            </>
          ) : (
            <button
              onClick={() => setStep(step === "type" ? "details" : "review")}
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
