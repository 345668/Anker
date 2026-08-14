import Link from "next/link"
import { ArrowRight, ArrowUpRight, Download, FileText, Sparkles, Lock } from "lucide-react"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"

export const metadata = {
  title: "Pitch Deck Templates — Anker",
  description: "Battle-tested pitch deck templates for every stage and sector. Pre-seed through Series B, B2B SaaS, fintech, climate, healthtech, marketplaces.",
}

const templates = [
  {
    stage: "Pre-seed",
    slides: 10,
    title: "First-cheque deck",
    body: "For when you have a deck of clarity but no metrics yet. Maximises team + insight + market, minimises everything you can't prove.",
    used: "Used to raise $2M+ at the pre-seed stage",
  },
  {
    stage: "Seed",
    slides: 12,
    title: "Seed deck",
    body: "Earliest traction is here — first 10 customers, early ARR, design partners. The 'why now' slide does the heaviest lifting.",
    used: "Median round size $3.5M",
  },
  {
    stage: "Series A",
    slides: 16,
    title: "Series A deck",
    body: "Repeatable acquisition + unit economics + team scaling. The deck shifts from 'why this could work' to 'why this is working.'",
    used: "Median round size $12M",
  },
  {
    stage: "Series B",
    slides: 18,
    title: "Growth deck",
    body: "Quarterly cohorts, NDR, payback period, channel mix. Heavy on financial detail; light on origin story.",
    used: "Median round size $35M",
  },
]

const sectorDecks = [
  { sector: "B2B SaaS", note: "ARR growth, NDR, payback, ACV ladder" },
  { sector: "Fintech", note: "Unit economics, regulatory posture, take-rate" },
  { sector: "Climate / Energy", note: "LCOE, deployment pipeline, policy tailwinds" },
  { sector: "Healthtech", note: "Reimbursement, clinical evidence, regulatory path" },
  { sector: "Marketplaces", note: "Liquidity, take-rate, supply / demand balance" },
  { sector: "Consumer", note: "Cohort retention, CAC payback, brand metrics" },
  { sector: "Dev tools", note: "Adoption funnel, free-to-paid, GTM motion" },
  { sector: "AI / ML", note: "Defensibility, data flywheel, inference economics" },
]

const slideOrder = [
  { n: "01", title: "Title", note: "Company name, one-line pitch, your name + role + email" },
  { n: "02", title: "Problem", note: "Framed how the customer would describe it" },
  { n: "03", title: "Solution", note: "What you've built — concrete, not abstract" },
  { n: "04", title: "Why now", note: "What's true today that wasn't 5 years ago?" },
  { n: "05", title: "Market", note: "TAM bottom-up; show the math" },
  { n: "06", title: "Product", note: "Screenshots > diagrams" },
  { n: "07", title: "Traction", note: "Strongest proof first" },
  { n: "08", title: "Business model", note: "How you make money — pricing, ACV, gross margin" },
  { n: "09", title: "Competition", note: "Honest landscape; what's your wedge" },
  { n: "10", title: "Team", note: "Why this team wins" },
  { n: "11", title: "Ask", note: "How much, what it gets you, what's next" },
]

export default function PitchDeckTemplatesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero */}
      <section className="border-b border-foreground/10">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20 lg:py-28">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">
            Resources · Templates
          </div>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
            Pitch deck templates for every stage.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl">
            Battle-tested by founders who closed real rounds. Pick a stage,
            adapt the slide order to your sector, fill in your numbers.
          </p>
          <div className="mt-10 flex items-center gap-4 flex-wrap">
            <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              Build with Anker <Sparkles className="w-4 h-4" />
            </Link>
            <Link href="/fundraising-guide" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              Fundraising guide <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Stage templates */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Templates by stage
          </div>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-10">
            Four decks for four checkpoints.
          </h2>
          <div className="grid md:grid-cols-2 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden">
            {templates.map((t) => (
              <article key={t.stage} className="bg-background p-6 lg:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                      {t.stage} · {t.slides} slides
                    </div>
                    <h3 className="mt-2 font-serif text-2xl tracking-tight">{t.title}</h3>
                  </div>
                  <FileText className="w-5 h-5 text-foreground/40 shrink-0" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{t.body}</p>
                <div className="mt-4 text-[11px] font-mono text-emerald-700">{t.used}</div>
                <div className="mt-6 flex items-center gap-3">
                  <Link href="/register" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline">
                    <Lock className="w-3.5 h-3.5" />
                    Sign in to download
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Slide order */}
      <section className="border-t border-foreground/10 bg-foreground/[0.02] py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            The canonical slide order
          </div>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-10">
            Eleven slides, in the order they convert.
          </h2>
          <div className="border-t border-foreground/10">
            {slideOrder.map((s) => (
              <div key={s.n} className="grid grid-cols-[60px_1fr_2fr] gap-4 border-b border-foreground/10 py-4 text-sm">
                <div className="font-mono text-muted-foreground">{s.n}</div>
                <div className="font-medium">{s.title}</div>
                <div className="text-muted-foreground">{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sector decks */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Sector-tuned variants
          </div>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-10">
            Industry-specific adaptations.
          </h2>
          <div className="grid md:grid-cols-2 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden">
            {sectorDecks.map((s) => (
              <div key={s.sector} className="bg-background p-5">
                <div className="font-serif text-lg">{s.sector}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-foreground/10 bg-foreground/[0.02]">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 text-center">
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight">Skip the blank slide.</h2>
          <p className="mt-4 text-muted-foreground">
            Anker drafts a first version of every slide from your company profile, then critiques it
            against the patterns top funds look for.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              Start drafting <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/fundraising-guide" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              Read the playbook
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  )
}
