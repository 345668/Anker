// Editorial proof points. These remain qualitative until customer permissions,
// attribution, and metric definitions are approved.

const TRUST = [
  { value: "Structured", label: "investor context" },
  { value: "Connected", label: "relationship workflows" },
  { value: "Secure", label: "sharing controls" },
  { value: "AI-native", label: "venture operations" },
]

const testimonials = [
  { quote: "A clear workspace for turning investor context into a focused fundraising process.", role: "Illustrative founder workflow", metric: "Sample" },
  { quote: "One place to connect sourcing, relationships, outreach, and the next action for every conversation.", role: "Illustrative investor workflow", metric: "Sample" },
  { quote: "A practical operating layer for sharing information with the people who need it, when they need it.", role: "Illustrative LP workflow", metric: "Sample" },
]

export function TestimonialsSection() {
  return (
    <section className="relative py-24 lg:py-32 border-t border-foreground/10 bg-foreground/[0.02]">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        <h2 className="text-center font-serif font-normal text-3xl md:text-4xl lg:text-5xl tracking-tight text-balance">
          Trusted by founders and funds building the next decade
        </h2>

        {/* trust bar */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-2xl overflow-hidden">
          {TRUST.map((t) => (
            <div key={t.label} className="bg-background p-6 text-center">
              <div className="font-serif text-3xl lg:text-4xl">{t.value}</div>
              <div className="mt-1 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>

        {/* quote cards */}
        <div className="mt-10 grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <figure key={t.quote} className="relative bg-card/60 border border-foreground/10 rounded-2xl p-7 transition-colors hover:border-foreground/20">
              <span className="absolute -top-3 left-6 grid place-items-center w-8 h-8 bg-[#e5380f] text-white font-serif text-xl leading-none rounded-sm" aria-hidden>
                &rdquo;
              </span>
              <blockquote className="mt-3 text-[15px] leading-relaxed text-foreground">{t.quote}</blockquote>
              <figcaption className="mt-6 pt-5 border-t border-foreground/10 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                {t.role} · <span className="text-foreground">{t.metric}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
