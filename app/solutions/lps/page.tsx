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
  sections: [
    {
      kicker: "Your capital account, clear",
      intro: "Every fund you're committed to, in one place — the numbers your GP runs on, exposed to you.",
      points: [
        { title: "Commitment to NAV", body: "Committed, called, uncalled, distributed, estimated NAV & TVPI." },
        { title: "Per-fund breakdown", body: "Each commitment with its own capital-account view." },
        { title: "Always current", body: "Updates the moment your GP calls capital or distributes." },
      ],
    },
    {
      kicker: "Every notice, addressed to you",
      intro: "Capital calls and distributions land in your room — acknowledge and confirm, don't dig through email.",
      points: [
        { title: "Calls & distributions", body: "Received notices with amounts, dates, and status." },
        { title: "Acknowledge & confirm", body: "Signal intent to wire; confirm receipt in a click." },
        { title: "Downloadable PDFs", body: "The GP's notice PDF, filed permanently in your documents." },
      ],
    },
    {
      kicker: "Statements & documents, organized",
      intro: "The whole data room, by section — statements, letters, K-1s — scoped to exactly what you can see.",
      points: [
        { title: "Section-grouped room", body: "ILPA-informed taxonomy with completeness." },
        { title: "Own + fund-wide", body: "Your documents and shared fund documents, never other LPs'." },
        { title: "Self-serve access", body: "Tokenized, secure — no chasing the GP for a file." },
      ],
    },
  ],
  steps: [
    { label: "Get invited", body: "Your GP grants you portal access to the funds you're committed to." },
    { label: "See everything", body: "Commitments, calls, distributions, NAV, and performance — always up to date." },
    { label: "Stay informed", body: "Download statements and get alerted on calls and distributions automatically." },
  ],
  quote: { text: "I can log in and get exactly what I need. I wish every GP operated this way.", name: "Institutional LP", role: "Anker user" },
}

export default function LpsSolution() { return <SolutionPage c={c} /> }
