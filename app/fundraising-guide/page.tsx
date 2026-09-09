import Link from "next/link";
import {
  ArrowRight,
  Target,
  FileText,
  Sparkles,
  Users,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
  DollarSign,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import {
  EditorialHero,
  EditorialCta,
} from "@/components/landing/editorial-page";
import e from "@/components/landing/editorial.module.css";
export const metadata = {
  title: "Fundraising guide | Anker",
  description:
    "A practical guide to preparing and managing a venture fundraise, from narrative to investor relationships.",
};
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
      "Timeline varies by investor; keep momentum from first meeting through diligence and term sheet",
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
];

export default function FundraisingGuidePage() {
  return (
    <main id="main-content" className={`marketing-site ${e.page}`}>
      <Navigation />
      <EditorialHero
        eyebrow="Resources / Fundraising guide"
        title="A considered approach to your next raise."
        description="A practical playbook in ten steps, from the decision to raise through preparation, investor conversations, and the work after the close."
        action={{ label: "Read the guide", href: "#guide" }}
        secondary={{
          label: "Pitch deck templates",
          href: "/pitch-deck-templates",
        }}
      />
      <section className={e.section} id="guide">
        <div className={e.container}>
          <div className="grid lg:grid-cols-[220px_minmax(0,760px)] gap-12 lg:gap-20 justify-center">
            <nav aria-label="In this guide">
              <div className="lg:sticky lg:top-36 border-t-2 border-foreground pt-5">
                <h2 className="!font-sans !text-base !font-semibold mb-5">
                  In this guide
                </h2>
                <ol className="space-y-1">
                  {stages.map((stage) => (
                    <li key={stage.n}>
                      <a
                        href={`#step-${stage.n}`}
                        className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <span className="mr-3">{stage.n}</span>
                        {stage.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>
            <div>
              {stages.map((stage) => (
                <article
                  id={`step-${stage.n}`}
                  key={stage.n}
                  className="mb-16 scroll-mt-36"
                >
                  <span className={e.eyebrow}>Step {stage.n}</span>
                  <h2 className="!text-3xl md:!text-4xl">{stage.title}</h2>
                  <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                    {stage.body}
                  </p>
                  <ul className="list-disc pl-6 mt-6 space-y-3 leading-relaxed">
                    {stage.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <EditorialCta
        title="Bring your fundraising process together."
        label="Explore the Founder Suite"
        href="/solutions/founders"
      />
      <FooterSection />
    </main>
  );
}
