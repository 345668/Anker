import Link from "next/link"
import { ArrowRight, ArrowUpRight, CheckCircle2, Target, FileText, Users, MessageSquare, TrendingUp, ShieldCheck, DollarSign, Calendar, Sparkles } from "lucide-react"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"

export const metadata = {
  title: "Fundraising Guide — Anker",
  description: "A practical, step-by-step playbook for raising your venture round — from pre-pitch preparation through closing and post-close investor management.",
}

const stages = [
  {
    icon: Target,
    n: "01",
    title: "Decide if you should raise",
    body: "Most founders raise too early or too late. Before you optimise the pitch, run the math: how long is your current runway, what milestone unlocks the next round, and is venture capital actually the right shape of money for your business? If you can grow profitably without it, that's leverage — not a problem.",
    bullets: [
      "Burn vs. milestone — can you reach a clear inflection on what you have?",
      "Dilution math — what does this round cost in ownership terms?",
      "Investor fit — VC, debt, revenue-based, grants, or no outside money?",
    ],
  },
  {
    icon: FileText,
    n: "02",
    title: "Build the narrative",
    body: "The pitch isn't a list of features. It's a one-sentence answer to 'why is this the right team to win this market right now,' followed by the evidence. Write that sentence first; the deck is just visual support for it.",
    bullets: [
      "Problem framed as the customer would describe it — not as you'd technicalise it",
      "Insight: what do you know that the market doesn't?",
      "Wedge → expansion: where you start, how you grow",
      "Proof points ordered by strength, not by chronology",
    ],
  },
  {
    icon: Sparkles,
    n: "03",
    title: "Build the deck",
    body: "10–12 slides for a seed deck, 15–18 for a Series A. Every slide should answer one question the investor is silently asking. The order matters more than the design.",
    bullets: [
      "Title · Problem · Solution · Why now · Market · Product · Traction · Business model · Competition · Team · Ask",
      "Numbers should tell the story without the speaker — assume the deck circulates without you",
      "Cut anything that doesn't change the investor's belief",
    ],
  },
  {
    icon: Users,
    n: "04",
    title: "Build your target list",
    body: "Volume beats hope. Build a list of 40–80 investors, ranked. Tier 1: stage + sector + check size + warm intro path = perfect fit. Tier 2: strong fit on 3 of 4. Tier 3: longshots you'll only meet if they reach out. Don't waste outreach on Tier 3.",
    bullets: [
      "Stage fit: do they actually write checks at your round size?",
      "Sector fit: have they invested in 2+ comparable companies in the last 24 months?",
      "Warm intro path: who in your network knows them?",
      "Recency: are they still actively investing this year?",
    ],
  },
  {
    icon: MessageSquare,
    n: "05",
    title: "Run a tight process",
    body: "Bunch your meetings. Don't take a meeting in May and another in August — by the time you have a term sheet from one, the others have lost interest. Aim to have your first 20 conversations in a 3-week window so demand can compound into a competitive process.",
    bullets: [
      "First meeting → partner meeting → diligence → term sheet usually takes 4–6 weeks per investor",
      "Reply to every email within 24 hours during active fundraise",
      "Track every conversation in one place — confusion costs offers",
    ],
  },
  {
    icon: TrendingUp,
    n: "06",
    title: "Negotiate the term sheet",
    body: "The headline number isn't the whole deal. Pay attention to the liquidation preference, board composition, anti-dilution, option pool size, and pro-rata rights. A clean 1x non-participating preference at a slightly lower valuation usually beats a participating preference at the headline you wanted.",
    bullets: [
      "Liquidation preference: 1x non-participating is standard at seed/A",
      "Board: at seed, founder + 1 investor + 1 independent is the norm",
      "Option pool: pushed pre-money is dilution for founders; negotiate the exact size",
      "Pro-rata: lets investors maintain ownership in future rounds — usually fine to grant",
    ],
  },
  {
    icon: ShieldCheck,
    n: "07",
    title: "Due diligence",
    body: "Once you've signed the term sheet you enter diligence: typically 4–8 weeks of document requests, customer references, technical audit, and legal review. Have your data room ready before you sign the term sheet — every week in diligence is a week your business doesn't have the money.",
    bullets: [
      "Company formation + cap table",
      "Customer contracts + churn metrics",
      "Financial statements + projections",
      "IP assignment agreements from every contributor",
      "Compliance: privacy policy, terms, SOC 2 if relevant",
    ],
  },
  {
    icon: DollarSign,
    n: "08",
    title: "Close",
    body: "The wire hitting your bank account is the end of fundraising, not the term sheet. Don't relax until the money lands. Common last-minute snags: cap table disagreements with previous investors, missing employee IP assignments, key customer churn during diligence.",
    bullets: [
      "Final docs review with your lawyer — read every page yourself",
      "Closing call with every signing party",
      "Wire instructions confirmed via voice, not email (wire fraud is real)",
      "Announce internally before externally",
    ],
  },
  {
    icon: Calendar,
    n: "09",
    title: "Post-close",
    body: "Set the rhythm of investor updates from day one. Monthly written updates beat quarterly board meetings for keeping investors engaged. Use them to ask for help — most investors will respond to specific, narrow asks; almost none will respond to 'let me know how we can be helpful.'",
    bullets: [
      "Monthly: 5 bullets — wins, losses, metric, ask, what's next",
      "Quarterly: deeper financial update + 60-min board call",
      "Annual: planning doc + budget + audit",
    ],
  },
  {
    icon: CheckCircle2,
    n: "10",
    title: "Plan the next round",
    body: "The best time to start your next round is 12 months before you need the money. Build your investor list for the next round before you've fully deployed this one. Track which firms have been increasing check sizes at the stage above yours — those are the natural follow-on candidates.",
    bullets: [
      "Map 30 potential next-round leads now, before you need them",
      "Update top 5 every quarter on your progress — keep them warm",
      "Track lead indicators of the milestone that unlocks the round",
    ],
  },
]

export default function FundraisingGuidePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero */}
      <section className="border-b border-foreground/10">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20 lg:py-28">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">
            Resources · Playbook
          </div>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
            How to raise your round, end to end.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl">
            A practical playbook in 10 steps. The version we wish someone had handed us before our first round.
            No fluff, no inspiration porn — just the steps that compound into a closed term sheet.
          </p>
          <div className="mt-10 flex items-center gap-4 flex-wrap">
            <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              Start with Anker <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/pitch-deck-templates" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              Pitch deck templates <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-6 lg:px-12 space-y-16">
          {stages.map((s) => (
            <article key={s.n} className="grid md:grid-cols-[80px_1fr] gap-6 md:gap-10 items-start">
              <div className="flex md:flex-col items-center md:items-start gap-3">
                <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{s.n}</div>
                <div className="w-10 h-10 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center">
                  <s.icon className="w-4 h-4 text-foreground/70" />
                </div>
              </div>
              <div>
                <h2 className="font-serif text-2xl md:text-3xl tracking-tight mb-3">{s.title}</h2>
                <p className="text-muted-foreground leading-relaxed mb-5">{s.body}</p>
                <ul className="space-y-2">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-foreground/10 bg-foreground/[0.02]">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 text-center">
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight">Ready to run the play?</h2>
          <p className="mt-4 text-muted-foreground">
            Anker handles steps 2 through 6 for you — AI-drafted decks, target-list construction,
            outreach drafting, and a CRM that tracks every conversation in one place.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              Try Anker free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  )
}
