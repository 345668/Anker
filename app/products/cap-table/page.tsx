import { PieChart, Layers, TrendingDown, FileSignature, Calculator, History } from "lucide-react"
import { SolutionPage, type SolutionContent } from "@/components/landing/solution-page"

export const metadata = { title: "Cap Table — ownership & scenarios | Anker", description: "Model dilution, SAFEs, and financing rounds with a clean, investor-ready cap table." }

const c: SolutionContent = {
  eyebrow: "Product · Cap Table",
  title: "Ownership you can model, share, and trust.",
  lede: "Keep a clean, investor-ready cap table, model dilution and SAFE conversions, and run scenarios before you sign.",
  accent: "#e5380f",
  features: [
    { title: "Cap table of record", desc: "Fully-diluted ownership, share classes, and option pool in one live view.", icon: PieChart },
    { title: "Scenario modeling", desc: "Model new rounds, pools, and secondaries and see dilution instantly.", icon: Layers },
    { title: "SAFE conversion", desc: "Convert SAFEs and notes with accurate post-money math.", icon: Calculator },
    { title: "Financing history", desc: "Every round, issue price, and post-money valuation in one timeline.", icon: History },
    { title: "Dilution insight", desc: "See exactly how each round moves founder and investor ownership.", icon: TrendingDown },
    { title: "Round-ready exports", desc: "Export a clean cap table and rights summary for diligence.", icon: FileSignature },
  ],
  steps: [
    { label: "Set up", body: "Import or build your cap table — founders, options, and investors." },
    { label: "Model", body: "Test a new round or pool and watch fully-diluted ownership update." },
    { label: "Share", body: "Export an investor-ready cap table and financing history for diligence." },
  ],
  quote: { text: "We walked into every meeting knowing our numbers cold. No more spreadsheet panic.", name: "Founder & CEO", role: "Anker user" },
}

export default function CapTableProduct() { return <SolutionPage c={c} /> }
