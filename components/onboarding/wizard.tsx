"use client"

import { useCallback, useState, useEffect, useRef } from "react"
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
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const revision = useRef(0)
  async function restore() {
    setError(null)
    try {
      const r = await fetch(`/api/onboarding?persona=${persona}`)
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || "Could not restore setup")
      if (body.draft) { setData(body.draft.data); setIdx(Math.min(body.draft.step, steps.length - 1)); revision.current = body.draft.revision; setDone(body.draft.completed) }
      setReady(true)
    } catch (e) { setError(e instanceof Error ? e.message : "Could not restore setup") }
  }
  useEffect(() => { restore() }, [persona])

  const set = useCallback((k: string, v: any) => setData((d) => ({ ...d, [k]: v })), [])
  const total = steps.length + 1 // + "Choose path"
  const railLabels = ["Choose path", ...steps.map((s) => s.title)]
  const step = steps[idx]
  const canContinue = !step?.valid || step.valid(data)

  async function next() {
    if (locked.current || !ready) return
    locked.current = true; setBusy(true); setError(null)
    const completed = idx === steps.length - 1
    try {
      const r = await fetch("/api/onboarding", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_type: persona, step: completed ? idx : idx + 1, revision: revision.current, completed, data }),
      })
      const body = await r.json()
      if (typeof body.revision === "number") revision.current = body.revision
      if (!r.ok || !body.ok || !body.persisted) throw new Error(body.error || "Setup was not saved. Please retry.")
      if (completed) setDone(true); else setIdx((i) => i + 1)
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save setup. Please retry.") }
    finally { locked.current = false; setBusy(false) }
  }
  function back() { if (idx === 0) router.push("/onboarding"); else setIdx((i) => i - 1) }
  const skip = next

  const preview = <PreviewCard persona={persona} data={data} accent={accent} />

  if (done) {
    return (
      <ObShell current={total} total={total} eyebrow="Done" title="You're all set" accent={accent} steps={railLabels} aside={preview}
        sub="Your profile and workspace are saved. Review your details in the dashboard.">
        <div className="rounded-xl border border-foreground/12 bg-foreground/[0.015] p-6">
          <div className="flex items-center gap-3 text-sm">
            <span className="grid place-items-center w-8 h-8 rounded-full text-white" style={{ backgroundColor: accent }}><Check className="w-4 h-4" /></span>
            Setup complete. You can add documents and update your profile from your workspace.
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
        {error && <p role="alert" className="mb-4 text-destructive">{error} <button className="underline" onClick={restore}>Reload saved draft</button></p>}
        {!ready && !error && <p role="status">Restoring setup…</p>}
        <fieldset disabled={busy || !ready}>
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
          <button type="button" onClick={next} disabled={!canContinue || busy || !ready}
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium text-white transition-transform enabled:hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent }}>
            {busy ? "Saving…" : idx === steps.length - 1 ? "Finish" : "Continue"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        </fieldset>
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
