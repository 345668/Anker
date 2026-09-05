// Carta-style social proof: a serif trust line, a metric trust-bar (in place of
// a logo wall — attributions stay anonymous, role/metric only), and static
// quote cards with an accent quote-mark.

const TRUST = [
  { value: "60K+", label: "investors & LPs" },
  { value: "20K+", label: "investment firms" },
  { value: "50+", label: "countries" },
  { value: "24/7", label: "AI matching" },
]

const testimonials = [
  { quote: "Anker helped us find investors who truly understood our vision. We closed our seed round in six weeks.", role: "Founder & CEO", metric: "$8M seed round" },
  { quote: "The AI matching saved us months of cold outreach. Every intro was warm and relevant to our space.", role: "Co-Founder", metric: "3× faster close" },
  { quote: "Our LPs can self-serve and our numbers reconcile. That accuracy and clarity is the whole point.", role: "Managing Partner", metric: "$170M AUM" },
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
