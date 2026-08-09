import Link from "next/link"
import { ArrowRight, Globe2, Building2, Users, Sparkles, ShieldCheck, Filter } from "lucide-react"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"

export const metadata = {
  title: "Investor Database — Anker",
  description: "18,000+ enriched firms and 47,000+ decision-makers. VC, family office, corporate venture, sovereign — searchable by sector, stage, geography, check size.",
}

const stats = [
  { label: "Firms", value: "18,000+", note: "VCs, family offices, corporates, sovereigns" },
  { label: "Decision-makers", value: "47,000+", note: "Partners, principals, IR contacts" },
  { label: "Geographies", value: "84", note: "with deep coverage in 12" },
  { label: "Updates", value: "weekly", note: "we re-crawl + re-enrich continuously" },
]

const filters = [
  { label: "Stage", values: ["Pre-seed", "Seed", "Series A", "Series B", "Growth", "Crossover"] },
  { label: "Sector", values: ["B2B SaaS", "Fintech", "Climate", "Healthtech", "AI", "Marketplaces", "Consumer", "Dev tools", "Frontier"] },
  { label: "Geography", values: ["North America", "EMEA", "APAC", "MENA", "LatAm", "Africa"] },
  { label: "Check size", values: ["<$500K", "$500K–2M", "$2M–10M", "$10M–50M", "$50M+"] },
  { label: "Firm type", values: ["VC fund", "Family office", "Corporate venture", "Angel syndicate", "Sovereign", "FoF"] },
]

export default function InvestorDatabasePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero */}
      <section className="border-b border-foreground/10">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20 lg:py-28">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">
            Platform · Discover
          </div>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
            Every active investor, ranked for your round.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl">
            18,000+ firms and 47,000+ decision-makers, enriched continuously. Filter by stage,
            sector, geography, and check size. Anker ranks each one for fit with your company,
            highlights warm intro paths, and drafts the outreach.
          </p>
          <div className="mt-10 flex items-center gap-4 flex-wrap">
            <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              Search the database <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/fundraising-guide" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              How fundraising works
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-foreground/10">
        <div className="max-w-6xl mx-auto px-6 lg:px-12 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden">
            {stats.map((s) => (
              <div key={s.label} className="bg-background p-6 lg:p-8">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{s.label}</div>
                <div className="font-serif text-3xl lg:text-4xl mt-2 tracking-tight">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-2">{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3 inline-flex items-center gap-1.5">
            <Filter className="w-3 h-3" /> Filters
          </div>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-10">
            Narrow 18,000 firms to the 40 worth pitching.
          </h2>
          <div className="space-y-8">
            {filters.map((f) => (
              <div key={f.label}>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">{f.label}</div>
                <div className="flex flex-wrap gap-2">
                  {f.values.map((v) => (
                    <span key={v} className="px-3 py-1.5 text-sm rounded-md border border-foreground/15 bg-foreground/[0.02]">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it ranks */}
      <section className="border-t border-foreground/10 bg-foreground/[0.02] py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            How the matching works
          </div>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-10">
            More than keyword search.
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card icon={Sparkles} title="Thesis match"
              body="We read every firm's recent investments and stated thesis, then compare to your company profile. Surface fit isn't fit." />
            <Card icon={Building2} title="Check-size fit"
              body="Filter only to firms that actually write checks at your round size. Doesn't matter how aligned the thesis is if they don't show up at your stage." />
            <Card icon={Users} title="Warm-intro path"
              body="We map your LinkedIn + portfolio + advisor networks against each firm's partners. If a path exists, we surface it." />
            <Card icon={Globe2} title="Geography"
              body="Region + travel + remote-friendliness. Filter to who actually invests in your geography vs. who just lists it." />
            <Card icon={ShieldCheck} title="Activity signal"
              body="Inactive firms still appear in lists. We surface firms that have written 3+ checks in the last 12 months at your stage." />
            <Card icon={Filter} title="Negative filters"
              body="Companies they pass on for sector / geo / governance reasons. Save the meeting before you take it." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-foreground/10">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 text-center">
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight">Start your target list.</h2>
          <p className="mt-4 text-muted-foreground">
            Free to search. Premium unlocks contact details + AI-drafted outreach.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              Try the database <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              Enterprise enquiry
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  )
}

function Card({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="border border-foreground/10 rounded-md p-5 bg-background">
      <div className="w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center mb-4">
        <Icon className="w-4 h-4 text-foreground/70" />
      </div>
      <h3 className="font-serif text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  )
}
