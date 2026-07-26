"use client";

/**
 * PUBLIC founder application — on the website, not the platform (unauthenticated).
 * Multipart POST to /api/public/submit. Detailed structured fields so the
 * assessment + matching engines and the investor drafts have real signal.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Upload, CheckCircle2, Loader2, FileText } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";

const SECTORS = [
  "AI/ML", "SaaS", "Fintech", "Healthtech", "Biotech", "Climate", "Deeptech",
  "Consumer", "Marketplace", "Developer Tools", "Cybersecurity", "Robotics",
  "Web3", "Hardware", "Enterprise", "Edtech", "Proptech", "Logistics",
];
const STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Growth"];

export default function ApplyPage() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ publicRef: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sectors, setSectors] = useState<string[]>([]);
  const [deckName, setDeckName] = useState<string | null>(null);

  function toggleSector(s: string) {
    setSectors((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length < 5 ? [...cur, s] : cur));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("sectors", sectors.join(","));

    const deck = fd.get("pitch_deck");
    if (!(deck instanceof File) || deck.size === 0) {
      setError("Please attach your pitch deck (PDF or PowerPoint).");
      return;
    }
    if (!fd.get("terms_accepted")) {
      setError("Please accept the community-trial terms to submit.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/submit", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        return;
      }
      setDone({ publicRef: data.publicRef });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:pt-32">
        {done ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center sm:p-12">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            <h1 className="mt-5 text-2xl font-semibold sm:text-3xl">Application received</h1>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Thanks — we&apos;ve got your submission and pitch deck. Your reference is{" "}
              <span className="font-mono font-semibold text-foreground">{done.publicRef}</span>. We&apos;ve
              emailed you a confirmation with what happens next.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={`/apply/status/${done.publicRef}`}
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted"
              >
                Track your status <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                Back to home
              </Link>
            </div>
          </div>
        ) : (
          <>
            <header className="mb-9">
              <p className="text-sm font-medium uppercase tracking-wide text-primary">For founders</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Submit your startup for investor outreach</h1>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Tell us about your company and share your deck. If it&apos;s a strong fit, our engine matches you
                against our investor network and runs warm, personalized outreach on your behalf — and alerts you
                the moment an investor is interested. The more detail you give, the sharper the matches.
              </p>
            </header>

            {error && (
              <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-9">
              {/* Honeypot — hidden from humans, catches bots */}
              <input
                type="text" name="company_url_confirm" tabIndex={-1} autoComplete="off"
                className="hidden" aria-hidden="true"
              />

              <Section title="Company">
                <Field label="Startup name" required>
                  <input name="startup_name" required maxLength={200} className={inputCls} placeholder="Acme Robotics" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Website">
                    <input name="website" maxLength={500} className={inputCls} placeholder="https://acme.com" />
                  </Field>
                  <Field label="Location">
                    <input name="location" maxLength={200} className={inputCls} placeholder="Berlin, Germany" />
                  </Field>
                </div>
                <Field label="One-liner" hint="What you do, in a sentence.">
                  <input name="one_liner" maxLength={400} className={inputCls} placeholder="Autonomous warehouse robots for mid-size 3PLs." />
                </Field>
                <Field label="Keywords / what makes you different" hint="Comma-separated. Used to match you to investors' theses.">
                  <input name="thesis_keywords" maxLength={400} className={inputCls} placeholder="computer vision, warehouse automation, 3PL, robotics" />
                </Field>
                <Field label="Where do you want investors?" hint="Regions/countries. Comma-separated. Defaults to your location.">
                  <input name="target_regions" maxLength={300} className={inputCls} placeholder="US, Europe, DACH" />
                </Field>
                <Field label="Sectors" hint="Pick up to 5.">
                  <div className="flex flex-wrap gap-2">
                    {SECTORS.map((s) => (
                      <button
                        type="button" key={s} onClick={() => toggleSector(s)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          sectors.includes(s)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-foreground/40"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Stage" required>
                  <div className="flex flex-wrap gap-2">
                    {STAGES.map((s, i) => (
                      <label key={s} className="cursor-pointer">
                        <input type="radio" name="stage" value={s} required={i === 0} className="peer sr-only" />
                        <span className="inline-block rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary hover:border-foreground/40">
                          {s}
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>
              </Section>

              <Section title="The round">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Raising (USD)">
                    <input name="raise_amount" inputMode="numeric" className={inputCls} placeholder="2000000" />
                  </Field>
                  <Field label="Pre-money valuation (USD)">
                    <input name="valuation" inputMode="numeric" className={inputCls} placeholder="10000000" />
                  </Field>
                  <Field label="Raised to date (USD)">
                    <input name="raised_to_date" inputMode="numeric" className={inputCls} placeholder="250000" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Min check (USD)">
                    <input name="check_size_min" inputMode="numeric" className={inputCls} placeholder="25000" />
                  </Field>
                  <Field label="Max check (USD)">
                    <input name="check_size_max" inputMode="numeric" className={inputCls} placeholder="500000" />
                  </Field>
                </div>
                <Field label="Use of funds" hint="How you'll spend the raise (breakdown helps).">
                  <textarea name="ask" maxLength={2000} rows={2} className={inputCls} placeholder="40% engineering, 30% GTM, 20% clinical validation, 10% ops." />
                </Field>
                <Field label="Milestones this round unlocks" hint="What you'll have proven by the next raise.">
                  <textarea name="milestones" maxLength={1000} rows={2} className={inputCls} placeholder="Ship v2, 10 paying customers, $1M ARR, FDA pre-sub complete." />
                </Field>
              </Section>

              <Section title="Traction & team">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="ARR (USD)" hint="Annual recurring revenue.">
                    <input name="arr" inputMode="numeric" className={inputCls} placeholder="360000" />
                  </Field>
                  <Field label="MRR (USD)">
                    <input name="mrr" inputMode="numeric" className={inputCls} placeholder="30000" />
                  </Field>
                  <Field label="MoM growth %">
                    <input name="growth_mom" inputMode="numeric" className={inputCls} placeholder="15" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Team size">
                    <input name="team_size" inputMode="numeric" className={inputCls} placeholder="6" />
                  </Field>
                  <Field label="Founded year">
                    <input name="founded_year" inputMode="numeric" className={inputCls} placeholder="2024" />
                  </Field>
                  <Field label="Customers / users">
                    <input name="customers" maxLength={500} className={inputCls} placeholder="42 paying customers" />
                  </Field>
                </div>
                <Field label="Evidence of demand" hint="Pilots, LOIs, design partners, waitlist, technical/clinical validation.">
                  <textarea name="traction_evidence" maxLength={1500} rows={2} className={inputCls} placeholder="3 signed pilots with mid-size hospitals; LOI from a national lab; 200-name waitlist." />
                </Field>
              </Section>

              <Section title="Team">
                <p className="-mt-1 text-xs text-muted-foreground">
                  Founder credibility is a major factor in matching — who&apos;s building this, and why you.
                </p>
                <Field label="Founders & key team" hint="Names, roles, and one-line backgrounds.">
                  <textarea name="team" maxLength={1500} rows={3} className={inputCls} placeholder="Jane Doe (CEO) — ex-Amazon Robotics lead. John Roe (CTO) — PhD CV, 20 patents." />
                </Field>
                <Field label="Prior experience / exits" hint="Relevant domain experience, prior startups, notable outcomes.">
                  <textarea name="prior_experience" maxLength={1000} rows={2} className={inputCls} placeholder="Founders' 2nd company; first was acquired by X. 10 yrs in the domain." />
                </Field>
              </Section>

              <Section title="Details">
                <p className="-mt-1 text-xs text-muted-foreground">
                  We read these from your deck automatically — but filling them in ensures your matches and assessment
                  are accurate even if we can&apos;t parse the deck.
                </p>
                <Field label="Problem you solve">
                  <textarea name="problem" maxLength={1500} rows={2} className={inputCls} placeholder="Mid-size 3PLs can't afford warehouse automation and lose 20% throughput to manual picking." />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Market size (TAM)">
                    <input name="market_size" maxLength={300} className={inputCls} placeholder="$12B warehouse automation by 2030" />
                  </Field>
                  <Field label="Why now?" hint="What makes this the moment.">
                    <input name="why_now" maxLength={300} className={inputCls} placeholder="Vision models finally cheap enough for real-time picking." />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Product stage">
                    <input name="product_stage" maxLength={200} className={inputCls} placeholder="Live with 3 customers / MVP / prototype" />
                  </Field>
                  <Field label="Business model">
                    <input name="business_model" maxLength={300} className={inputCls} placeholder="Robotics-as-a-service, $4k/robot/mo" />
                  </Field>
                </div>
                <Field label="Differentiation, moat & IP">
                  <textarea name="competition" maxLength={1000} rows={2} className={inputCls} placeholder="vs. Locus/6River — 60% lower cost via commodity hardware + proprietary vision; 2 patents filed." />
                </Field>
                <Field label="Founder background" hint="If different from the Team section above.">
                  <textarea name="founder_bio" maxLength={1000} rows={2} className={inputCls} placeholder="Ex-Amazon Robotics lead; PhD in CV; 2nd-time founder (prior exit)." />
                </Field>
              </Section>

              <Section title="Founder">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name" required>
                    <input name="founder_name" required maxLength={200} className={inputCls} placeholder="Jane Founder" />
                  </Field>
                  <Field label="Your title">
                    <input name="founder_title" maxLength={200} className={inputCls} placeholder="CEO & Co-founder" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email" required>
                    <input type="email" name="founder_email" required maxLength={320} className={inputCls} placeholder="jane@acme.com" />
                  </Field>
                  <Field label="LinkedIn">
                    <input name="founder_linkedin" maxLength={500} className={inputCls} placeholder="https://linkedin.com/in/..." />
                  </Field>
                </div>
              </Section>

              <Section title="Materials">
                <Field label="Pitch deck" required hint="PDF or PowerPoint, up to 25 MB.">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4 hover:border-foreground/40">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {deckName ? <span className="text-foreground">{deckName}</span> : "Click to upload your deck"}
                    </span>
                    <input
                      type="file" name="pitch_deck" required accept=".pdf,.ppt,.pptx"
                      className="sr-only"
                      onChange={(e) => setDeckName(e.target.files?.[0]?.name ?? null)}
                    />
                  </label>
                </Field>
                <Field label="Data room (optional)" hint="Financials, metrics, cap table — up to 8 files.">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 hover:border-foreground/40">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Add supporting files</span>
                    <input type="file" name="data_room" multiple accept=".pdf,.ppt,.pptx,.xlsx,.csv,.doc,.docx" className="sr-only" />
                  </label>
                </Field>
              </Section>

              <div className="space-y-4 border-t border-border pt-6">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
                  <input
                    type="checkbox" name="terms_accepted" required
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary,#2563eb)]"
                  />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Community trial &mdash; terms of participation.</span>{" "}
                    Anker AI is running this founder&ndash;investor matching as a <strong>community trial event</strong>.
                    By submitting, I confirm I am authorized to share the company information and pitch deck provided, and
                    I agree that Anker AI may (a) assess my submission using automated tools, and (b) if it is assessed as
                    a fit, share my submission and pitch deck with relevant investors on my behalf as part of this trial.
                    Participation is provided on an &ldquo;as is&rdquo; basis with no guarantee of investor interest,
                    introductions, or funding. Materials are handled confidentially and are not sold. I have read and
                    accept the{" "}
                    <a href="/terms" target="_blank" className="text-primary underline">Terms</a> and{" "}
                    <a href="/privacy" target="_blank" className="text-primary underline">Privacy Policy</a>, and I may
                    request removal of my submission at any time by emailing vc@an-ker.de.
                  </span>
                </label>
                <div className="flex justify-end">
                  <button
                    type="submit" disabled={submitting}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>) : (<>Submit application <ArrowRight className="h-4 w-4" /></>)}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </main>
      <FooterSection />
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">
        {label} {required && <span className="text-primary">*</span>}
        {hint && <span className="ml-2 font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
