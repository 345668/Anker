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
  title: "Investor database | Anker",
  description:
    "Explore investors and firms by stage, sector, geography, and check size with Anker Discover.",
};
const filters = [
  {
    label: "Stage",
    values: ["Pre-seed", "Seed", "Series A", "Series B", "Growth", "Crossover"],
  },
  {
    label: "Sector",
    values: [
      "B2B SaaS",
      "Fintech",
      "Climate",
      "Healthtech",
      "AI",
      "Marketplaces",
      "Consumer",
      "Dev tools",
      "Frontier",
    ],
  },
  {
    label: "Geography",
    values: ["North America", "EMEA", "APAC", "MENA", "LatAm", "Africa"],
  },
  {
    label: "Check size",
    values: ["<$500K", "$500K–2M", "$2M–10M", "$10M–50M", "$50M+"],
  },
  {
    label: "Firm type",
    values: [
      "VC fund",
      "Family office",
      "Corporate venture",
      "Angel syndicate",
      "Sovereign",
      "FoF",
    ],
  },
];

export default function InvestorDatabasePage() {
  return (
    <main id="main-content" className={`marketing-light ${e.page}`}>
      <Navigation />
      <EditorialHero
        eyebrow="Resources / Investor database"
        title="Look beyond the list. Understand the fit."
        description="Explore firms and decision-makers through the context that matters to your raise: stage, sector, geography, check size, and investment thesis."
        image="perspective"
        action={{ label: "Explore Discover", href: "/products/discover" }}
        secondary={{ label: "Sign in", href: "/login" }}
      />
      <section className={e.section}>
        <div className={e.container}>
          <span className={e.eyebrow}>Start with your mandate</span>
          <h2>
            Narrow the field.
            <br />
            Deepen the conversation.
          </h2>
          <p className={e.sectionIntro}>
            Use these dimensions to shape your investor search in Anker
            Discover.
          </p>
          <div className="mt-12">
            {filters.map((filter, i) => (
              <div className={e.row} key={filter.label}>
                <span className={e.number}>0{i + 1}</span>
                <h3>{filter.label}</h3>
                <div className="flex flex-wrap gap-2">
                  {filter.values.map((value) => (
                    <span
                      key={value}
                      className="text-sm bg-[#f2f5f7] px-3 py-2"
                    >
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={`${e.section} ${e.dark}`}>
        <div className={e.container}>
          <span className={e.eyebrow}>From discovery to relationships</span>
          <h2>Turn research into a focused next step.</h2>
          <div className={`${e.grid} mt-12`}>
            {[
              [
                "Thesis and stage",
                "Compare the investor’s stated focus with the company, round, and opportunity you are building.",
              ],
              [
                "Network context",
                "Look for relevant connections and warm introduction paths as part of your outreach preparation.",
              ],
              [
                "A working shortlist",
                "Save the investors you want to pursue and bring that context into your outreach and pipeline.",
              ],
            ].map(([title, body], i) => (
              <div className={e.card} key={title}>
                <span className={e.number}>0{i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <EditorialCta
        title="Start with the investors who fit your story."
        label="Talk to us about Discover"
      />
      <FooterSection />
    </main>
  );
}
