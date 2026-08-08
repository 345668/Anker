"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, ArrowLeft, Check } from "lucide-react"
import { ObShell, ACCENT, serif, AnchorSigil, type PersonaKey } from "./ob-shell"
import { AccentProvider } from "./fields"

export type WizardData = Record<string, any>

export type WizardStep = {
  key: string
  eyebrow: string
  title: string
  sub: string
  optional?: boolean
  valid?: (d: WizardData) => boolean
  render: (d: WizardData, set: (k: string, v: any) => void) => React.ReactNode
}

export function Wizard({ persona, steps, initial = {} }: { persona: PersonaKey; steps: WizardStep[]; initial?: WizardData }) {
  const router = useRouter()
  const accent = ACCENT[persona]
  const [idx, setIdx] = useState(0)
  const [data, setData] = useState<WizardData>(initial)
  const [done, setDone] = useState(false)

  const set = useCallback((k: string, v: any) => setData((d) => ({ ...d, [k]: v })), [])
  const total = steps.length + 1 // + "Choose path"
  const railLabels = ["Choose path", ...steps.map((s) => s.title)]
  const step = steps[idx]
  const canContinue = !step?.valid || step.valid(data)

  function persist(extra: WizardData) {
    fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_type: persona, step: idx + 1, ...extra }),
    }).catch(() => {})
  }
  function next() {
    persist({ data })
    if (idx < steps.length - 1) setIdx((i) => i + 1)
    else { persist({ completed: true, data }); setDone(true) }
  }
  function back() { if (idx === 0) router.push("/onboarding"); else setIdx((i) => i - 1) }
  function skip() { if (idx < steps.length - 1) setIdx((i) => i + 1); else { persist({ completed: true, data }); setDone(true) } }

  const preview = <PreviewCard persona={persona} data={data} accent={accent} />

  if (done) {
    return (
      <ObShell current={total} total={total} eyebrow="Done" title="You're all set" accent={accent} steps={railLabels} aside={preview}
        sub="Your workspace is ready — everything you entered is seeded inside.">
        <div className="rounded-xl border border-foreground/12 bg-foreground/[0.015] p-6">
          <div className="flex items-center gap-3 text-sm">
            <span className="grid place-items-center w-8 h-8 rounded-full text-white" style={{ backgroundColor: accent }}><Check className="w-4 h-4" /></span>
            Setup complete. You can finish any skipped steps from your dashboard checklist.
          </div>
          <button type="button" onClick={() => router.push("/dashboard")}
            className="mt-6 inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-px"
            style={{ backgroundColor: accent }}>
            Enter Anker <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </ObShell>
    )
  }

  return (
    <ObShell current={idx + 2} total={total} eyebrow={step.eyebrow} title={step.title} sub={step.sub} accent={accent} steps={railLabels} aside={preview}>
      <AccentProvider value={accent}>
        <div key={step.key} className="grid gap-5">
          {step.render(data, set)}
        </div>
        <div className="mt-9 pt-5 border-t border-foreground/10 flex items-center gap-4">
          <button type="button" onClick={back} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> {idx === 0 ? "Path" : "Back"}
          </button>
          <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{String(idx + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span>
          {step.optional ? (
            <button type="button" onClick={skip} className="ml-auto text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground underline underline-offset-4 hover:text-foreground">Skip for now</button>
          ) : <span className="ml-auto" />}
          <button type="button" onClick={next} disabled={!canContinue}
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium text-white transition-transform enabled:hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent }}>
            {idx === steps.length - 1 ? "Finish" : "Continue"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </AccentProvider>
    </ObShell>
  )
}

/** Live workspace preview — Carta's "metric card", fills as you type. */
function PreviewCard({ persona, data, accent }: { persona: PersonaKey; data: WizardData; accent: string }) {
  const name = (persona === "vc" ? data.firm : data.company) || (data.name ? `${data.name.split(" ")[0]}'s ${persona === "vc" ? "fund" : "company"}` : "Your workspace")
  const metrics: [string, string][] =
    persona === "vc"
      ? [["Vintage", data.vintage || "—"], ["Fund size", data.size || "—"], ["Check size", data.checkMin || data.checkMax ? `${data.checkMin || "—"}–${data.checkMax || "—"}` : "—"], ["Theses", (data.theses?.length ? String(data.theses.length) : "—")]]
      : [["Stage", data.stage || "—"], ["Raise", data.target || "—"], ["Instrument", data.instrument || "—"], ["Sectors", (data.sectors?.length ? String(data.sectors.length) : "—")]]

  return (
    <div className="rounded-xl border border-foreground/12 bg-foreground/[0.02] p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-md border border-foreground/15" style={{ color: accent }}>
          <span className="w-5 h-5"><AnchorSigil variant={persona} /></span>
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate" style={serif}>{name}</div>
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Updating live</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
        {metrics.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{k}</div>
            <div className="mt-0.5 text-sm font-medium truncate">{v}</div>
          </div>
        ))}
      </div>
      {data.name ? (
        <div className="mt-5 pt-4 border-t border-foreground/10 text-xs text-muted-foreground">
          <span className="text-foreground">{data.name}</span>{data.title ? ` · ${data.title}` : ""}
        </div>
      ) : null}
    </div>
  )
}
