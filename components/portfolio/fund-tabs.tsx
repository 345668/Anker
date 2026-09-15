"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const BASE = "/dashboard/portfolio/fund";

const TABS: { label: string; href: string; exact?: boolean }[] = [
  { label: "Overview", href: BASE, exact: true },
  { label: "Fund performance", href: `${BASE}/performance` },
  { label: "Investments", href: `${BASE}/investments` },
  { label: "LPs", href: `${BASE}/partners` },
  { label: "Capital activity", href: `${BASE}/calls` },
  { label: "Distributions", href: `${BASE}/distributions` },
  { label: "Financial reporting", href: `${BASE}/reports` },
  { label: "Data explorer", href: `${BASE}/explorer` },
];

// Carta's "More ▾" overflow — secondary fund routes that don't earn a top slot.
const MORE: { label: string; href: string }[] = [
  { label: "Deals", href: `${BASE}/deals` },
  { label: "Tear sheet", href: `${BASE}/tear-sheet` },
  { label: "Economics", href: `${BASE}/economics` },
  { label: "Ledger", href: `${BASE}/ledger` },
  { label: "Legal", href: `${BASE}/legal` },
  { label: "Management co.", href: `${BASE}/management` },
  { label: "Syndication", href: `${BASE}/syndication` },
  { label: "Fund plan", href: `${BASE}/plan` },
  { label: "Assessment", href: `${BASE}/assessment` },
  { label: "LP imports", href: `${BASE}/lp-imports` },
  { label: "Documents", href: `${BASE}/documents` },
];

/** Carta-style fund detail tab bar with a "More" overflow. */
export function FundTabs() {
  const pathname = usePathname() || "";
  const isActive = (href: string, exact?: boolean) =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
  const moreActive = MORE.some((m) => isActive(m.href));

  return (
    <nav
      aria-label="Fund navigation"
      className="platform-section-nav sticky top-[var(--workspace-top)] z-30 flex items-center px-4 lg:px-8"
    >
      <div className="min-w-0 flex-1 flex items-center gap-6 overflow-x-auto">
        {TABS.map((t) => {
          const active = isActive(t.href, t.exact);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 relative min-h-12 flex items-center text-sm border-b-2 ${active ? "border-[var(--platform-link)] text-[var(--platform-link)] font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`ml-4 min-h-12 inline-flex shrink-0 items-center gap-1 border-b-2 text-sm ${moreActive ? "border-[var(--platform-link)] text-[var(--platform-link)]" : "border-transparent text-muted-foreground"}`}
          >
            More <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-[65dvh] w-56 overflow-y-auto"
        >
          {MORE.map((m) => (
            <DropdownMenuItem key={m.href} asChild>
              <Link
                href={m.href}
                aria-current={isActive(m.href) ? "page" : undefined}
                className={`min-h-11 ${isActive(m.href) ? "bg-accent text-accent-foreground font-medium" : ""}`}
              >
                {m.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
