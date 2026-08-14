import { LineChart, FileText, Bell, Wallet, ShieldCheck, Eye } from "lucide-react"
import { SolutionPage, type SolutionContent } from "@/components/landing/solution-page"

export const metadata = { title: "Anker for LPs — portfolio visibility", description: "Real-time visibility into commitments, capital calls, distributions, and NAV across your fund investments." }

const c: SolutionContent = {
  eyebrow: "Anker for LPs",
  title: "Full visibility into every commitment.",
  lede: "See commitments, capital calls, distributions, NAV, and performance across your fund investments — self-serve, always current.",
  accent: "#127c78",
  features: [
    { title: "Portfolio analytics", desc: "DPI, RVPI, TVPI and IRR across every fund you're committed to, in one view.", icon: LineChart },
    { title: "Capital account", desc: "Track called vs. uncalled capital and distributions with a clear running balance.", icon: Wallet },
    { title: "Statements & documents", desc: "Quarterly statements, K-1s, and fund documents in a single secure place.", icon: FileText },
    { title: "Notifications", desc: "Capital-call and distribution alerts so nothing slips past a deadline.", icon: Bell },
    { title: "Self-serve access", desc: "A dedicated LP portal — get answers without emailing the GP.", icon: Eye },
    { title: "Secure by design", desc: "Permissioned access with an audit trail on every document and view.", icon: ShieldCheck },
  ],
  steps: [
    { label: "Get invited", body: "Your GP grants you portal access to the funds you're committed to." },
    { label: "See everything", body: "Commitments, calls, distributions, NAV, and performance — always up to date." },
    { label: "Stay informed", body: "Download statements and get alerted on calls and distributions automatically." },
  ],
  quote: { text: "I can log in and get exactly what I need. I wish every GP operated this way.", name: "Institutional LP", role: "Anker user" },
}

export default function LpsSolution() { return <SolutionPage c={c} /> }
