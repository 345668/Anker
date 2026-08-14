"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, ChevronRight, Loader2 } from "lucide-react"

export type DistWizardLp = {
  id: string
  name: string
  lpClass: string
  ownershipPct: number
  distributed: number
}

type DistType = "return_of_capital" | "realized_gain" | "dividend" | "recallable"
type Step = "type" | "amounts" | "review"

const money = (v: number) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`)

const TYPES: { key: DistType; label: string; desc: string; common?: boolean }[] = [
  { key: "realized_gain", label: "Realized gain", desc: "Distribute proceeds from a realized investment (exit / secondary)", common: true },
  { key: "return_of_capital", label: "Return of capital", desc: "Return called capital to LPs" },
  { key: "dividend", label: "Dividend / income", desc: "Pass through portfolio dividends or interest income" },
  { key: "recallable", label: "Recallable", desc: "Distribution the fund may recall under the LPA" },
]

export function DistributionWizard({ fundName, lps }: { fundName: string; lps: DistWizardLp[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("type")
  const [type, setType] = useState<DistType>("realized_gain")
  const [source, setSource] = useState("")
  const [title, setTitle] = useState("Distribution")
  const [gross, setGross] = useState("")
  const [mgmt, setMgmt] = useState("")
  const [carry, setCarry] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [busy, setBusy] = useState(false)

  const grossN = Number(gross) || 0
  const mgmtN = Number(mgmt) || 0
  const carryN = Number(carry) || 0
  const net = Math.max(0, grossN - mgmtN - carryN)

  const allocation = useMemo(() =>
    lps.map((l) => {
      const share = l.ownershipPct * net
      return { ...l, share, postDistributed: l.distributed + share }
    }), [lps, net])

  const ownershipSum = useMemo(() => lps.reduce((s, l) => s + l.ownershipPct, 0), [lps])

  const checks = useMemo(() => [
    { ok: grossN > 0, label: "Distribution has a positive gross amount" },
    { ok: net > 0, label: "Net amount is positive after deductions" },
    { ok: mgmtN + carryN <= grossN, label: "Deductions do not exceed the gross amount" },
    { ok: Math.abs(ownershipSum - 1) < 0.02 || lps.length > 0, label: "Fund has limited partners with ownership on file" },
    { ok: !!title.trim(), label: "Distribution has a title" },
    { ok: !!paymentDate, label: "A payment date has been set" },
  ], [grossN, net, mgmtN, carryN, ownershipSum, lps.length, title, paymentDate])
  const failed = checks.filter((c) => !c.ok)

  async function submit(status: "draft" | "notified") {
    setBusy(true)
    try {
      const res = await fetch("/api/portfolio/distributions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, source: source || null, distType: type, grossAmount: grossN, mgmtFee: mgmtN, carry: carryN, paymentDate: paymentDate || null, status }),
      })
      if (res.ok) router.push("/dashboard/portfolio/fund/distributions")
      else setBusy(false)
    } catch { setBusy(false) }
  }

  const STEPS: { key: Step; label: string }[] = [
    { key: "type", label: "Distribution Details" },
    { key: "amounts", label: "Set Amounts" },
    { key: "review", label: "Review" },
  ]
  const stepIdx = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="border border-foreground/12 rounded-2xl overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-foreground/10">
        <div>
          <h1 className="text-lg font-semibold">Initiate Distribution</h1>
          <p className="text-sm text-muted-foreground">{fundName}</p>
        </div>
        <button onClick={() => router.push("/dashboard/portfolio/fund/distributions")} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-foreground/5">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid lg:grid-cols-[200px_1fr]">
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

        <div className="p-6 lg:p-8 min-h-[420px]">
          {step === "type" ? (
            <div>
              <h2 className="text-xl font-semibold mb-6">What type of distribution do you need?</h2>
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
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
                    </button>
                  )
                })}
              </div>
              <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Source <span className="text-muted-foreground font-normal">(company / event)</span></label>
                  <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Acme Labs — Series A secondary" className="w-full rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
                </div>
              </div>
            </div>
          ) : step === "amounts" ? (
            <div className="grid lg:grid-cols-[1fr_260px] gap-8">
              <div className="max-w-md">
                <h2 className="text-base font-semibold mb-1">Distribution amounts</h2>
                <p className="text-sm text-muted-foreground mb-5">Enter gross proceeds and any GP deductions. Net is distributed pro-rata by ownership.</p>
                {([["Gross amount", gross, setGross, false], ["Management fee deduction", mgmt, setMgmt, true], ["Carried interest deduction", carry, setCarry, true]] as const).map(([label, val, setter, optional]) => (
                  <div key={label} className="mb-4">
                    <label className="block text-sm font-medium mb-1.5">{label} {optional ? <span className="text-muted-foreground font-normal">(optional)</span> : <span className="text-rose-500">*</span>}</label>
                    <div className="flex items-center rounded-lg border border-foreground/15 overflow-hidden max-w-xs">
                      <span className="px-3 py-2 bg-foreground/[0.04] text-muted-foreground text-sm">$</span>
                      <input value={val} onChange={(e) => setter(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent tabular-nums" />
                    </div>
                  </div>
                ))}
                <div className="mb-2">
                  <label className="block text-sm font-medium mb-1.5">Payment date <span className="text-rose-500">*</span></label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
                </div>
              </div>
              <aside className="rounded-xl border border-foreground/10 p-5 h-fit">
                <h3 className="text-sm font-semibold mb-4">Distribution summary</h3>
                <div className="space-y-4 text-sm">
                  <Summary label="Gross proceeds" value={money(grossN)} dotless />
                  <Summary label="Management fee" value={`− ${money(mgmtN)}`} dot="#f59e0b" />
                  <Summary label="Carried interest" value={`− ${money(carryN)}`} dot="#8b5cf6" />
                  <div className="pt-3 border-t border-foreground/10">
                    <Summary label="Net to LPs" value={money(net)} dot="#10b981" />
                  </div>
                </div>
              </aside>
            </div>
          ) : (
            <div>
              <h2 className="text-base font-semibold mb-1">Let&apos;s review what you have</h2>
              <p className="text-sm text-muted-foreground mb-6">Confirm the per-LP breakdown, then schedule and submit.</p>

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

              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">Per-LP allocation</div>
              <div className="overflow-x-auto border border-foreground/10 rounded-xl mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-4 py-2.5">Investor</th>
                      <th className="text-left px-4 py-2.5 hidden sm:table-cell">Partner Class</th>
                      <th className="text-right px-4 py-2.5">Ownership</th>
                      <th className="text-right px-4 py-2.5">This distribution</th>
                      <th className="text-right px-4 py-2.5">Distributed to date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.map((a) => (
                      <tr key={a.id} className="border-b border-foreground/[0.06] last:border-0">
                        <td className="px-4 py-2.5 font-medium">{a.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{a.lpClass}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{(a.ownershipPct * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(a.share)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{money(a.postDistributed)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-foreground/10 font-medium">
                      <td className="px-4 py-2.5" colSpan={3}>Net to LPs</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(net)}</td>
                      <td className="px-4 py-2.5" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="rounded-xl border border-foreground/10 p-5">
                <h3 className="text-sm font-semibold mb-1">Payment</h3>
                <p className="text-sm text-muted-foreground mb-3">Wire date communicated to LPs on the distribution notice.</p>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-foreground/10">
        <button onClick={() => setStep(STEPS[Math.max(0, stepIdx - 1)].key)} disabled={step === "type"} className="rounded-lg border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/[0.04] disabled:opacity-40">Back</button>
        <div className="flex items-center gap-2">
          {step === "review" ? (
            <>
              <button onClick={() => submit("draft")} disabled={busy} className="rounded-lg border border-foreground/15 px-4 py-2 text-sm hover:bg-foreground/[0.04] disabled:opacity-50">Save as draft</button>
              <button onClick={() => submit("notified")} disabled={busy || failed.length > 0} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-40">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Notify LPs
              </button>
            </>
          ) : (
            <button onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)].key)} disabled={step === "amounts" && net <= 0}
              className="inline-flex items-center gap-1 rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-40">
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
