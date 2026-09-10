"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Overview", href: "/lp" },
  { label: "Capital activity", href: "/lp/distributions" },
  { label: "Documents", href: "/lp/documents" },
  { label: "Call notes", href: "/lp/calls" },
];

/** LP portal sub-navigation (teal accent — LP persona). */
export function LpNav({ oversight = false }: { oversight?: boolean }) {
  const pathname = usePathname() || "";
  return (
    <nav
      aria-label="Investor portal"
      className="platform-section-nav sticky top-0 z-20"
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-10 flex items-center gap-6 overflow-x-auto">
        {TABS.map((t) => {
          const active =
            t.href === "/lp" ? pathname === "/lp" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 relative py-3 text-sm transition-colors ${active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
              {active ? (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[var(--platform-link)]" />
              ) : null}
            </Link>
          );
        })}
        {oversight && (
          <span className="ml-auto shrink-0 my-2 text-xs font-mono uppercase tracking-wider text-[var(--platform-link)] border border-[#127c78]/30 bg-[var(--platform-link)]/10 rounded px-2 py-0.5 self-center">
            Owner oversight — all LPs
          </span>
        )}
      </div>
    </nav>
  );
}
