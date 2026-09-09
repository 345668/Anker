import {
  LineChart,
  FileText,
  Bell,
  Wallet,
  ShieldCheck,
  Eye,
} from "lucide-react";
import {
  SolutionPage,
  type SolutionContent,
} from "@/components/landing/solution-page";

export const metadata = {
  title: "Anker for LPs — portfolio visibility",
  description:
    "Review commitments, capital activity, valuations, and documents shared by your fund manager.",
};

const c: SolutionContent = {
  eyebrow: "Anker for LPs",
  title: "Stay connected to the capital you commit.",
  lede: "Review your capital account, fund notices, and reporting in one place, with access to the information your fund manager has made available.",
  editorial: {
    image: "perspective",
    premise: "A connected view of your investments.",
    context: "",
  },
  features: [
    {
      title: "Portfolio analytics",
      desc: "DPI, RVPI, TVPI and IRR across every fund you're committed to, in one view.",
      icon: LineChart,
    },
    {
      title: "Capital account",
      desc: "Track called vs. uncalled capital and distributions with a clear running balance.",
      icon: Wallet,
    },
    {
      title: "Statements & documents",
      desc: "Quarterly statements, K-1s, and fund documents in a single secure place.",
      icon: FileText,
    },
    {
      title: "Notifications",
      desc: "Capital-call and distribution alerts so nothing slips past a deadline.",
      icon: Bell,
    },
    {
      title: "Self-serve access",
      desc: "A dedicated LP portal — get answers without emailing the GP.",
      icon: Eye,
    },
    {
      title: "Secure by design",
      desc: "Access fund and investor-specific information through a permissioned portal.",
      icon: ShieldCheck,
    },
  ],
  sections: [
    {
      kicker: "Your capital account, clear",
      intro:
        "Every fund you're committed to, in one place — the numbers your GP runs on, exposed to you.",
      points: [
        {
          title: "Commitment to NAV",
          body: "Committed, called, uncalled, distributed, estimated NAV & TVPI.",
        },
        {
          title: "Per-fund breakdown",
          body: "Each commitment with its own capital-account view.",
        },
        {
          title: "Reporting context",
          body: "Review recorded capital activity and the reporting date behind each valuation.",
        },
      ],
    },
    {
      kicker: "Every notice, addressed to you",
      intro:
        "Capital calls and distributions land in your room — acknowledge and confirm, don't dig through email.",
      points: [
        {
          title: "Calls & distributions",
          body: "Received notices with amounts, dates, and status.",
        },
        {
          title: "Acknowledge & confirm",
          body: "Signal intent to wire; confirm receipt in a click.",
        },
        {
          title: "Downloadable PDFs",
          body: "Find the notice PDFs your fund manager has shared in your documents.",
        },
      ],
    },
    {
      kicker: "Statements & documents, organized",
      intro:
        "The whole data room, by section — statements, letters, K-1s — scoped to exactly what you can see.",
      points: [
        {
          title: "Section-grouped room",
          body: "Find statements, fund letters, and other documents by category.",
        },
        {
          title: "Own + fund-wide",
          body: "Your documents and shared fund documents, never other LPs'.",
        },
        {
          title: "Self-serve access",
          body: "Open the documents your fund manager has made available to you.",
        },
      ],
    },
  ],
  steps: [
    {
      label: "Get invited",
      body: "Your GP grants you portal access to the funds you're committed to.",
    },
    {
      label: "Review your account",
      body: "Review commitments, capital activity, and the latest published reporting.",
    },
    {
      label: "Stay informed",
      body: "Access statements and review the capital-call and distribution notices shared with you.",
    },
  ],
};

export default function LpsSolution() {
  return <SolutionPage c={c} />;
}
