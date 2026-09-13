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
  title: "Pitch deck templates | Anker",
  description:
    "Pitch deck structures for pre-seed, seed, Series A, and growth-stage companies, with sector-specific guidance.",
};
const templates = [
  {
    stage: "Pre-seed",
    slides: 10,
    title: "First-cheque deck",
    body: "For when you have a deck of clarity but no metrics yet. Maximises team + insight + market, minimises everything you can't prove.",
  },
  {
    stage: "Seed",
    slides: 12,
    title: "Seed deck",
    body: "Earliest traction is here — first 10 customers, early ARR, design partners. The 'why now' slide does the heaviest lifting.",
  },
  {
    stage: "Series A",
    slides: 16,
    title: "Series A deck",
    body: "Repeatable acquisition + unit economics + team scaling. The deck shifts from 'why this could work' to 'why this is working.'",
  },
  {
    stage: "Series B",
    slides: 18,
    title: "Growth deck",
    body: "Quarterly cohorts, NDR, payback period, channel mix. Heavy on financial detail; light on origin story.",
  },
];

const sectorDecks = [
  { sector: "B2B SaaS", note: "ARR growth, NDR, payback, ACV ladder" },
  { sector: "Fintech", note: "Unit economics, regulatory posture, take-rate" },
  {
    sector: "Climate / Energy",
    note: "LCOE, deployment pipeline, policy tailwinds",
  },
  {
    sector: "Healthtech",
    note: "Reimbursement, clinical evidence, regulatory path",
  },
  {
    sector: "Marketplaces",
    note: "Liquidity, take-rate, supply / demand balance",
  },
  { sector: "Consumer", note: "Cohort retention, CAC payback, brand metrics" },
  { sector: "Dev tools", note: "Adoption funnel, free-to-paid, GTM motion" },
  {
    sector: "AI / ML",
    note: "Defensibility, data flywheel, inference economics",
  },
];

const slideOrder = [
  {
    n: "01",
    title: "Title",
    note: "Company name, one-line pitch, your name + role + email",
  },
  {
    n: "02",
    title: "Problem",
    note: "Framed how the customer would describe it",
  },
  {
    n: "03",
    title: "Solution",
    note: "What you've built — concrete, not abstract",
  },
  {
    n: "04",
    title: "Why now",
    note: "What's true today that wasn't 5 years ago?",
  },
  { n: "05", title: "Market", note: "TAM bottom-up; show the math" },
  { n: "06", title: "Product", note: "Screenshots > diagrams" },
  { n: "07", title: "Traction", note: "Strongest proof first" },
  {
    n: "08",
    title: "Business model",
    note: "How you make money — pricing, ACV, gross margin",
  },
  {
    n: "09",
    title: "Competition",
    note: "Honest landscape; what's your wedge",
  },
  { n: "10", title: "Team", note: "Why this team wins" },
  { n: "11", title: "Ask", note: "How much, what it gets you, what's next" },
];

export default function PitchDeckTemplatesPage() {
  return (
    <main id="main-content" className={`marketing-site ${e.page}`}>
      <Navigation />
      <EditorialHero
        eyebrow="Resources / Pitch deck templates"
        title="Make your investment case clear."
        description="Start with the questions your investor needs answered. Choose a structure for your stage, adapt it to your sector, and support the narrative with evidence."
        image="presentation"
        action={{ label: "Explore deck structures", href: "#templates" }}
      />
      <section className={e.section} id="templates">
        <div className={e.container}>
          <span className={e.eyebrow}>By stage</span>
          <h2>
            A different conversation
            <br />
            at every stage.
          </h2>
          <div className="grid md:grid-cols-2 gap-x-16 gap-y-12 mt-12">
            {templates.map((t) => (
              <article className={e.card} key={t.stage}>
                <span className={e.eyebrow}>
                  {t.stage} / {t.slides} slides
                </span>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
                <Link href="/contact" className={e.textLink}>
                  Discuss this template
                  <ArrowRight size={16} aria-hidden="true" />
                  <span className="sr-only">: {t.title}</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className={`${e.section} ${e.silver}`}>
        <div className={e.container}>
          <span className={e.eyebrow}>The narrative</span>
          <h2>
            Eleven questions.
            <br />
            One coherent story.
          </h2>
          <div className="mt-12">
            {slideOrder.map((slide) => (
              <div key={slide.n} className={e.row}>
                <span className={e.number}>{slide.n}</span>
                <h3>{slide.title}</h3>
                <p>{slide.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={e.section}>
        <div className={e.container}>
          <span className={e.eyebrow}>Sector context</span>
          <h2>Bring the right evidence.</h2>
          <div className="grid md:grid-cols-2 gap-x-16 gap-y-8 mt-12">
            {sectorDecks.map((sector) => (
              <div className={e.card} key={sector.sector}>
                <h3>{sector.sector}</h3>
                <p>{sector.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <EditorialCta
        title="Give the narrative a process behind it."
        label="Read the fundraising guide"
        href="/fundraising-guide"
      />
      <FooterSection />
    </main>
  );
}
