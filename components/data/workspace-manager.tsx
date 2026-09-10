"use client"

import { useEffect, useRef, useState } from "react"
import { Building2, Check, Edit3, Plus, Wallet, X } from "lucide-react"
import type { WorkspaceRecord } from "@/lib/org/workspaces"
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
}

const emptyForm = (kind: "company" | "fund" = "company"): FormValue => ({
  name: "", kind, website: "", stage: "", sectors: "", summary: "", geography: "", thesis: "", checkMin: "", checkMax: "", stageFocus: "", vintageYear: "", targetSize: "",
})

function formFromWorkspace(workspace: WorkspaceRecord): FormValue {
  const profile = (workspace.settings?.profile ?? {}) as Record<string, any>
  return { ...emptyForm(workspace.kind), name: workspace.name, website: profile.website ?? "", stage: profile.stage ?? "", sectors: Array.isArray(profile.sectors) ? profile.sectors.join(", ") : "", summary: profile.summary ?? "", geography: profile.geography ?? "", thesis: profile.thesis ?? "", checkMin: profile.checkMin ?? "", checkMax: profile.checkMax ?? "", stageFocus: profile.stageFocus ?? "", vintageYear: profile.vintageYear?.toString() ?? "", targetSize: profile.targetSize ?? "" }
}

function payload(form: FormValue) {
  const profile: Record<string, unknown> = { website: form.website, stage: form.stage, summary: form.summary, geography: form.geography, thesis: form.thesis, checkMin: form.checkMin, checkMax: form.checkMax, stageFocus: form.stageFocus, vintageYear: form.vintageYear ? Number(form.vintageYear) : null, targetSize: form.targetSize }
  if (form.kind === "company") profile.sectors = form.sectors.split(",").map((v) => v.trim()).filter(Boolean)
  return { name: form.name, kind: form.kind, profile }
}

export function WorkspaceManager({ initialWorkspaces, activeOrgId }: { initialWorkspaces: WorkspaceRecord[]; activeOrgId: string | null }) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [active, setActive] = useState(activeOrgId)
  const [editing, setEditing] = useState<WorkspaceRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormValue>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (creating || editing) dialogRef.current?.showModal()
    else if (dialogRef.current?.open) dialogRef.current.close()
  }, [creating, editing])

  function openCreate() { setError(null); setEditing(null); setForm(emptyForm()); setCreating(true) }
  function openEdit(workspace: WorkspaceRecord) { setError(null); setCreating(false); setEditing(workspace); setForm(formFromWorkspace(workspace)) }
  function closeDialog() { if (!busy) { setCreating(false); setEditing(null); setError(null) } }
  function update(key: keyof FormValue, value: string) { setForm((current) => ({ ...current, [key]: value })) }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const endpoint = editing ? `/api/org/workspaces/${encodeURIComponent(editing.orgId)}` : "/api/org/workspaces"
      const response = await fetch(endpoint, { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(form)) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? "Workspace could not be saved")
      const saved = data.workspace as WorkspaceRecord
      setWorkspaces((current) => editing ? current.map((item) => item.orgId === saved.orgId ? saved : item) : [...current, saved])
      if (!editing) setActive(saved.orgId)
      closeDialog()
      if (!editing) window.location.reload()
    } catch (cause: any) { setError(cause?.message ?? "Workspace could not be saved. Please retry.") }
    finally { setBusy(false) }
  }

  async function switchWorkspace(orgId: string) {
    if (orgId === active) return
    setBusy(true); setError(null)
    try {
      const response = await fetch("/api/org/active", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId }) })
      if (!response.ok) throw new Error("Could not switch workspace. Please try again.")
      setActive(orgId); window.location.reload()
    } catch (cause: any) { setError(cause?.message ?? "Could not switch workspace. Please try again.") }
    finally { setBusy(false) }
  }

  return <div className={styles.root}>
    <div className={styles.toolbar}>
      <div><p className={styles.eyebrow}>Workspace portfolio</p><p className={styles.helper}>Keep each persona’s operating context separate. Changes apply to the selected workspace only.</p></div>
      <button type="button" className={styles.primaryButton} onClick={openCreate}><Plus size={16} aria-hidden="true" /> New workspace</button>
    </div>
    {error && <div role="alert" className={styles.alert}>{error}</div>}
    {workspaces.length === 0 ? <div className={styles.empty}><Building2 size={22} aria-hidden="true" /><p>No workspaces yet.</p><button type="button" className={styles.secondaryButton} onClick={openCreate}>Create your first workspace</button></div> : <div className={styles.grid}>
      {workspaces.map((workspace) => { const canEdit = workspace.persona !== "lp" && ["workspace_owner", "admin"].includes(workspace.orgRole); const Icon = workspace.kind === "fund" ? Wallet : Building2; return <article key={workspace.orgId} className={`${styles.card} ${active === workspace.orgId ? styles.activeCard : ""}`}>
        <div className={styles.cardHeader}><span className={styles.iconWrap}><Icon size={18} aria-hidden="true" /></span><div className={styles.cardTitle}><h2>{workspace.name}</h2><p>{workspace.kind === "fund" ? "VC / fund" : "Founder / company"}</p></div>{active === workspace.orgId && <span className={styles.activePill}><Check size={12} aria-hidden="true" /> Active</span>}</div>
        <div className={styles.cardMeta}><span className={styles.role}>{workspace.orgRole.replaceAll("_", " ")}</span><span>{workspace.persona === "lp" ? "LP access" : workspace.persona === "vc" ? "Investment workspace" : "Operating workspace"}</span></div>
        <div className={styles.cardActions}>{active !== workspace.orgId && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void switchWorkspace(workspace.orgId)}>Switch here</button>}{canEdit ? <button type="button" className={styles.ghostButton} onClick={() => openEdit(workspace)}><Edit3 size={14} aria-hidden="true" /> Edit</button> : <span className={styles.readOnly}>{workspace.persona === "lp" ? "Managed by invitation" : "Read only"}</span>}</div>
      </article> })}
    </div>}

    <dialog ref={dialogRef} className={styles.dialog} onCancel={(event) => { event.preventDefault(); closeDialog() }}>
      <form method="dialog" onSubmit={(event) => void submit(event)} className={styles.form}>
        <div className={styles.dialogHeader}><div><p className={styles.eyebrow}>{editing ? "Workspace settings" : "New workspace"}</p><h2>{editing ? "Edit workspace" : "Create a workspace"}</h2><p className={styles.helper}>{editing ? "Update the operating context used by your navigation and workflows." : "Create a separate context for a company or investment fund."}</p></div><button type="button" className={styles.closeButton} onClick={closeDialog} aria-label="Close workspace dialog"><X size={18} aria-hidden="true" /></button></div>
        {!editing && <fieldset className={styles.fieldset}><legend>Persona</legend><div className={styles.segmented}><label className={form.kind === "company" ? styles.selectedSegment : ""}><input type="radio" name="kind" checked={form.kind === "company"} onChange={() => update("kind", "company")} /> Founder / company</label><label className={form.kind === "fund" ? styles.selectedSegment : ""}><input type="radio" name="kind" checked={form.kind === "fund"} onChange={() => update("kind", "fund")} /> VC / fund</label></div><p className={styles.fieldHint}>LP access is invitation-based and cannot create a fund workspace.</p></fieldset>}
        <label className={styles.label}>Workspace name<input required maxLength={120} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder={form.kind === "fund" ? "Northstar Ventures" : "Acme Labs"} /></label>
        <div className={styles.twoCol}><label className={styles.label}>Website<input inputMode="url" value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://…" /></label>{form.kind === "company" ? <label className={styles.label}>Stage<input value={form.stage} onChange={(event) => update("stage", event.target.value)} placeholder="Seed, Series A…" /></label> : <label className={styles.label}>Vintage year<input inputMode="numeric" value={form.vintageYear} onChange={(event) => update("vintageYear", event.target.value)} placeholder="2026" /></label>}</div>
        {form.kind === "company" ? <><label className={styles.label}>Sectors<input value={form.sectors} onChange={(event) => update("sectors", event.target.value)} placeholder="Climate, fintech, B2B (comma separated)" /></label><label className={styles.label}>Company summary<textarea rows={3} value={form.summary} onChange={(event) => update("summary", event.target.value)} placeholder="What are you building and for whom?" /></label></> : <><div className={styles.twoCol}><label className={styles.label}>Investment stages<input value={form.stageFocus} onChange={(event) => update("stageFocus", event.target.value)} placeholder="Seed to Series B" /></label><label className={styles.label}>Geography<input value={form.geography} onChange={(event) => update("geography", event.target.value)} placeholder="DACH, Europe…" /></label></div><div className={styles.twoCol}><label className={styles.label}>Check range<input value={form.checkMin} onChange={(event) => update("checkMin", event.target.value)} placeholder="€250k min" /></label><label className={styles.label}>To<input value={form.checkMax} onChange={(event) => update("checkMax", event.target.value)} placeholder="€2m max" /></label></div><label className={styles.label}>Fund size<input inputMode="decimal" value={form.targetSize} onChange={(event) => update("targetSize", event.target.value)} placeholder="10000000" /></label><label className={styles.label}>Investment thesis<textarea rows={3} value={form.thesis} onChange={(event) => update("thesis", event.target.value)} placeholder="What signals and sectors matter to this fund?" /></label></>}
        {error && <p role="alert" className={styles.formError}>{error}</p>}<div className={styles.formActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy || !form.name.trim()}>{busy ? "Saving…" : editing ? "Save changes" : "Create workspace"}</button></div>
      </form>
    </dialog>
  </div>
}
