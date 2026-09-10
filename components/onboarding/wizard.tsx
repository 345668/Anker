"use client"

import { useCallback, useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, ArrowLeft, Check } from "lucide-react"
import { ObShell, type PersonaKey } from "./ob-shell"
import s from "./onboarding.module.css"

export type WizardData = Record<string, any>
export type WizardStep = {
  key: string; eyebrow: string; title: string; sub: string; optional?: boolean
  valid?: (data: WizardData) => boolean
  validationMessage?: string
  render: (data: WizardData, set: (key: string, value: any) => void) => React.ReactNode
}

export function Wizard({ persona, steps, initial = {} }: { persona: PersonaKey; steps: WizardStep[]; initial?: WizardData }) {
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const [data, setData] = useState<WizardData>(initial)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const locked = useRef(false)
  const revision = useRef(0)
  const restoreController = useRef<AbortController | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const errorBox = useRef<HTMLDivElement>(null)
  const initialData = useRef(initial)

  const restore = useCallback(async () => {
    restoreController.current?.abort()
    const controller = new AbortController()
    restoreController.current = controller
    setError(null)
    setReady(false)
    try {
      const r = await fetch(`/api/onboarding?persona=${persona}`, { cache: "no-store", signal: controller.signal })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || "Could not restore setup.")
      if (controller.signal.aborted) return
      const draft = body.draft
      if (draft) {
        if (!draft.data || typeof draft.data !== "object" || Array.isArray(draft.data) || !Number.isInteger(draft.step) || !Number.isInteger(draft.revision)) throw new Error("Your saved setup could not be read. Please retry.")
        // A browser reload cannot resume an in-memory file upload or extraction.
        const restored = { ...initialData.current, ...draft.data }
        if (restored.deckUpload === "uploading") restored.deckUpload = "The upload was interrupted. Choose the file again to retry."
        if (restored.deckExtraction === "extracting") restored.deckExtraction = "Deck reading was interrupted. Review your details manually or upload again."
        setData(restored)
        setIdx(Math.max(0, Math.min(draft.step, steps.length - 1)))
        revision.current = draft.revision
        setDone(draft.completed === true)
        setSaved(true)
      } else {
        setData(initialData.current); setIdx(0); revision.current = 0; setDone(false); setSaved(false)
      }
      setDirty(false)
      setReady(true)
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not restore setup.")
    }
  }, [persona, steps.length])
  useEffect(() => { void restore(); return () => restoreController.current?.abort() }, [restore])
  useEffect(() => { if (error) errorBox.current?.focus() }, [error])

  const set = useCallback((key: string, value: any) => {
    setData(previous => ({ ...previous, [key]: value }))
    setDirty(true)
  }, [])
  const pendingFile = data.deckUpload === "uploading" || data.deckExtraction === "extracting"
  useEffect(() => {
    if (!dirty && !busy && !pendingFile) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty, busy, pendingFile])

  const total = steps.length + 1
  const railLabels = ["Choose workspace", ...steps.map(step => step.title)]
  const step = steps[idx]

  async function save(action: "next" | "exit") {
    if (locked.current || !ready || pendingFile) return
    if (action === "next") {
      if (form.current && !form.current.reportValidity()) return
      if (step.valid && !step.valid(data)) {
        setError(step.validationMessage || "Complete the required fields before continuing.")
        return
      }
    }
    locked.current = true; setBusy(true); setError(null)
    const completed = action === "next" && idx === steps.length - 1
    try {
      const r = await fetch("/api/onboarding", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_type: persona, step: action === "exit" || completed ? idx : idx + 1, revision: revision.current, completed, data }),
      })
      const body = await r.json()
      if (typeof body.revision === "number") revision.current = body.revision
      if (!r.ok || !body.ok || !body.persisted) throw new Error(body.error || "Setup was not saved. Your entries are still here; please retry.")
      setDirty(false); setSaved(true)
      if (action === "exit") router.push("/onboarding")
      else if (completed) setDone(true)
      else setIdx(i => i + 1)
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save setup. Your entries are still here; please retry.") }
    finally { locked.current = false; setBusy(false) }
  }
  function reload() {
    if (dirty && !window.confirm("Reload the saved draft? Your unsaved changes on this page will be replaced.")) return
    void restore()
  }
  function allowLeave() {
    if (busy || pendingFile) { setError("Please wait for the current save or upload to finish before leaving."); return false }
    return !dirty || window.confirm("Leave setup without saving your latest changes? Use Save and exit to keep them.")
  }

  const preview = ready ? <PreviewCard persona={persona} data={data} saved={done} /> : undefined
  if (done) return (
    <ObShell current={total} total={total} complete eyebrow="Ready for what comes next" title="Your workspace is ready."
      steps={railLabels} aside={preview} sub="Your profile and workspace are saved. Start with the work that matters most to you.">
      <div className={s.success}>
        <Check size={28} aria-hidden="true" />
        <h2>{persona === "founder" ? "Build your fundraising foundation." : "Put your investment focus to work."}</h2>
        <p>{persona === "founder"
          ? "Review your company profile, research investors and organise your documents. Add the rest as your company grows."
          : "Review your fund profile, explore companies and start building your relationships. Add LP records and portfolio details from your workspace."}</p>
        <div className={s.successLinks}>
          <Link className={s.button} href="/dashboard">Open workspace <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </div>
    </ObShell>
  )

  return (
    <ObShell current={idx + 2} total={total} eyebrow={`${persona === "founder" ? "Founder" : "Venture fund"} workspace · ${step.eyebrow}`}
      title={!ready ? "Resume your setup." : step.title} sub={!ready ? "We’ll load your saved progress before you make changes." : step.sub}
      steps={ready ? railLabels : undefined} aside={preview} allowLeave={allowLeave}>
      {error && <div role="alert" tabIndex={-1} ref={errorBox} className={`${s.notice} ${s.error}`}>
        <p>{error}</p>
        <button type="button" className={s.textButton} disabled={busy || pendingFile} onClick={reload}>{ready ? "Reload saved draft" : "Retry loading setup"}</button>
      </div>}
      {!ready ? !error && <p role="status" className={s.notice}>Loading your saved setup…</p> : (
        <form ref={form} className={s.form} onSubmit={e => { e.preventDefault(); void save("next") }}>
          <p className={s.status}>Fields marked required are needed to continue. Everything else can be added later.</p>
          <fieldset className={s.fields} disabled={busy || pendingFile}>
            <legend className="sr-only">{step.title}</legend>
            <div key={step.key} className={s.fields}>{step.render(data, set)}</div>
          </fieldset>
          {pendingFile && <p role="status" className={s.notice}>Please wait for your deck to finish processing before continuing. Your entries will stay here.</p>}
          <div className={s.actions}>
            <button type="button" disabled={busy || pendingFile} className={s.textButton}
              onClick={() => idx === 0 ? void save("exit") : (setError(null), setIdx(i => i - 1))}>
              <ArrowLeft size={16} aria-hidden="true" />{idx === 0 ? "Change workspace" : "Back"}
            </button>
            <div className={s.forward}>
              {step.optional && <button type="button" disabled={busy || pendingFile} className={s.textButton} onClick={() => void save("next")}>Skip for now</button>}
              <button type="submit" disabled={busy || pendingFile} className={s.button}>
                {busy ? "Saving…" : idx === steps.length - 1 ? "Finish setup" : "Save and continue"}<ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className={s.saveRow}>
            <p role="status" className={s.status}>{busy ? "Saving your progress…" : dirty ? "Changes not yet saved." : saved ? "Saved progress restored or updated." : "Progress saves when you continue."}</p>
            <button type="button" disabled={busy || pendingFile} className={s.textButton} onClick={() => void save("exit")}>Save and exit</button>
          </div>
        </form>
      )}
    </ObShell>
  )
}

function PreviewCard({ persona, data, saved }: { persona: PersonaKey; data: WizardData; saved: boolean }) {
  const name = (persona === "vc" ? data.firm : data.company) || "Your workspace"
  const stages: Record<string, string> = { idea: "Idea / building", "pre-seed": "Pre-seed", seed: "Seed", a: "Series A+" }
  const metrics: [string, string][] = persona === "vc"
    ? [["Vintage", data.vintage || "Not added"], ["Target fund size", data.size || "Not added"], ["Investment focus", data.theses?.join(", ") || "Not added"]]
    : [["Stage", stages[data.stage] || data.stage || "Not added"], ["Raise target", data.target || "Not added"], ["Sectors", data.sectors?.join(", ") || "Not added"]]
  return <section className={s.summary}>
    <p className={s.eyebrow}>{saved ? "Saved workspace" : "Your setup at a glance"}</p>
    <h2>{name}</h2>
    <p className={s.status}>{persona === "vc" ? "Venture fund" : "Founder"} workspace</p>
    <dl>{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className={s.summaryNote}>{data.name ? `Prepared for ${data.name}. ` : ""}{saved ? "Review your profile in your workspace." : "This summary reflects your entries. Changes save when you continue or choose Save and exit."}</p>
  </section>
}
