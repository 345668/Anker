import {
  Wallet,
  BarChart3,
  PhoneCall,
  Banknote,
  ScrollText,
  Users,
} from "lucide-react";
import {
  SolutionPage,
  type SolutionContent,
} from "@/components/landing/solution-page";

export const metadata = {
  title: "Fund OS — fund administration | Anker",
  description:
    "Investments, NAV, capital calls, distributions, and LP reporting in one place.",
};

const c: SolutionContent = {
  eyebrow: "Product · Fund OS",
  title: "Clarity across the life of your fund.",
  lede: "Connect investment records, capital activity, performance, and LP reporting. Work from a shared ledger and give investors access to the information you publish.",
  editorial: {
    image: "fund-operations",
    premise: "Every investment changes the whole picture.",
    context:
      "Keep the underlying records, capital activity, and LP reporting connected as your portfolio develops.",
  },
  features: [
    {
      title: "Investments & NAV",
      desc: "Record investment positions and valuation snapshots to track portfolio value.",
      icon: Wallet,
    },
    {
      title: "Performance",
      desc: "Calculate IRR and investment multiples from recorded cash flows and valuations.",
      icon: BarChart3,
    },
    {
      title: "Capital calls",
      desc: "Issue and track calls with per-LP allocations and payment status.",
      icon: PhoneCall,
    },
    {
      title: "Distributions",
      desc: "Model and record distributions with waterfall and carry.",
      icon: Banknote,
    },
    {
      title: "LP reporting",
      desc: "Quarterly statements and updates generated from the same numbers.",
      icon: ScrollText,
    },
    {
      title: "LP portal",
      desc: "A self-serve portal so LPs get answers without emailing the GP.",
      icon: Users,
    },
  ],
  steps: [
    {
      label: "Record",
      body: "Log investments and valuations — NAV and performance update automatically.",
    },
    {
      label: "Operate",
      body: "Call capital, record distributions, and keep the ledger clean and auditable.",
    },
    {
      label: "Report",
      body: "Publish LP statements and open the portal — from one source of truth.",
    },
  ],
};

export default function FundOsProduct() {
  return <SolutionPage c={c} />;
}
