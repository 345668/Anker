import {
  Compass,
  Sparkles,
  Filter,
  Network,
  Target,
  Database,
} from "lucide-react";
import {
  SolutionPage,
  type SolutionContent,
} from "@/components/landing/solution-page";

export const metadata = {
  title: "Discover — investor matching | Anker",
  description:
    "Research investors, firms, and LPs by stage, sector, geography, and investment thesis.",
};

const c: SolutionContent = {
  eyebrow: "Product · Discover",
  title: "Find the investors who fit your ambition.",
  lede: "Build a relevant investor shortlist around your stage, sector, geography, and investment thesis. Review the reasoning behind each match before starting a conversation.",
  editorial: {
    image: "perspective",
    premise: "A relevant shortlist starts with context.",
    context:
      "Stage, sector, geography, and investment thesis shape the search. Bring them together to understand why an investor belongs in your next conversation.",
  },
  features: [
    {
      title: "Semantic matching",
      desc: "Use your deck and investment thesis to surface potentially relevant investors.",
      icon: Sparkles,
    },
    {
      title: "Investor research",
      desc: "Explore investor, firm, and LP profiles, with enrichment to support further research.",
      icon: Database,
    },
    {
      title: "Precision filters",
      desc: "Stage, geography, check size, sector, and recent activity in one query.",
      icon: Filter,
    },
    {
      title: "Relationship context",
      desc: "Keep investor research and relationship notes alongside your shortlist.",
      icon: Network,
    },
    {
      title: "Fit scoring",
      desc: "Every match carries a transparent score and the reasons behind it.",
      icon: Target,
    },
    {
      title: "Shortlists",
      desc: "Save, tag, and hand off curated lists straight into outreach.",
      icon: Compass,
    },
  ],
  steps: [
    {
      label: "Describe your raise",
      body: "Upload your deck or describe your company — Anker builds a live investor shortlist.",
    },
    {
      label: "Filter & rank",
      body: "Narrow by stage, sector, and geography; sort by fit score and recency.",
    },
    {
      label: "Push to outreach",
      body: "Prepare personalized drafts for the investors you choose to contact.",
    },
  ],
};

export default function DiscoverProduct() {
  return <SolutionPage c={c} />;
}
