"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export interface VerificationViewData {
  required: Array<{ type: string; label: string; status: "requested" | "received" | "verified" | "rejected"; receivedAt: string | null; note: string | null; filename: string | null }>
  category: string | null; owners: string | null; needsOwners: boolean; submitted: boolean; ready: boolean; unlocked: boolean
}
const CATEGORIES: Array<[string, string]> = [["professional", "A professional investor"], ["semi_professional", "A semi-professional investor"], ["other", "Another kind of investor"], ["unsure", "I am not sure"]]
const STATUS: Record<string, string> = { requested: "Needed", received: "Received", verified: "Checked by the fund", rejected: "Sent back" }

/** The investor sends identity and address documents and says what kind of investor they are (docs/architecture/60 section 6). The fund looks at each document and decides. */
export function LpVerificationCard({ token, view }: { token: string; view: VerificationViewData }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  async function call(key: string, init: RequestInit) {
    setBusy(key); setMsg(null)
    const r = await fetch(`/api/portal/${token}/verification`, init)
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setMsg(j.error ?? "That did not work. Please try again."); return false }
    router.refresh(); return true
  }
  const upload = (type: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const f = new FormData(); f.set("docType", type); f.set("file", file)
    void call(type, { method: "POST", body: f }).then(() => { e.target.value = "" })
  }
  const declare = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget)
    void call("declare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "declare", category: f.get("category"), owners: f.get("owners") }) })
  }
  const input = "mt-1 w-full rounded-md border bg-transparent px-3 text-sm"
  return (
    <section className="rounded-xl border p-5" aria-labelledby="ver-h">
      <h2 id="ver-h" className="text-lg font-semibold">Identity verification</h2>
      <p className="mt-1 text-sm text-muted-foreground">The fund is required to know who its investors are. Send the documents below as a PDF, JPEG or PNG (up to 4 MB each). They are encrypted when they arrive, only the fund&apos;s managers can open them, and they are not read by any automated system. The fund checks them itself.</p>

      {view.submitted ? <p className="mt-3 text-sm font-medium text-emerald-700">Thank you. You have sent everything. The fund will contact you if it needs anything else.</p> : null}

      <ul className="mt-3 divide-y text-sm">
        {view.required.map((d) => (
          <li key={d.type} className="py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><strong>{d.label}</strong> <span className="text-xs text-muted-foreground">· {STATUS[d.status]}{d.receivedAt ? `, ${d.receivedAt}` : ""}{d.filename ? ` (${d.filename})` : ""}</span></span>
              {d.status !== "verified" && (
                <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs">{busy === d.type ? "Sending…" : d.status === "requested" ? "Choose a file" : "Replace"}
                  <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className="sr-only" disabled={busy !== null} onChange={(e) => upload(d.type, e)} aria-label={`Upload: ${d.label}`} /></label>)}
            </div>
            {d.status === "rejected" && d.note && <p className="mt-1 text-xs text-amber-700">The fund sent this back: {d.note}</p>}
          </li>))}
      </ul>

      <form onSubmit={declare} className="mt-4 space-y-3 border-t pt-4 text-sm">
        <fieldset><legend className="font-medium">What kind of investor are you?</legend>
          {CATEGORIES.map(([v, l]) => <label key={v} className="mt-1 flex items-center gap-2"><input type="radio" name="category" value={v} defaultChecked={view.category === v} required />{l}</label>)}
        </fieldset>
        {view.needsOwners && <label className="block"><span className="font-medium">Who owns and controls the entity?</span><textarea name="owners" required minLength={5} rows={3} defaultValue={view.owners ?? ""} placeholder="Names and shares, for example: Anna Berg 60%, Jonas Berg 40%" className={input} /></label>}
        <button className="h-9 rounded-md border px-4 text-sm disabled:opacity-50" disabled={busy !== null}>{view.category ? "Update my answers" : "Save my answers"}</button>
      </form>

      {!view.submitted && (
        <div className="mt-4 border-t pt-4">
          <button className="h-9 rounded-md border px-4 text-sm disabled:opacity-50" disabled={!view.ready || busy !== null} onClick={() => call("submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit" }) })}>I have sent everything</button>
          {!view.ready && <p className="mt-2 text-xs text-muted-foreground">Add every document and save your answers first.</p>}
        </div>)}
      {msg && <p role="alert" className="mt-3 text-sm text-red-600">{msg}</p>}
    </section>
  )
}
