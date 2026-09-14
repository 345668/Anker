"use client"
import Link from "next/link"
import { useRef, useState, type FormEvent } from "react"
import { ArrowRight, Check } from "lucide-react"
import { submitEarlyAccessRequest } from "@/app/early-access/actions"
import type { WaitlistInput } from "@/lib/marketing/waitlist"

const inputClass = "mt-2 min-h-12 w-full rounded-none border border-foreground/30 bg-background px-3 text-base text-foreground outline-offset-4 focus:outline-2 focus:outline-foreground"
export function WaitlistForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const pending = useRef(false)
  const status = useRef<HTMLDivElement>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const form = new FormData(event.currentTarget)
    if (form.get("consent") !== "on") { setError("Confirm that we may email you about access."); return }
    pending.current = true; setBusy(true); setError("")
    const params = new URLSearchParams(window.location.search)
    const attribution = ["utm_source", "utm_medium", "utm_campaign"].map(key => (params.get(key) || "").slice(0, 60)).filter(Boolean).join(" / ")
    try {
      const result = await submitEarlyAccessRequest({
        name: String(form.get("name") || ""), email: String(form.get("email") || ""),
        persona: String(form.get("persona") || "") as WaitlistInput["persona"],
        company: String(form.get("company") || ""), website: String(form.get("website") || ""),
        consent: true, referralSource: attribution || (params.get("source") || "waitlist").slice(0, 200),
      })
      if (result.success) { setSuccess(true); requestAnimationFrame(() => status.current?.focus()) }
      else setError(result.message)
    } catch { setError("We couldn’t save your request. Check your connection and try again.") }
    finally { pending.current = false; setBusy(false) }
  }
  if (success) return <div ref={status} tabIndex={-1} role="status" className="border-t border-foreground/30 py-10 outline-offset-4">
    <Check aria-hidden="true" className="mb-6 size-8" />
    <h2 className="font-serif text-4xl">You’re on the list.</h2>
    <p className="mt-5 leading-relaxed text-muted-foreground">We’ll email you when access is available for you. No account has been created yet.</p>
    <Link href="/products/discover" className="mt-8 inline-flex min-h-12 items-center gap-3 underline underline-offset-4">Explore investor discovery <ArrowRight aria-hidden="true" className="size-4" /></Link>
  </div>
  return <form onSubmit={submit} aria-busy={busy} className="border-t border-foreground/30 pt-8">
    <h2 className="font-serif text-3xl">Join the waitlist</h2>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Tell us a little about yourself. We’ll contact you about access.</p>
    <fieldset disabled={busy} className="mt-8 space-y-5 disabled:opacity-60">
      <legend className="sr-only">Your access request</legend>
      <div><label htmlFor="waitlist-name" className="text-sm">Full name <span aria-hidden="true">*</span></label><input id="waitlist-name" name="name" autoComplete="name" required maxLength={120} className={inputClass} /></div>
      <div><label htmlFor="waitlist-email" className="text-sm">Email address <span aria-hidden="true">*</span></label><input id="waitlist-email" name="email" type="email" autoComplete="email" required maxLength={254} className={inputClass} /></div>
      <div><label htmlFor="waitlist-persona" className="text-sm">I’m joining as <span aria-hidden="true">*</span></label><select id="waitlist-persona" name="persona" required defaultValue="" className={inputClass}><option value="" disabled>Select your role</option><option value="founder">Founder</option><option value="investor">Investor / venture fund</option><option value="lp">Limited partner</option><option value="other">Other</option></select></div>
      <div><label htmlFor="waitlist-company" className="text-sm">Company or fund <span className="text-muted-foreground">(optional)</span></label><input id="waitlist-company" name="company" autoComplete="organization" maxLength={160} className={inputClass} /></div>
      <div hidden aria-hidden="true"><label htmlFor="waitlist-website">Leave this empty</label><input id="waitlist-website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <div className="flex items-start gap-3 py-2"><input id="waitlist-consent" name="consent" type="checkbox" required className="mt-1 size-5 shrink-0 accent-foreground" /><label htmlFor="waitlist-consent" className="text-sm leading-relaxed">Email me about Anker access. I’ve read the <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.</label></div>
      {error && <p role="alert" className="border-l-2 border-red-600 pl-3 text-sm">{error} <Link href="/contact" className="underline">Contact us</Link></p>}
      <button type="submit" disabled={busy} className="flex min-h-14 w-full items-center justify-between gap-4 bg-foreground px-5 text-background transition-opacity hover:opacity-85 disabled:cursor-wait">{busy ? "Saving your request…" : "Join the waitlist"}<ArrowRight aria-hidden="true" className="size-5" /></button>
      <p className="text-xs leading-relaxed text-muted-foreground">No payment details. Access is by invitation. Fields marked * are required.</p>
    </fieldset>
  </form>
}
