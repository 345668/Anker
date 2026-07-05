"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { Check, X, ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"
import { cn } from "@/lib/utils"
import { SIGNUPS_ENABLED } from "@/lib/auth/signups"

const tiers = [
  {
    name: "Founder",
    eyebrow: "Solo & pre-seed",
    monthly: 0,
    yearly: 0,
    cta: "Start free",
    href: "/auth/sign-up",
    popular: false,
    features: [
      { label: "AI investor matching (50 / mo)", included: true },
      { label: "Live cap table modeler", included: true },
      { label: "Runway calculator", included: true },
      { label: "Pitch deck storage (1 deck)", included: true },
      { label: "Outreach templates", included: true },
      { label: "Term sheet analyzer", included: false },
      { label: "Data room (encrypted)", included: false },
      { label: "Team seats", included: false },
      { label: "Slack/email support", included: false },
    ],
  },
  {
    name: "Raise",
    eyebrow: "Active fundraise",
    monthly: 99,
    yearly: 79,
    cta: "Start 14-day trial",
    href: "/auth/sign-up?plan=raise",
    popular: true,
    features: [
      { label: "AI investor matching (unlimited)", included: true },
      { label: "Live cap table modeler", included: true },
      { label: "Runway calculator + scenarios", included: true },
      { label: "Pitch deck storage (10 decks)", included: true },
      { label: "Outreach templates + sequences", included: true },
      { label: "Term sheet analyzer", included: true },
      { label: "Data room (encrypted)", included: true },
      { label: "Up to 5 team seats", included: true },
      { label: "Slack & email support", included: true },
    ],
  },
  {
    name: "Scale",
    eyebrow: "Series A+",
    monthly: 299,
    yearly: 239,
    cta: "Talk to sales",
    href: "/contact",
    popular: false,
    features: [
      { label: "Everything in Raise", included: true },
      { label: "LP & investor CRM", included: true },
      { label: "Pipeline forecasting", included: true },
      { label: "Custom deal stages", included: true },
      { label: "Advanced analytics", included: true },
      { label: "API access + webhooks", included: true },
      { label: "SSO + SCIM", included: true },
      { label: "Unlimited team seats", included: true },
      { label: "Dedicated success manager", included: true },
    ],
  },
]

const compareGroups = [
  {
    name: "Investor matching",
    rows: [
      { label: "AI-matched investors / mo", values: ["50", "Unlimited", "Unlimited"] },
      { label: "Match accuracy score", values: ["✓", "✓", "✓"] },
      { label: "Investor enrichment", values: ["Basic", "Full", "Full + custom"] },
      { label: "Warm-intro paths", values: ["—", "✓", "✓"] },
    ],
  },
  {
    name: "Fundraising tools",
    rows: [
      { label: "Cap table & dilution", values: ["✓", "✓", "✓"] },
      { label: "Runway scenarios", values: ["1 scenario", "3 scenarios", "Unlimited"] },
      { label: "Term sheet analyzer", values: ["—", "✓", "✓"] },
      { label: "Pitch deck AI review", values: ["—", "✓", "✓"] },
    ],
  },
  {
    name: "Workspace",
    rows: [
      { label: "Team seats", values: ["1", "5", "Unlimited"] },
      { label: "Data room", values: ["—", "10 GB", "Unlimited"] },
      { label: "Document e-sign", values: ["—", "✓", "✓"] },
      { label: "Custom branding", values: ["—", "—", "✓"] },
    ],
  },
  {
    name: "Security & support",
    rows: [
      { label: "SOC 2 Type II", values: ["✓", "✓", "✓"] },
      { label: "SSO / SAML", values: ["—", "—", "✓"] },
      { label: "Priority support", values: ["—", "✓", "✓"] },
      { label: "SLA", values: ["—", "—", "99.9%"] },
    ],
  },
]

const faqs = [
  {
    q: "Can I switch plans mid-fundraise?",
    a: "Yes — upgrade or downgrade any time. We prorate the difference and credit unused days. Most founders start on Founder, jump to Raise when they kick off the round, and move to Scale post-close.",
  },
  {
    q: "Do you take equity or success fees?",
    a: "No. Anker is a SaaS subscription. We don't take equity, charge success fees, or earn referrals from investors. You own every relationship outright.",
  },
  {
    q: "What counts as a 'match' on the Founder plan?",
    a: "A match is an AI-scored investor surfaced in your discover feed. Browsing your saved list, sending outreach, and tracking responses are all unlimited.",
  },
  {
    q: "Is my data shared with investors?",
    a: "Never. Your cap table, runway, deck, and notes are private to your team. Investors only see what you explicitly share via a data room link.",
  },
  {
    q: "Do you offer non-profit / accelerator pricing?",
    a: "Yes. YC, Techstars, On Deck, and 80+ partner accelerators get 50% off Raise for 12 months. Email partnerships@anker.com.",
  },
]

export default function PricingPage() {
  const [yearly, setYearly] = useState(true)

  return (
    <div className="min-h-screen bg-background noise-overlay">
      <Navigation />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative py-24 lg:py-32 overflow-hidden">
          {/* Grid */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute h-px bg-foreground/10"
                style={{ top: `${12.5 * (i + 1)}%`, left: 0, right: 0 }}
              />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute w-px bg-foreground/10"
                style={{ left: `${8.33 * (i + 1)}%`, top: 0, bottom: 0 }}
              />
            ))}
          </div>
          <div className="relative max-w-[1400px] mx-auto px-6 lg:px-12 text-center">
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Pricing
              <span className="w-8 h-px bg-foreground/30" />
            </span>
            <h1 className="text-[clamp(3rem,9vw,8rem)] font-display leading-[0.9] tracking-tight mb-8">
              Simple, fair,
              <br />
              founder-first.
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
              No equity. No success fees. No hidden cost-per-match. Pick the plan that
              matches the stage you&apos;re in.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-1 p-1 border border-foreground/10 rounded-full">
              <button
                onClick={() => setYearly(false)}
                className={cn(
                  "px-5 h-10 rounded-full text-sm font-medium transition-colors",
                  !yearly ? "bg-foreground text-background" : "text-muted-foreground"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                className={cn(
                  "px-5 h-10 rounded-full text-sm font-medium transition-colors flex items-center gap-2",
                  yearly ? "bg-foreground text-background" : "text-muted-foreground"
                )}
              >
                Yearly
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider",
                    yearly ? "bg-background/20 text-background" : "bg-emerald-500/10 text-emerald-600"
                  )}
                >
                  −20%
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Tiers */}
        <section className="pb-24 lg:pb-32">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <div className="grid md:grid-cols-3 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={cn(
                    "bg-background p-8 lg:p-10 flex flex-col",
                    tier.popular && "bg-foreground text-background"
                  )}
                >
                  <div className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-wider",
                          tier.popular ? "text-background/60" : "text-muted-foreground"
                        )}
                      >
                        {tier.eyebrow}
                      </span>
                      {tier.popular && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background/15 font-mono text-[10px] uppercase tracking-wider">
                          <Sparkles className="w-3 h-3" />
                          Most picked
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-3xl mb-6">{tier.name}</h2>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-display">
                        ${yearly ? tier.yearly : tier.monthly}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-mono",
                          tier.popular ? "text-background/60" : "text-muted-foreground"
                        )}
                      >
                        /mo
                      </span>
                    </div>
                    {tier.monthly > 0 && yearly && (
                      <p
                        className={cn(
                          "mt-2 text-xs font-mono",
                          tier.popular ? "text-background/60" : "text-muted-foreground"
                        )}
                      >
                        Billed ${tier.yearly * 12}/yr
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-10 flex-1">
                    {tier.features.map((f) => (
                      <li key={f.label} className="flex items-start gap-3 text-sm">
                        {f.included ? (
                          <Check
                            className={cn(
                              "w-4 h-4 shrink-0 mt-0.5",
                              tier.popular ? "text-background" : "text-emerald-600"
                            )}
                          />
                        ) : (
                          <X
                            className={cn(
                              "w-4 h-4 shrink-0 mt-0.5",
                              tier.popular ? "text-background/30" : "text-muted-foreground/40"
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            f.included
                              ? tier.popular
                                ? "text-background"
                                : "text-foreground"
                              : tier.popular
                              ? "text-background/40 line-through"
                              : "text-muted-foreground/60 line-through"
                          )}
                        >
                          {f.label}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    size="lg"
                    className={cn(
                      "h-12 rounded-full group",
                      tier.popular
                        ? "bg-background text-foreground hover:bg-background/90"
                        : "bg-foreground text-background hover:bg-foreground/90"
                    )}
                  >
                    <Link href={SIGNUPS_ENABLED ? tier.href : "/contact"}>
                      {SIGNUPS_ENABLED ? tier.cta : "Contact us"}
                      <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="py-24 lg:py-32 border-t border-foreground/10">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <div className="max-w-3xl mb-16">
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
                <span className="w-8 h-px bg-foreground/30" />
                Compare
              </span>
              <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-6">
                Every feature,
                <br />
                line by line.
              </h2>
            </div>

            <div className="overflow-x-auto rounded-lg border border-foreground/10">
              <table className="w-full">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="text-left p-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-2/5">
                      Feature
                    </th>
                    {tiers.map((t) => (
                      <th
                        key={t.name}
                        className="text-left p-4 font-display text-base"
                      >
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareGroups.map((g) => (
                    <Fragment key={g.name}>
                      <tr className="border-t border-foreground/10 bg-foreground/[0.02]">
                        <td
                          colSpan={4}
                          className="p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                        >
                          {g.name}
                        </td>
                      </tr>
                      {g.rows.map((r) => (
                        <tr
                          key={r.label}
                          className="border-t border-foreground/5 text-sm"
                        >
                          <td className="p-4 text-muted-foreground">{r.label}</td>
                          {r.values.map((v, i) => (
                            <td key={i} className="p-4 font-mono">
                              {v === "✓" ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : v === "—" ? (
                                <span className="text-muted-foreground/40">—</span>
                              ) : (
                                v
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 lg:py-32 border-t border-foreground/10">
          <div className="max-w-[1000px] mx-auto px-6 lg:px-12">
            <div className="mb-16">
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
                <span className="w-8 h-px bg-foreground/30" />
                FAQ
              </span>
              <h2 className="text-4xl lg:text-6xl font-display tracking-tight">
                Questions,
                <br />
                answered.
              </h2>
            </div>

            <div className="space-y-px bg-foreground/10 rounded-lg overflow-hidden border border-foreground/10">
              {faqs.map((f, i) => (
                <details
                  key={i}
                  className="bg-background group p-6 lg:p-8 [&_summary]:cursor-pointer"
                >
                  <summary className="flex items-center justify-between gap-4 list-none">
                    <h3 className="font-display text-xl">{f.q}</h3>
                    <span className="font-mono text-2xl text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-muted-foreground leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 lg:py-32 bg-foreground text-background">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12 text-center">
            <h2 className="text-5xl lg:text-7xl font-display tracking-tight leading-[0.95] mb-6">
              Start free.
              <br />
              Upgrade when you raise.
            </h2>
            <p className="text-xl text-background/70 max-w-xl mx-auto mb-10">
              No credit card. No commitment. Built by founders who know the round.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="bg-background hover:bg-background/90 text-foreground px-8 h-14 text-base rounded-full group"
              >
                <Link href={SIGNUPS_ENABLED ? "/auth/sign-up" : "/auth/login"}>
                  {SIGNUPS_ENABLED ? "Start free" : "Sign in"}
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 px-8 text-base rounded-full border-background/20 text-background hover:bg-background/10"
              >
                <Link href="/contact">Talk to sales</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <FooterSection />
    </div>
  )
}
