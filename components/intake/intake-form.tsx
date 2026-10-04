"use client"

import { useState } from "react"
import { STAGES, type FormConfig } from "@/lib/intake/model"
import { PENDING_PREFIX } from "@/lib/campaign/submission-files"

const INLINE_MAX = 3 * 1024 * 1024
const field = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"

export function IntakeForm({ slug, fundName, headline, intro, form }: { slug: string; fundName: string; headline: string; intro: string; form: FormConfig }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deckName, setDeckName] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(null)
    const fd = new FormData(e.currentTarget)
    try {
      const deck = fd.get("pitch_deck")
      if (deck instanceof File && deck.size > INLINE_MAX) {
        const { upload } = await import("@vercel/blob/client")
        const b = await upload(`${PENDING_PREFIX}${crypto.randomUUID()}/${deck.name.replace(/[^\w.\- ]/g, "_")}`, deck, { access: "private" as any, handleUploadUrl: "/api/public/submit/upload", contentType: deck.type || undefined })
        fd.delete("pitch_deck"); fd.set("deck_blob_url", b.url)
      }
      const r = await fetch(`/api/public/intake/${encodeURIComponent(slug)}`, { method: "POST", body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || "Something went wrong. Please try again.")
      setDone(d.publicRef)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  if (done) return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <h2 className="text-2xl font-semibold">Thank you.</h2>
      <p className="mt-2 text-sm text-muted-foreground">{fundName} has your application. Your reference is <span className="font-mono">{done}</span>. The team reads every submission that fits what they back.</p>
    </div>
  )

  const L = ({ children }: { children: React.ReactNode }) => <span className="text-sm font-medium">{children}</span>
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{headline || `Pitch ${fundName}`}</h1>
        {intro && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{intro}</p>}
      </div>
      <input type="text" name="company_url_confirm" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label><L>Company *</L><input name="company_name" required maxLength={200} className={field} /></label>
        <label><L>Website</L><input name="website" maxLength={300} placeholder="https://" className={field} /></label>
        <label><L>Your name *</L><input name="contact_name" required maxLength={200} className={field} /></label>
        <label><L>Your email *</L><input name="contact_email" type="email" required maxLength={320} className={field} /></label>
      </div>
      <label className="block"><L>What do you do, in one sentence?</L><input name="one_liner" maxLength={400} className={field} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><L>Stage</L><select name="stage" defaultValue="" className={field}><option value="">Select…</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label><L>Sectors (comma separated)</L><input name="sectors" maxLength={300} placeholder="AI, Healthtech" className={field} /></label>
        {form.askLocation && <label><L>Where are you based?</L><input name="location" maxLength={160} className={field} /></label>}
        {form.askRaise && <label><L>Round size you are raising (USD)</L><input name="raise_amount" inputMode="numeric" maxLength={40} className={field} /></label>}
        {form.askRaise && <label><L>What you would like from us (USD)</L><input name="cheque_ask" inputMode="numeric" maxLength={40} className={field} /></label>}
      </div>
      <label className="block"><L>The problem you solve and for whom</L><textarea name="problem" rows={3} maxLength={1500} className={field} /></label>
      {form.askTraction && <label className="block"><L>Traction so far (revenue, users, pilots, growth)</L><textarea name="traction" rows={3} maxLength={1500} className={field} /></label>}
      {form.askTeam && <label className="block"><L>The team and why you</L><textarea name="team" rows={3} maxLength={1500} className={field} /></label>}
      {form.questions.map((q) => (
        <label key={q.id} className="block"><L>{q.label}{q.required ? " *" : ""}</L>
          {q.long ? <textarea name={`q_${q.id}`} rows={3} required={q.required} maxLength={1500} className={field} /> : <input name={`q_${q.id}`} required={q.required} maxLength={1500} className={field} />}
        </label>
      ))}
      <label className="block"><L>Pitch deck (PDF or PowerPoint, up to 25 MB)</L>
        <input name="pitch_deck" type="file" accept=".pdf,.ppt,.pptx" onChange={(e) => setDeckName(e.target.files?.[0]?.name ?? null)} className="mt-1 block w-full text-sm" />
        {deckName && <span className="text-xs text-muted-foreground">{deckName}</span>}
      </label>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="terms_accepted" value="1" required className="mt-0.5" />
        <span>I agree that {fundName} may process this application, including my name, email and the materials I attach, to assess it and to contact me about it. They will keep it only as long as needed for that, and I can ask them to delete it.</span>
      </label>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <button disabled={busy} className="h-10 rounded-md px-5 text-sm font-medium disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{busy ? "Sending…" : "Submit application"}</button>
    </form>
  )
}
