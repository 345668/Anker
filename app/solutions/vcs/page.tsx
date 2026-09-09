import {
  Target,
  Users,
  Wallet,
  BarChart3,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import {
  SolutionPage,
  type SolutionContent,
} from "@/components/landing/solution-page";

export const metadata = {
  title: "Anker for Venture Funds — run your fund",
  description:
    "Source deals, match LPs, and run the fund back-office on one platform.",
};

const c: SolutionContent = {
  eyebrow: "Anker for Venture Funds",
  title: "A clearer view of the fund you’re building.",
  lede: "From deal flow and IC to LP matchmaking, capital calls, NAV, and reporting — the fund operating system for modern GPs.",
  editorial: {
    image: "convergence",
    premise: "A connected foundation for your fund.",
    context: "",
  },
  features: [
    {
      title: "Deal flow & IC",
      desc: "Source, score, and move deals from inbound to close with a shared pipeline and IC memos.",
      icon: Target,
    },
    {
      title: "LP matchmaking",
      desc: "Match your fund to the right LPs and run a structured raise with a live pipeline.",
      icon: Users,
    },
    {
      title: "Fund back-office",
      desc: "Investments, NAV, capital calls, distributions, and the ledger — accurate and auditable.",
      icon: Wallet,
    },
    {
      title: "Performance",
      desc: "IRR, TVPI, DPI, RVPI and MOIC computed from dated cashflows, not estimates.",
      icon: BarChart3,
    },
    {
      title: "LP reporting",
      desc: "Statements, quarterly updates, and a self-serve LP portal that keeps LPs happy.",
      icon: ScrollText,
    },
    {
      title: "Compliance",
      desc: "Obligation register, filing deadlines, and a legal document workflow.",
      icon: ShieldCheck,
    },
  ],
  sections: [
    {
      kicker: "Source and close, in one pipeline",
      intro:
        "From first meeting to IC to wire — deal flow and the decisions behind it, tracked together.",
      points: [
        {
          title: "Deal flow & IC",
          body: "Sourcing → IC → close, with founder submissions inbound.",
        },
        {
          title: "LP matchmaking",
          body: "Compare your fund mandate with LP profiles and review the rationale for each match.",
        },
        {
          title: "Relationship CRM",
          body: "Keep relationship history, notes, and next steps connected to each opportunity.",
        },
      ],
    },
    {
      kicker: "Run the back office",
      intro:
        "Manage capital calls, distributions, valuations, and the ledger through connected workflows.",
      points: [
        {
          title: "Capital call wizard",
          body: "Type → amounts → net breakdown → review with health checks.",
        },
        {
          title: "Distribution wizard",
          body: "Waterfall by ownership, per-LP allocation, notices.",
        },
        {
          title: "Financial reporting",
          body: "Quarterly close → publish to LPs, with completeness.",
        },
      ],
    },
    {
      kicker: "Report with confidence",
      intro:
        "Prepare LP reporting from the fund’s underlying records, then review and publish it.",
      points: [
        {
          title: "Fund performance",
          body: "TVPI · DPI · RVPI · MOIC · Net IRR from dated cashflows.",
        },
        {
          title: "Data explorer & tear sheets",
          body: "Slice the portfolio; one-page LP summaries.",
        },
        {
          title: "Auto-filed LP notices",
          body: "Call & distribution PDFs land in each LP's data room.",
        },
      ],
    },
  ],
  steps: [
    {
      label: "Set your mandate",
      body: "Define thesis, stage, and check size — Anker sharpens sourcing and LP matching around it.",
    },
    {
      label: "Operate the fund",
      body: "Track deals, record investments, call capital, and mark NAV from one workspace.",
    },
    {
      label: "Report with confidence",
      body: "Generate LP statements and performance from the same numbers that run the fund.",
    },
  ],
};

export default function VcsSolution() {
  return <SolutionPage c={c} />;
}
