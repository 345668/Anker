import { Compass, Sparkles, Filter, Network, Target, Database } from "lucide-react"
import { SolutionPage, type SolutionContent } from "@/components/landing/solution-page"

export const metadata = { title: "Discover — investor matching | Anker", description: "Semantic investor discovery across 60k+ investors, firms, and LPs." }

const c: SolutionContent = {
  eyebrow: "Product · Discover",
  title: "The right investors, matched to your story.",
  lede: "Semantic matching across 60,000+ investors, firms, and LPs — ranked by fit to your stage, sector, and thesis, not just keywords.",
  accent: "#e5380f",
  features: [
    { title: "Semantic matching", desc: "Embeddings match your deck and thesis to investors who actually invest in what you're building.", icon: Sparkles },
    { title: "60k+ investor graph", desc: "Investors, firms, and LPs — continuously enriched and deduplicated.", icon: Database },
    { title: "Precision filters", desc: "Stage, geography, check size, sector, and recent activity in one query.", icon: Filter },
    { title: "Warm-path mapping", desc: "See the shortest intro path through your network to any target.", icon: Network },
    { title: "Fit scoring", desc: "Every match carries a transparent score and the reasons behind it.", icon: Target },
    { title: "Shortlists", desc: "Save, tag, and hand off curated lists straight into outreach.", icon: Compass },
  ],
  steps: [
    { label: "Describe your raise", body: "Upload your deck or describe your company — Anker builds a live investor shortlist." },
    { label: "Filter & rank", body: "Narrow by stage, sector, and geography; sort by fit score and recency." },
    { label: "Push to outreach", body: "Send your shortlist into personalized outreach in one click." },
  ],
  quote: { text: "We found LPs and family offices we never knew existed — and the matches were genuinely relevant.", name: "Co-Founder", role: "Anker user" },
}

export default function DiscoverProduct() { return <SolutionPage c={c} /> }
