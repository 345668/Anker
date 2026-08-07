"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, ArrowLeft } from "lucide-react"
import { ObShell, ACCENT, type PersonaKey } from "./ob-shell"
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
  const total = steps.length
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
    if (idx < total - 1) setIdx((i) => i + 1)
    else {
      persist({ completed: true, data })
      setDone(true)
    }
  }
  function back() {
    if (idx === 0) router.push("/onboarding")
    else setIdx((i) => i - 1)
  }
  function skip() {
    if (idx < total - 1) setIdx((i) => i + 1)
    else {
      persist({ completed: true, data })
      setDone(true)
    }
  }

  if (done) {
    return (
      <ObShell step={total} total={total} accent={accent} title="You're all set" sub="Your workspace is ready — everything you entered is seeded inside.">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 py-16">
          <p className="max-w-md text-muted-foreground leading-relaxed">
            Pick up right where you left off. You can complete any skipped steps from your dashboard checklist.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-mono uppercase tracking-wider text-white transition-transform hover:-translate-y-px"
            style={{ backgroundColor: accent }}
          >
            Enter Anker <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </ObShell>
    )
  }

  return (
    <ObShell step={idx + 1} total={total} accent={accent} title={step.title} sub={step.sub}>
      <AccentProvider value={accent}>
        <div key={step.key} className="max-w-2xl w-full">
          <div className="mb-6 text-[11px] font-mono uppercase tracking-[0.18em]" style={{ color: accent }}>
            {step.eyebrow}
          </div>
          <div className="grid gap-5">{step.render(data, set)}</div>

          <div className="mt-10 pt-6 border-t border-foreground/10 flex items-center gap-4">
            <button type="button" onClick={back} className="inline-flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> {idx === 0 ? "Path" : "Back"}
            </button>
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
              {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            {step.optional ? (
              <button type="button" onClick={skip} className="ml-auto text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Skip for now
              </button>
            ) : (
              <span className="ml-auto" />
            )}
            <button
              type="button"
              onClick={next}
              disabled={!canContinue}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-mono uppercase tracking-wider text-white transition-transform enabled:hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: accent }}
            >
              {idx === total - 1 ? "Finish" : "Continue"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </AccentProvider>
    </ObShell>
  )
}
