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
  steps: [
    { label: "Set up your raise", body: "Tell Anker your stage, target, and story — it seeds your workspace and shortlists investors." },
    { label: "Reach out", body: "Send personalized, on-brand outreach at scale and manage replies from one inbox." },
    { label: "Close", body: "Track the pipeline, review term sheets, and keep your cap table and data room investor-ready." },
  ],
  quote: { text: "Anker turned a scattered raise into one clean pipeline — we knew exactly who to contact and what to send.", name: "Seed-stage founder", role: "Anker user" },
}

export default function FoundersSolution() { return <SolutionPage c={c} /> }
