import { Target, Inbox, ClipboardList, GitBranch, PieChart, Gauge } from "lucide-react"
import { SolutionPage, type SolutionContent } from "@/components/landing/solution-page"

export const metadata = { title: "Deal Flow — source, score, close | Anker", description: "A shared deal pipeline from inbound to IC to close, with AI scoring and memos." }

const c: SolutionContent = {
  eyebrow: "Product · Deal Flow",
  title: "From inbound to IC to close, in one pipeline.",
  lede: "Source, score, and move deals through a shared pipeline — with AI scoring, IC memos, and ownership tracking baked in.",
  accent: "#2f45e0",
  features: [
    { title: "Unified pipeline", desc: "Every deal from sourcing to close in one board the whole team shares.", icon: GitBranch },
    { title: "Inbound capture", desc: "Founder submissions and forwarded decks land straight on the board.", icon: Inbox },
    { title: "AI scoring", desc: "Score deals against your thesis so the best opportunities rise first.", icon: Gauge },
    { title: "IC memos", desc: "Draft and store investment memos alongside each deal.", icon: ClipboardList },
    { title: "Ownership tracking", desc: "Model entry ownership and follow-on reserves per deal.", icon: PieChart },
    { title: "Stage automation", desc: "Move deals through stages with tasks and owners at each step.", icon: Target },
  ],
  steps: [
    { label: "Capture", body: "Inbound decks and sourced deals flow into a single pipeline." },
    { label: "Assess", body: "Score against your mandate, write the memo, align the IC." },
    { label: "Close", body: "Advance to close and record the investment in Fund OS automatically." },
  ],
  quote: { text: "One board, one source of truth. We stopped losing deals in inboxes and spreadsheets.", name: "Principal", role: "Anker user" },
}

export default function DealFlowProduct() { return <SolutionPage c={c} /> }
