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
                  <Field label="Min check (USD)">
                    <input name="check_size_min" inputMode="numeric" className={inputCls} placeholder="25000" />
                  </Field>
                  <Field label="Max check (USD)">
                    <input name="check_size_max" inputMode="numeric" className={inputCls} placeholder="500000" />
                  </Field>
                </div>
                <Field label="Use of funds / the ask" hint="What the round unlocks over the next 12–18 months.">
                  <textarea name="ask" maxLength={2000} rows={3} className={inputCls} placeholder="Hire 4 engineers, ship v2, reach $1M ARR..." />
                </Field>
              </Section>

              <Section title="Traction">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Revenue / ARR">
                    <input name="revenue" maxLength={500} className={inputCls} placeholder="$30k MRR, 15% MoM" />
                  </Field>
                  <Field label="Customers / users">
                    <input name="customers" maxLength={500} className={inputCls} placeholder="42 paying customers" />
                  </Field>
                </div>
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

              <div className="flex items-center justify-between gap-4 border-t border-border pt-6">
                <p className="text-xs text-muted-foreground">
                  By submitting you agree to let Anker AI assess your materials and, if matched, share them with
                  relevant investors on your behalf.
                </p>
                <button
                  type="submit" disabled={submitting}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>) : (<>Submit application <ArrowRight className="h-4 w-4" /></>)}
                </button>
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
