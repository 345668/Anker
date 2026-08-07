"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { ObShell } from "./ob-shell"

export type WizardData = Record<string, any>

export type WizardStep = {
  key: string
  order: string // e.g. "Order" label text like the game
  title: string
  serif: string
  optional?: boolean
  valid?: (d: WizardData) => boolean
  render: (d: WizardData, set: (k: string, v: any) => void) => React.ReactNode
}

export function Wizard({
  persona,
  steps,
  initial = {},
}: {
  persona: "founder" | "vc"
  steps: WizardStep[]
  initial?: WizardData
}) {
  const router = useRouter()
  const accent = persona === "vc" ? "c" : ""
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
    if (idx < total - 1) {
      setIdx((i) => i + 1)
    } else {
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
    else { persist({ completed: true, data }); setDone(true) }
  }

  if (done) {
    return (
      <ObShell step={total} total={total} title={persona === "vc" ? "Fund Ready" : "Workspace Ready"} serifSub="Your Anker workspace has awakened.">
        <main className="ob-main">
          <div className={`ob-done ${accent}`}>
            <svg className="burst" viewBox="0 0 64 64" fill="none" aria-hidden>
              <path d="M32 2l6 18 18-8-12 16 18 6-18 6 12 16-18-8-6 18-6-18-18 8 12-16-18-6 18-6L8 12l18 8 6-18Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <h2>You&apos;re In</h2>
            <p>Everything you set up is already seeded inside. Step through the door and pick up where the wizard left off.</p>
            <button className={`ob-next ${accent}`} onClick={() => router.push("/dashboard")} type="button">
              Enter Anker →
            </button>
          </div>
        </main>
      </ObShell>
    )
  }

  return (
    <ObShell step={idx + 1} total={total} title={persona === "vc" ? "Fund Setup" : "Founder Setup"} serifSub={step.serif}>
      <main className="ob-main">
        <div className={`ob-step ${persona === "vc" ? "vc" : ""}`} key={step.key}>
          <div className="ob-step-head">
            <span className="ob-step-order">{step.order}</span>
            <span className="ob-step-title">{step.title}</span>
          </div>
          {step.render(data, set)}
          <div className="ob-footer">
            <button className="ob-back" onClick={back} type="button">
              ‹ {idx === 0 ? "Path" : "Back"}
            </button>
            <span className="ob-count">
              {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            {step.optional ? (
              <button className="ob-skip" onClick={skip} type="button">
                Skip for now
              </button>
            ) : (
              <span className="ob-skip" style={{ visibility: "hidden" }}>.</span>
            )}
            <button className={`ob-next ${accent}`} onClick={next} disabled={!canContinue} type="button">
              {idx === total - 1 ? "Finish" : "Continue"}
            </button>
          </div>
        </div>
      </main>
    </ObShell>
  )
}
