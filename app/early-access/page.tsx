"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { submitEarlyAccessRequest } from "./actions";

const personas = [
  { value: "founder", label: "Founder raising a round" },
  { value: "investor", label: "Investor / VC" },
  { value: "lp", label: "Limited Partner (LP)" },
  { value: "other", label: "Other" },
];

const perks = [
  { title: "Priority onboarding", body: "Skip the queue and get set up ahead of general availability." },
  { title: "A dedicated setup session", body: "Work 1:1 with the Anker team to tailor the platform to your raise." },
  { title: "Founding-user pricing", body: "Lock in early pricing that stays with you as we grow." },
];

const inputCls =
  "w-full rounded-lg border border-foreground/15 bg-foreground/[0.03] px-4 py-3 text-foreground placeholder:text-muted-foreground/70 transition-colors hover:border-foreground/30 focus:border-foreground focus:bg-foreground/[0.05] focus:outline-none focus:ring-1 focus:ring-foreground/30";
const labelCls = "mb-2 block font-mono text-xs uppercase tracking-wide text-muted-foreground";

export default function EarlyAccessPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    persona: "",
    company: "",
    role: "",
    website: "",
    stage: "",
    useCase: "",
    heardFrom: "",
    referralSource: "",
  });
  const [isPending, startTransition] = useTransition();
  const [submitStatus, setSubmitStatus] = useState<{ success: boolean; message: string } | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (heroRef.current) observer.observe(heroRef.current);
    // Fallback: guarantee the hero reveals even if the observer never fires.
    const t = setTimeout(() => setIsVisible(true), 400);
    return () => {
      observer.disconnect();
      clearTimeout(t);
    };
  }, []);

  // Capture where the visitor came from (e.g. the LinkedIn Page button) so we
  // can attribute requests. Supports ?src= or ?utm_source=.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const src = params.get("src") || params.get("utm_source");
      if (src) setFormData((f) => ({ ...f, referralSource: src.slice(0, 120) }));
    } catch {
      /* no-op */
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus(null);
    startTransition(async () => {
      const result = await submitEarlyAccessRequest(formData);
      setSubmitStatus(result);
      if (result.success) {
        setFormData({
          name: "", email: "", persona: "", company: "", role: "",
          website: "", stage: "", useCase: "", heardFrom: "",
          referralSource: formData.referralSource,
        });
        // Bring the confirmation into view on smaller screens.
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  const submitted = submitStatus?.success;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero */}
      <section ref={heroRef} className="relative overflow-hidden pt-32 pb-10 lg:pt-40 lg:pb-14 text-center">
        {/* subtle brand dot-grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
            maskImage: "linear-gradient(to bottom, black, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-6">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/[0.03] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Invite-only · Early access
          </span>
          <h1 className="mb-6 font-serif text-5xl tracking-tight md:text-6xl lg:text-7xl">
            {["Request", "early", "access"].map((word, i) => (
              <span
                key={word}
                className={`mr-4 inline-block transition-all duration-700 last:mr-0 ${
                  isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                {word}
              </span>
            ))}
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Anker is rolling out to founders, VCs, and LPs in waves. Tell us a little about
            yourself and we&apos;ll reach out when your access is ready.
          </p>
        </div>
      </section>

      {/* Form + perks */}
      <section className="pb-20 lg:pb-28">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
            {/* Form card */}
            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 sm:p-8 lg:p-10">
                {submitted ? (
                  /* ── Success state ── */
                  <div className="flex flex-col items-center py-10 text-center">
                    <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/30">
                      <Check className="h-7 w-7 text-green-600" />
                    </div>
                    <h2 className="mb-3 font-serif text-3xl">You&apos;re on the list</h2>
                    <p className="mb-8 max-w-md text-muted-foreground">{submitStatus?.message}</p>
                    <div className="flex flex-col items-center gap-3 sm:flex-row">
                      <Link
                        href="/fundraising-guide"
                        className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                      >
                        Read the fundraising guide
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setSubmitStatus(null)}
                        className="rounded-full border border-foreground/20 px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                      >
                        Submit another request
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Form ── */
                  <>
                    <h2 className="mb-1 font-serif text-2xl">Tell us about yourself</h2>
                    <p className="mb-8 text-sm text-muted-foreground">
                      Fields marked <span className="text-foreground">*</span> are required.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid gap-6 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Name *</label>
                          <input
                            type="text" required value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className={inputCls} placeholder="Your name"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Work email *</label>
                          <input
                            type="email" required value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className={inputCls} placeholder="you@company.com"
                          />
                        </div>
                      </div>

                      <div className="grid gap-6 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>I am a *</label>
                          <div className="relative">
                            <select
                              required value={formData.persona}
                              onChange={(e) => setFormData({ ...formData, persona: e.target.value })}
                              className={`${inputCls} appearance-none pr-10 ${formData.persona ? "" : "text-muted-foreground/70"}`}
                            >
                              <option value="" className="bg-background">Select…</option>
                              {personas.map((p) => (
                                <option key={p.value} value={p.value} className="bg-background text-foreground">
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        </div>
                        <div>
                          <label className={labelCls}>Company / Fund</label>
                          <input
                            type="text" value={formData.company}
                            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                            className={inputCls} placeholder="Your company or fund"
                          />
                        </div>
                      </div>

                      <div className="grid gap-6 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Role / Title</label>
                          <input
                            type="text" value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            className={inputCls} placeholder="e.g. CEO, Partner, Principal"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Website or LinkedIn</label>
                          <input
                            type="text" value={formData.website}
                            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                            className={inputCls} placeholder="https://"
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelCls}>
                          Stage <span className="lowercase text-muted-foreground/60">— round stage, fund stage, or AUM (optional)</span>
                        </label>
                        <input
                          type="text" value={formData.stage}
                          onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                          className={inputCls} placeholder="e.g. Raising Seed · Series A · $50M Fund II"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>What do you want to use Anker for?</label>
                        <textarea
                          rows={4} value={formData.useCase}
                          onChange={(e) => setFormData({ ...formData, useCase: e.target.value })}
                          className={`${inputCls} resize-none`}
                          placeholder="Tell us a bit about what you're working on and how Anker could help."
                        />
                      </div>

                      <div>
                        <label className={labelCls}>
                          How did you hear about us? <span className="lowercase text-muted-foreground/60">(optional)</span>
                        </label>
                        <input
                          type="text" value={formData.heardFrom}
                          onChange={(e) => setFormData({ ...formData, heardFrom: e.target.value })}
                          className={inputCls} placeholder="LinkedIn, a friend, an event…"
                        />
                      </div>

                      <div className="pt-1">
                        <button
                          type="submit" disabled={isPending}
                          className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-8 py-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                          {isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                          ) : (
                            <>Request access <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>
                          )}
                        </button>

                        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Takes ~30 seconds</span>
                          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> No spam — we only email about your access</span>
                        </p>

                        {submitStatus && !submitStatus.success && (
                          <p className="mt-4 text-sm text-red-500">{submitStatus.message}</p>
                        )}
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>

            {/* Perks / reassurance */}
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-28">
                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-6 sm:p-8">
                  <h2 className="mb-6 font-serif text-2xl">What you get</h2>
                  <ul className="space-y-5">
                    {perks.map((perk) => (
                      <li key={perk.title} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                          <Check className="h-3.5 w-3.5 text-foreground" />
                        </span>
                        <div>
                          <div className="font-medium text-foreground">{perk.title}</div>
                          <div className="text-sm text-muted-foreground">{perk.body}</div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8 border-t border-foreground/10 pt-6">
                    <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                      Built for
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      Founders · Venture funds · Limited Partners
                    </p>
                  </div>
                </div>

                <p className="mt-6 px-1 text-sm text-muted-foreground">
                  Already have an invite?{" "}
                  <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
                    Sign in
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}

/** Small inline chevron so we don't depend on select's native arrow styling. */
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
