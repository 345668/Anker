"use client"

import { useEffect, useRef, useState } from "react"
import { Building2, Check, Edit3, Plus, Wallet, X } from "lucide-react"
import type { WorkspaceRecord } from "@/lib/org/workspaces"
import { useRouter } from "next/navigation"
import styles from "./workspace-manager.module.css"

type FormValue = {
  name: string
  kind: "company" | "fund"
  website: string
  stage: string
  sectors: string
  summary: string
  geography: string
  thesis: string
  checkMin: string
  checkMax: string
  stageFocus: string
  vintageYear: string
  targetSize: string
  currency?: string
  raiseTarget: string
  timeline: string
  instrument: string
  useOfFunds: string
}

const emptyForm = (kind: "company" | "fund" = "company"): FormValue => ({
  raiseTarget: "", timeline: "", instrument: "", useOfFunds: "",
  name: "", kind, website: "", stage: "", sectors: "", summary: "", geography: "", thesis: "", checkMin: "", checkMax: "", stageFocus: "", vintageYear: "", targetSize: "",
})

function formFromWorkspace(workspace: WorkspaceRecord): FormValue {
  const profile = (workspace.settings?.profile ?? {}) as Record<string, any>
  return { ...emptyForm(workspace.kind), name: workspace.name, raiseTarget: profile.raiseTarget ?? "", timeline: profile.timeline ?? "", instrument: profile.instrument ?? "", useOfFunds: profile.useOfFunds ?? "", website: profile.website ?? "", stage: profile.stage ?? "", sectors: Array.isArray(profile.sectors) ? profile.sectors.join(", ") : "", summary: profile.summary ?? "", geography: profile.geography ?? "", thesis: profile.thesis ?? "", checkMin: profile.checkMin ?? "", checkMax: profile.checkMax ?? "", stageFocus: profile.stageFocus ?? "", vintageYear: profile.vintageYear?.toString() ?? "", targetSize: profile.targetSize ?? "" }
}

function payload(form: FormValue) {
  const profile: Record<string, unknown> = { website: form.website, stage: form.stage, summary: form.summary, geography: form.geography, thesis: form.thesis, checkMin: form.checkMin, checkMax: form.checkMax, stageFocus: form.stageFocus, vintageYear: form.vintageYear ? Number(form.vintageYear) : null, targetSize: form.targetSize }
  if (form.kind === "company") Object.assign(profile, {
    sectors: form.sectors.split(",").map((v) => v.trim()).filter(Boolean),
    raiseTarget: form.raiseTarget, timeline: form.timeline, instrument: form.instrument, useOfFunds: form.useOfFunds,
  })
  return { name: form.name, kind: form.kind, profile }
}

export function WorkspaceManager({ initialWorkspaces, activeOrgId }: { initialWorkspaces: WorkspaceRecord[]; activeOrgId: string | null }) {
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [active, setActive] = useState(activeOrgId)
  const [editing, setEditing] = useState<WorkspaceRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormValue>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [discard, setDiscard] = useState(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const originalForm = useRef("")
  const requestId = useRef("")
  const pending = useRef(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (creating || editing) { dialogRef.current?.showModal(); nameRef.current?.focus() }
    else if (dialogRef.current?.open) { dialogRef.current.close(); openerRef.current?.focus() }
  }, [creating, editing])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => { if (discard) discardRef.current?.focus() }, [discard])

  useEffect(() => { setWorkspaces(initialWorkspaces); setActive(activeOrgId) }, [initialWorkspaces, activeOrgId])
  const dirty = (creating || !!editing) && JSON.stringify(form) !== originalForm.current
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function prepare(next: FormValue) {
    openerRef.current = document.activeElement as HTMLElement
    setError(null); setNotice(null); setDiscard(false)
    originalForm.current = JSON.stringify(next); setForm(next)
  }
  function openCreate() { prepare(emptyForm()); requestId.current = crypto.randomUUID(); setEditing(null); setCreating(true) }
  function openEdit(workspace: WorkspaceRecord) { prepare({ ...formFromWorkspace(workspace), currency: workspace.currency ?? "USD" }); setCreating(false); setEditing(workspace) }
  function dismiss() { setCreating(false); setEditing(null); setError(null); setDiscard(false) }
  function closeDialog() { if (!pending.current) { if (dirty) setDiscard(true); else dismiss() } }
  function update(key: keyof FormValue, value: string) { setForm((current) => ({ ...current, [key]: value })) }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending.current) return
    pending.current = true; setBusy(true); setError(null)
    try {
      const endpoint = editing ? `/api/org/workspaces/${encodeURIComponent(editing.orgId)}` : "/api/org/workspaces"
      const response = await fetch(endpoint, { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload(form), revision: editing?.revision ?? 0, requestId: editing ? undefined : requestId.current, currency: editing ? undefined : form.currency ?? "USD" }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { if (response.status === 409) router.refresh(); throw new Error(data.error ?? "Workspace could not be saved") }
      const saved = data.workspace as WorkspaceRecord
      setWorkspaces((current) => editing ? current.map((item) => item.orgId === saved.orgId ? saved : item) : [...current, saved])
      dismiss()
      setNotice(editing ? `Changes saved for ${saved.name}.` : `${saved.name} is ready. Switch to it when you’re ready to work.`)
      window.dispatchEvent(new Event("anker:workspaces-changed"))
      router.refresh()
    } catch (cause: any) { setError(cause?.message ?? "Workspace could not be saved. Please retry.") }
    finally { pending.current = false; setBusy(false) }
  }

  async function switchWorkspace(orgId: string) {
    if (orgId === active || pending.current) return
    pending.current = true; setBusy(true); setError(null)
    try {
      const response = await fetch("/api/org/active", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId }) })
      if (!response.ok) throw new Error("Could not switch workspace. Please try again.")
      setActive(orgId); window.location.reload()
    } catch (cause: any) { setError(cause?.message ?? "Could not switch workspace. Please try again.") }
    finally { pending.current = false; setBusy(false) }
  }

  return <div className={styles.root}>
    <div className={styles.toolbar}>
      <div><p className={styles.eyebrow}>Workspace portfolio</p><p className={styles.helper}>Manage your companies and funds, and choose where to work next.</p></div>
      <button type="button" className={styles.primaryButton} disabled={busy} onClick={openCreate}><Plus size={16} aria-hidden="true" /> New workspace</button>
    </div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && !creating && !editing && <div role="alert" className={styles.alert}>{error}</div>}
    {workspaces.length === 0 ? <div className={styles.empty}><Building2 size={22} aria-hidden="true" /><p>No workspaces yet.</p><button type="button" className={styles.secondaryButton} onClick={openCreate}>Create your first workspace</button></div> : <div className={styles.grid}>
      {workspaces.map((workspace) => { const canEdit = workspace.persona !== "lp" && ["workspace_owner", "admin"].includes(workspace.orgRole); const Icon = workspace.kind === "fund" ? Wallet : Building2; return <article key={workspace.orgId} className={`${styles.card} ${active === workspace.orgId ? styles.activeCard : ""}`}>
        <div className={styles.cardHeader}><span className={styles.iconWrap}><Icon size={18} aria-hidden="true" /></span><div className={styles.cardTitle}><h2>{workspace.name}</h2><p>{workspace.persona === "lp" ? "Limited partner" : workspace.kind === "fund" ? "VC / fund" : "Founder / company"}</p></div>{active === workspace.orgId && <span className={styles.activePill}><Check size={12} aria-hidden="true" /> Active</span>}</div>
        <div className={styles.cardMeta}><span className={styles.role}>{workspace.orgRole.replaceAll("_", " ")}</span><span>{workspace.persona === "lp" ? "LP access" : workspace.persona === "vc" ? "Investment workspace" : "Operating workspace"}</span></div>
        <div className={styles.cardActions}>{active !== workspace.orgId && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void switchWorkspace(workspace.orgId)}>Switch here</button>}{canEdit ? <button type="button" className={styles.ghostButton} disabled={busy} onClick={() => openEdit(workspace)}><Edit3 size={14} aria-hidden="true" /> Edit</button> : <span className={styles.readOnly}>{workspace.persona === "lp" ? "Managed by invitation" : "Read only"}</span>}</div>
      </article> })}
    </div>}

    <dialog ref={dialogRef} aria-label={editing ? "Edit workspace" : "Create a workspace"} className={styles.dialog} onCancel={(event) => { event.preventDefault(); closeDialog() }}>
      <form onSubmit={(event) => void submit(event)} className={styles.form} aria-busy={busy}>
        <div className={styles.dialogHeader}><div><p className={styles.eyebrow}>{editing ? "Workspace settings" : "New workspace"}</p><h2>{editing ? "Edit workspace" : "Create a workspace"}</h2><p className={styles.helper}>{editing ? "Keep your workspace name and profile up to date." : "Create a separate context for a company or investment fund."}</p></div><button type="button" className={styles.closeButton} disabled={busy} onClick={closeDialog} aria-label="Close workspace dialog"><X size={18} aria-hidden="true" /></button></div>
        <fieldset disabled={busy} className={styles.fields}><legend className="sr-only">Workspace details</legend>
        {!editing && <fieldset className={styles.fieldset}><legend>Persona</legend><div className={styles.segmented}><label className={form.kind === "company" ? styles.selectedSegment : ""}><input type="radio" name="kind" checked={form.kind === "company"} onChange={() => update("kind", "company")} /> Founder / company</label><label className={form.kind === "fund" ? styles.selectedSegment : ""}><input type="radio" name="kind" checked={form.kind === "fund"} onChange={() => update("kind", "fund")} /> VC / fund</label></div><p className={styles.fieldHint}>Looking for your LP investments? Open the LP portal to see funds you’ve been invited to.</p></fieldset>}
        <label className={styles.label}>Workspace name<input ref={nameRef} disabled={busy} required maxLength={120} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder={form.kind === "fund" ? "Northstar Ventures" : "Acme Labs"} /></label>
        {form.kind === "fund" && <label className={styles.label}>Fund currency<select disabled={busy || !!editing} value={form.currency ?? "USD"} onChange={event => update("currency", event.target.value)}>{Array.from(new Set([form.currency ?? "USD", "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "SEK", "DKK", "NOK", "JPY"])).map(currency => <option key={currency}>{currency}</option>)}</select><span className={styles.fieldHint}>Fund size is recorded in this currency. Existing fund currency is managed in fund settings.</span></label>}
        {discard && <div ref={discardRef} tabIndex={-1} className={styles.discard} role="group" aria-label="Unsaved changes"><p>You have unsaved changes.</p><button type="button" className={styles.secondaryButton} onClick={() => { setDiscard(false); nameRef.current?.focus() }}>Keep editing</button><button type="button" className={styles.secondaryButton} onClick={dismiss}>Discard changes</button></div>}
        <div className={styles.twoCol}><label className={styles.label}>Website<input inputMode="url" value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://…" /></label>{form.kind === "company" ? <label className={styles.label}>Stage<input value={form.stage} onChange={(event) => update("stage", event.target.value)} placeholder="Seed, Series A…" /></label> : <label className={styles.label}>Vintage year<input inputMode="numeric" value={form.vintageYear} onChange={(event) => update("vintageYear", event.target.value)} placeholder="2026" /></label>}</div>
        {form.kind === "company" ? <><label className={styles.label}>Sectors<input value={form.sectors} onChange={(event) => update("sectors", event.target.value)} placeholder="Climate, fintech, B2B (comma separated)" /></label><label className={styles.label}>Company summary<textarea rows={3} value={form.summary} onChange={(event) => update("summary", event.target.value)} placeholder="What are you building and for whom?" /></label></> : <><div className={styles.twoCol}><label className={styles.label}>Investment stages<input value={form.stageFocus} onChange={(event) => update("stageFocus", event.target.value)} placeholder="Seed to Series B" /></label><label className={styles.label}>Geography<input value={form.geography} onChange={(event) => update("geography", event.target.value)} placeholder="DACH, Europe…" /></label></div><div className={styles.twoCol}><label className={styles.label}>Check range<input value={form.checkMin} onChange={(event) => update("checkMin", event.target.value)} placeholder="€250k min" /></label><label className={styles.label}>To<input value={form.checkMax} onChange={(event) => update("checkMax", event.target.value)} placeholder="€2m max" /></label></div><label className={styles.label}>Fund size ({form.currency ?? "USD"})<input inputMode="decimal" value={form.targetSize} onChange={(event) => update("targetSize", event.target.value)} placeholder="10000000" /></label><label className={styles.label}>Investment thesis<textarea rows={3} value={form.thesis} onChange={(event) => update("thesis", event.target.value)} placeholder="What signals and sectors matter to this fund?" /></label></>}
        {form.kind === "company" && <>
          <label className={styles.label}>Company location<input maxLength={160} value={form.geography} onChange={event => update("geography", event.target.value)} placeholder="Berlin, Germany" /></label>
          <details><summary className={styles.fieldHint}>Fundraising plans (optional notes)</summary><div className={styles.fields}>
            <label className={styles.label}>Raise target, including currency<input maxLength={160} value={form.raiseTarget} onChange={event => update("raiseTarget", event.target.value)} placeholder="EUR 1,500,000" /></label>
            <label className={styles.label}>Timeline<input maxLength={300} value={form.timeline} onChange={event => update("timeline", event.target.value)} /></label>
            <label className={styles.label}>Instrument<input maxLength={80} value={form.instrument} onChange={event => update("instrument", event.target.value)} placeholder="SAFE, priced equity, convertible note" /></label>
            <label className={styles.label}>Use of funds<textarea maxLength={2000} rows={3} value={form.useOfFunds} onChange={event => update("useOfFunds", event.target.value)} /></label>
            <p className={styles.fieldHint}>These notes do not create a round or a financial forecast. Configure those in Raise Pipeline and Runway when you are ready.</p>
          </div></details>
        </>}
        </fieldset>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className={styles.formError}>{error}</p>}<div className={styles.formActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy || !form.name.trim()}>{busy ? "Saving…" : editing ? "Save changes" : "Create workspace"}</button></div>
      </form>
    </dialog>
  </div>
}
