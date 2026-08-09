import type { LucideIcon } from "lucide-react"
import { ArrowRight } from "lucide-react"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"
import { SIGNUP_CTA_VISIBLE } from "@/lib/auth/signups"

export type SolutionContent = {
  eyebrow: string
  title: string
  lede: string
  accent: string
  features: { title: string; desc: string; icon: LucideIcon }[]
  steps: { label: string; body: string }[]
  quote?: { text: string; name: string; role: string }
}

export function SolutionPage({ c }: { c: SolutionContent }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <Navigation />

      {/* Hero */}
      <section className="relative pt-36 lg:pt-44 pb-16 lg:pb-24">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-2.5 mb-6 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <span className="w-2.5 h-2.5" style={{ backgroundColor: c.accent }} />
            {c.eyebrow}
          </div>
          <h1 className="font-serif font-normal text-[clamp(2.5rem,6vw,5rem)] leading-[1.03] tracking-[-0.01em] max-w-4xl text-balance">
            {c.title}
          </h1>
          <p className="mt-6 text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-2xl">{c.lede}</p>
          <div className="mt-9 flex flex-wrap gap-4">
            <a href={SIGNUP_CTA_VISIBLE ? "/register" : "/login"} className="inline-flex items-center gap-2 rounded-full h-12 px-7 text-sm font-medium text-white transition-transform hover:-translate-y-px" style={{ backgroundColor: c.accent }}>
              {SIGNUP_CTA_VISIBLE ? "Get started" : "Sign in"} <ArrowRight className="w-4 h-4" />
            </a>
            <a href="/apply" className="inline-flex items-center gap-2 rounded-full h-12 px-7 text-sm font-medium border border-foreground/20 hover:bg-foreground/5">
              Request a demo
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-foreground/10 py-16 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
            {c.features.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title}>
                  <span className="grid place-items-center w-11 h-11 rounded-lg bg-foreground/[0.06]" style={{ color: c.accent }}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <h3 className="mt-5 font-serif font-normal text-2xl leading-snug">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-foreground/10 py-16 lg:py-24 bg-foreground/[0.015]">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
          <h2 className="font-serif font-normal text-3xl lg:text-4xl tracking-tight mb-12">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {c.steps.map((s, i) => (
              <div key={s.label} className="border-t-2 pt-5" style={{ borderColor: c.accent }}>
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Step {String(i + 1).padStart(2, "0")}</div>
                <h3 className="mt-2 font-medium text-lg">{s.label}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote */}
      {c.quote && (
        <section className="border-t border-foreground/10 py-20 lg:py-28">
          <div className="max-w-3xl mx-auto px-6 lg:px-12 text-center">
            <p className="font-serif font-normal text-2xl lg:text-3xl leading-snug text-balance">“{c.quote.text}”</p>
            <div className="mt-6 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              {c.quote.name} · {c.quote.role}
            </div>
          </div>
        </section>
      )}

      <FooterSection />
    </main>
  )
}
