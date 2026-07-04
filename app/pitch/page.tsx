"use client"

/**
 * /pitch — PUBLIC founder pitch intake.
 *
 * Founders drop their startup details + pitch deck; the submission
 * lands as a `sourced` deal on the GP's deal board (deal_opportunities,
 * submitted_via='public_form') for review. No account required.
 */

import { useRef, useState } from "react"
import { ArrowRight, CheckCircle2, Loader2, Upload, Trash2 } from "lucide-react"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"

const SECTORS = [
  "AI / ML", "B2B SaaS", "Fintech", "Health / Bio", "Climate / Energy",
  "Consumer", "Deep tech", "Infrastructure / DevTools", "Marketplace", "Other",
]
const ROUNDS = ["Pre-seed", "Seed", "Series A", "Series B", "Later"]

export default function PitchPage() {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deck, setDeck] = useState<File | null>(null)
  const deckRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true); setError(null)
    try {
      const fd = new FormData(e.currentTarget)
      if (deck) fd.set("deck", deck)
      const res = await fetch("/api/pitch", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Submission failed (${res.status})`)
      setDone(data.reference ?? "ok")
      formRef.current?.reset()
      setDeck(null)
    } catch (err: any) {
      setError(err?.message ?? "Submission failed — please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-32 pb-24">
        <div className="max-w-[760px] mx-auto px-6">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4">
            <span className="w-8 h-px bg-foreground/30" />
            For founders
          </span>
          <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-4">
            Pitch us.
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl">
            Send your deck and the essentials. Every submission goes straight into our
            investment pipeline and gets reviewed by the team — if there&apos;s a fit,
            we&apos;ll reach out.
          </p>

          {done ? (
            <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-4" />
              <h2 className="font-display text-2xl mb-2">Received — thank you.</h2>
              <p className="text-muted-foreground mb-1">
                Your pitch is in our pipeline for review{done !== "ok" ? <> (reference <span className="font-mono">{done}</span>)</> : null}.
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                We read everything. If there&apos;s a fit with our thesis, we&apos;ll be in touch.
              </p>
              <button onClick={() => setDone(null)}
                className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground">
                Submit another startup
              </button>
            </div>
          ) : (
            <form ref={formRef} onSubmit={onSubmit} className="space-y-8">
              {error && (
                <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">{error}</div>
              )}

              {/* Honeypot — hidden from humans */}
              <input type="text" name="company" tabIndex={-1} autoComplete="off"
                className="absolute opacity-0 pointer-events-none h-0 w-0" aria-hidden="true" />

              <section className="space-y-4">
                <h2 className="font-display text-xl">The company</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <F label="Company name *">
                    <input name="companyName" required maxLength={120} className={inp} />
                  </F>
                  <F label="Website">
                    <input name="website" type="url" placeholder="https://…" maxLength={300} className={inp} />
                  </F>
                </div>
                <F label="One-liner — what do you do? *">
                  <input name="oneLiner" required maxLength={300}
                    placeholder="e.g. Stripe for cross-border payroll" className={inp} />
                </F>
                <div className="grid md:grid-cols-2 gap-4">
                  <F label="Sector">
                    <select name="sector" className={inp} defaultValue="">
                      <option value="" disabled>Select…</option>
                      {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </F>
                  <F label="HQ / geography">
                    <input name="geography" maxLength={120} placeholder="e.g. Berlin, DACH" className={inp} />
                  </F>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="font-display text-xl">The round</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <F label="Stage">
                    <select name="roundName" className={inp} defaultValue="">
                      <option value="" disabled>Select…</option>
                      {ROUNDS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </F>
                  <F label="Raise amount (USD)">
                    <input name="raiseAmount" type="number" min="0" step="1000"
                      placeholder="e.g. 2000000" className={`${inp} font-mono`} />
                  </F>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="font-display text-xl">Pitch deck</h2>
                <input ref={deckRef} type="file" accept="application/pdf" className="hidden"
                  onChange={(e) => setDeck(e.target.files?.[0] ?? null)} />
                {!deck ? (
                  <button type="button" onClick={() => deckRef.current?.click()}
                    className="w-full h-24 border-2 border-dashed border-foreground/20 rounded-md hover:border-foreground/40 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <Upload className="w-5 h-5" />
                    <span className="text-sm">Upload your deck</span>
                    <span className="text-[11px] font-mono opacity-60">PDF · max 15 MB</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-foreground/5 rounded-md text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 truncate">
                      <div className="font-medium truncate">{deck.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{(deck.size / 1024 / 1024).toFixed(1)} MB</div>
                    </div>
                    <button type="button" onClick={() => setDeck(null)}
                      className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <h2 className="font-display text-xl">You</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <F label="Your name *">
                    <input name="contactName" required maxLength={120} className={inp} />
                  </F>
                  <F label="Email *">
                    <input name="contactEmail" type="email" required maxLength={200} className={inp} />
                  </F>
                </div>
                <F label="Anything else we should know?">
                  <textarea name="notes" maxLength={2000} rows={4}
                    placeholder="Traction, team background, why now…"
                    className="w-full p-3 rounded-md border border-input bg-background text-sm" />
                </F>
              </section>

              <button type="submit" disabled={submitting}
                className="inline-flex items-center gap-2 rounded-full h-12 px-8 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {submitting ? "Submitting…" : "Submit pitch"}
              </button>
              <p className="text-[11px] text-muted-foreground">
                By submitting you agree we may store and review the materials you share.
                We treat all decks as confidential.
              </p>
            </form>
          )}
        </div>
      </main>

      <FooterSection />
    </div>
  )
}

const inp = "w-full h-11 px-3 rounded-md border border-input bg-background text-sm"

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  )
}
