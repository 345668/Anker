import { Wallet, BarChart3, PhoneCall, Banknote, ScrollText, Users } from "lucide-react"
import { SolutionPage, type SolutionContent } from "@/components/landing/solution-page"

export const metadata = { title: "Fund OS — fund administration | Anker", description: "Investments, NAV, capital calls, distributions, and LP reporting in one place." }

const c: SolutionContent = {
  eyebrow: "Product · Fund OS",
  title: "The back-office your fund actually runs on.",
  lede: "Investments, NAV, capital calls, distributions, the ledger, and LP reporting — accurate numbers that reconcile, with a self-serve LP portal.",
  accent: "#2f45e0",
  features: [
    { title: "Investments & NAV", desc: "A position book of record with valuation snapshots that update NAV instantly.", icon: Wallet },
    { title: "Performance", desc: "IRR, TVPI, DPI, RVPI, and MOIC from dated cashflows — not estimates.", icon: BarChart3 },
    { title: "Capital calls", desc: "Issue and track calls with per-LP allocations and payment status.", icon: PhoneCall },
    { title: "Distributions", desc: "Model and record distributions with waterfall and carry.", icon: Banknote },
    { title: "LP reporting", desc: "Quarterly statements and updates generated from the same numbers.", icon: ScrollText },
    { title: "LP portal", desc: "A self-serve portal so LPs get answers without emailing the GP.", icon: Users },
  ],
  steps: [
    { label: "Record", body: "Log investments and valuations — NAV and performance update automatically." },
    { label: "Operate", body: "Call capital, record distributions, and keep the ledger clean and auditable." },
    { label: "Report", body: "Publish LP statements and open the portal — from one source of truth." },
  ],
  quote: { text: "Our LPs self-serve and our numbers reconcile. Accuracy and clarity in the same system.", name: "Managing Partner", role: "Anker user" },
}

export default function FundOsProduct() { return <SolutionPage c={c} /> }
