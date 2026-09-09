"use client";

import { useNavPersona } from "./nav-persona";
import Link from "next/link";
import {
  Compass,
  Send,
  FileUp,
  PieChart,
  Target,
  PhoneCall,
  Plus,
  Banknote,
  ArrowRight,
} from "lucide-react";

type Action = { label: string; href: string; icon: any };

const FOUNDER: Action[] = [
  { label: "Find investors", href: "/dashboard/find-investors", icon: Compass },
  { label: "Draft outreach", href: "/dashboard/outreach", icon: Send },
  { label: "Upload deck", href: "/dashboard/pitch-deck", icon: FileUp },
  { label: "Cap table", href: "/dashboard/cap-table", icon: PieChart },
];

const VC: Action[] = [
  {
    label: "Call capital",
    href: "/dashboard/portfolio/fund/calls/new",
    icon: PhoneCall,
  },
  {
    label: "New investment",
    href: "/dashboard/portfolio/fund/investments",
    icon: Target,
  },
  {
    label: "Create distribution",
    href: "/dashboard/portfolio/fund/distributions/new",
    icon: Banknote,
  },
  { label: "New deal", href: "/dashboard/portfolio/fund/deals", icon: Plus },
];

const LP: Action[] = [
  { label: "Capital account", href: "/lp", icon: PieChart },
  { label: "Distributions", href: "/lp/distributions", icon: Banknote },
  { label: "Documents", href: "/lp/documents", icon: FileUp },
  { label: "Settings", href: "/dashboard/settings", icon: Compass },
];

/** Quick actions follow the selected workspace persona. */
export function QuickStart({ persona }: { persona?: "founder" | "vc" | "lp" }) {
  const context = useNavPersona();
  const active = persona ?? context.active;
  const actions = active === "vc" ? VC : active === "lp" ? LP : FOUNDER;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
        <span
          className="w-2 h-2"
          style={{ backgroundColor: "var(--platform-link)" }}
        />
        Quick start
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.label}
              href={a.href}
              className="group flex items-center gap-3 rounded border border-border bg-card px-3 sm:px-4 py-3.5 hover:border-foreground/40 transition-colors"
            >
              <span className="grid place-items-center w-9 h-9 rounded-md bg-foreground/[0.06] text-foreground/80 shrink-0">
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-sm font-medium flex-1 min-w-0">
                {a.label}
              </span>
              <ArrowRight className="hidden sm:block w-4 h-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
