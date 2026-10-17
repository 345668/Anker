"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Circle } from "lucide-react"

interface View { state: string; steps: Array<{ key: string; label: string; done: boolean; at: string | null }>; details: { legalName: string; entityType: string; address: string | null; country: string | null; taxResidence: string | null; taxIdLast4: string | null; signatoryName: string | null } | null; termsVersion: string }
const TYPES: Array<[string, string]> = [["individual", "An individual"], ["company", "A company"], ["trust", "A trust"], ["fund", "A fund"], ["family_office", "A family office"], ["other", "Other"]]

/** The investor's checklist: confirm details, accept terms (docs/architecture/60). The fund's own record is never changed from here. */
export function LpOnboardingCard({ token, view, defaultName }: { token: string; view: View; defaultName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const detailsDone = view.steps.find((s) => s.key === "details")?.done
  const termsDone = view.steps.find((s) => s.key === "terms")?.done
  const [editing, setEditing] = useState(!detailsDone)
  const [agree, setAgree] = useState(false)
  async function post(body: Record<string, unknown>) {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/portal/${token}/onboarding`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error ?? "That did not work. Please try again."); return false }
    router.refresh(); return true
  }
  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (await post({ action: "confirm_details", legalName: f.get("legalName"), entityType: f.get("entityType"), address: f.get("address"), country: f.get("country"), taxResidence: f.get("taxResidence"), taxId: f.get("taxId"), signatoryName: f.get("signatoryName") })) setEditing(false)
  }
  const d = view.details
  const input = "mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
  const allDone = view.steps.slice(0, 3).every((s) => s.done)
  return (
    <section className="rounded-xl border p-5" aria-labelledby="ob-h">
      <h2 id="ob-h" className="text-lg font-semibold">{allDone ? "Your onboarding" : "Getting started"}</h2>
      <ol className="mt-3 space-y-1.5 text-sm">
        {view.steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            {s.done ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />}
            <span className={s.done ? "" : "text-muted-foreground"}>{s.label}{s.at ? `, ${s.at}` : ""}</span>
          </li>))}
      </ol>

      {editing ? (
        <form onSubmit={saveDetails} className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <p className="sm:col-span-2 text-xs text-muted-foreground">Please check these details. The fund will see what you enter and compare it with its own records. Your tax number is stored encrypted and only the last four digits are shown back.</p>
          <label>Legal name<input name="legalName" required defaultValue={d?.legalName ?? defaultName} className={input} /></label>
          <label>You are<select name="entityType" required defaultValue={d?.entityType ?? ""} className={input}><option value="" disabled>Choose…</option>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="sm:col-span-2">Address<input name="address" defaultValue={d?.address ?? ""} className={input} /></label>
          <label>Country<input name="country" defaultValue={d?.country ?? ""} className={input} /></label>
          <label>Tax residence<input name="taxResidence" defaultValue={d?.taxResidence ?? ""} className={input} /></label>
          <label>Tax number (optional)<input name="taxId" autoComplete="off" placeholder={d?.taxIdLast4 ? `ending ${d.taxIdLast4}` : ""} className={input} /></label>
          <label>Authorised signatory<input name="signatoryName" defaultValue={d?.signatoryName ?? ""} className={input} /></label>
          <div className="sm:col-span-2 flex gap-2"><button className="h-9 rounded-md border px-4 disabled:opacity-50" disabled={busy}>Save my details</button>{detailsDone && <button type="button" className="h-9 rounded-md px-3 underline" onClick={() => setEditing(false)}>Cancel</button>}</div>
        </form>
      ) : d && (
        <p className="mt-3 text-sm">Your details: <strong>{d.legalName}</strong>{d.country ? `, ${d.country}` : ""}. <button className="underline" onClick={() => setEditing(true)}>Change</button></p>
      )}

      {detailsDone && !termsDone && !editing && (
        <div className="mt-4 space-y-2 border-t pt-4 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I have read the <a className="underline" href="/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a> and the <a className="underline" href="/terms" target="_blank" rel="noopener noreferrer">terms of use</a> (version {view.termsVersion}).</span></label>
          <button className="h-9 rounded-md border px-4 disabled:opacity-50" disabled={busy || !agree} onClick={() => post({ action: "accept_terms" })}>Accept</button>
        </div>)}
      {msg && <p role="alert" className="mt-3 text-sm text-red-600">{msg}</p>}
      {allDone && <p className="mt-3 text-xs text-muted-foreground">Next the fund will send your subscription documents and ask for identity verification. You will find them here.</p>}
    </section>
  )
}
