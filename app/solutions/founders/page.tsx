import { Compass, Send, PieChart, FileText, Users, Flame } from "lucide-react"
import { SolutionPage, type SolutionContent } from "@/components/landing/solution-page"

export const metadata = { title: "Anker for Founders — raise your round", description: "AI-powered fundraising for founders: match investors, run outreach, and manage your raise." }

const c: SolutionContent = {
  eyebrow: "Anker for Founders",
  title: "Raise your round, end to end.",
  lede: "Find the right investors, craft the pitch, run outreach, and manage your cap table and runway — one AI-native workspace for the whole raise.",
  accent: "#e5380f",
  features: [
    { title: "Investor matching", desc: "Semantic matching across 60k+ investors, firms, and LPs to your stage, sector, and thesis.", icon: Compass },
    { title: "Outreach that converts", desc: "AI-drafted, personalized emails with a shared inbox, sequences, and deliverability built in.", icon: Send },
    { title: "Cap table & runway", desc: "Model dilution, SAFEs, and runway so you walk into every meeting with the numbers.", icon: PieChart },
    { title: "Pitch deck & data room", desc: "Analyze your deck, fix red flags, and share a clean, permissioned data room.", icon: FileText },
    { title: "Warm intros", desc: "Map your network to target investors and surface the shortest path in.", icon: Users },
    { title: "Fundraise pipeline", desc: "Track every conversation from first touch to term sheet in one pipeline.", icon: Flame },
  ],
  sections: [
    {
      kicker: "Find the right investors, faster",
      intro: "Stop cold-emailing the wrong funds. Anker matches your deck and thesis to investors who actually write checks like yours.",
      points: [
        { title: "Semantic investor matching", body: "60k+ investors, firms, and LPs ranked by fit — not keywords." },
        { title: "Warm-intro paths", body: "See the shortest route through your network to any target." },
        { title: "Precision filters", body: "Stage, geography, check size, sector, and recent activity." },
      ],
    },
    {
      kicker: "Run the raise like a pipeline",
      intro: "Every conversation, from first touch to term sheet, tracked with the money on the line.",
      points: [
        { title: "Raise pipeline", body: "Round by stage with soft-circled and committed capital." },
        { title: "Personalized outreach", body: "AI-drafted emails, sequences, and a shared inbox." },
        { title: "Cap table & runway", body: "Walk into every meeting with the numbers ready." },
      ],
    },
    {
      kicker: "Share with confidence",
      intro: "A diligence room organized the way investors expect — and you see who opened what.",
      points: [
        { title: "Section-checklist data room", body: "The 12-section VC diligence taxonomy, with completeness." },
        { title: "Tracked, watermarked sharing", body: "Tokenized links, expiring, with view analytics." },
        { title: "Request-a-document", body: "Investors ask for what's missing; you fulfill in a click." },
      ],
    },
  ],
  steps: [
    { label: "Set up your raise", body: "Tell Anker your stage, target, and story — it seeds your workspace and shortlists investors." },
    { label: "Reach out", body: "Send personalized, on-brand outreach at scale and manage replies from one inbox." },
    { label: "Close", body: "Track the pipeline, review term sheets, and keep your cap table and data room investor-ready." },
  ],
  quote: { text: "Anker turned a scattered raise into one clean pipeline — we knew exactly who to contact and what to send.", name: "Seed-stage founder", role: "Anker user" },
}

export default function FoundersSolution() { return <SolutionPage c={c} /> }
