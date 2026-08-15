"use client";

import { AnkerLogo } from "@/components/brand/anker-logo";
import { openCookiePreferences } from "@/lib/consent";

const COLUMNS: { heading: string; accent?: boolean; links: { name: string; href: string; badge?: string }[] }[] = [
  {
    heading: "Anker for",
    accent: true,
    links: [
      { name: "Founders", href: "/solutions/founders" },
      { name: "Venture Funds", href: "/solutions/vcs" },
      { name: "Limited Partners", href: "/solutions/lps" },
    ],
  },
  {
    heading: "Founder Suite",
    accent: true,
    links: [
      { name: "Find Investors", href: "/products/discover" },
      { name: "Cap Table", href: "/products/cap-table" },
      { name: "Runway", href: "/solutions/founders" },
      { name: "Data Room", href: "/solutions/founders" },
      { name: "Raise Pipeline", href: "/solutions/founders" },
    ],
  },
  {
    heading: "Fund OS",
    accent: true,
    links: [
      { name: "Fund Administration", href: "/products/fund-os" },
      { name: "Fund Performance", href: "/products/fund-os" },
      { name: "Financial Reporting", href: "/products/fund-os" },
      { name: "Deal Flow", href: "/products/deal-flow" },
      { name: "LP Matchmaking", href: "/solutions/vcs" },
      { name: "Compliance", href: "/solutions/vcs" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { name: "Newsroom", href: "/newsroom" },
      { name: "Fundraising Guide", href: "/fundraising-guide" },
      { name: "Pitch Deck Templates", href: "/pitch-deck-templates" },
      { name: "Investor Database", href: "/investor-database" },
      { name: "Changelog", href: "/changelog" },
      { name: "Pitch us", href: "/apply" },
    ],
  },
  {
    heading: "Company",
    links: [
      { name: "About", href: "/about" },
      { name: "Careers", href: "/careers", badge: "Hiring" },
      { name: "Vision", href: "/vision" },
      { name: "Security", href: "/security" },
      { name: "Contact", href: "/contact" },
    ],
  },
];

const SOCIAL = [
  { name: "LinkedIn", href: "#" },
  { name: "X", href: "#" },
  { name: "GitHub", href: "#" },
];

export function FooterSection() {
  return (
    <footer className="relative border-t border-foreground/10 bg-foreground/[0.015]">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Columns */}
        <div className="py-16 lg:py-20 grid grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <div className="flex items-center gap-2 mb-5 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                <span className={`w-2 h-2 ${col.accent ? "bg-[#e5380f]" : "bg-foreground/40"}`} />
                {col.heading}
              </div>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.name}>
                    <a href={l.href} className="inline-flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground transition-colors">
                      {l.name}
                      {l.badge && <span className="text-[9px] font-mono uppercase tracking-wider bg-emerald-600/15 text-emerald-600 px-1.5 py-0.5 rounded">{l.badge}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="py-8 border-t border-foreground/10 flex flex-col sm:flex-row items-start sm:items-center gap-6 justify-between">
          <div className="flex items-center">
            <AnkerLogo className="h-8 w-auto" />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Anker</span>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/terms" className="hover:text-foreground">Terms</a>
            <a href="/security" className="hover:text-foreground">Security</a>
            <button type="button" onClick={() => openCookiePreferences()} className="hover:text-foreground">Cookie settings</button>
            <span className="w-px h-3 bg-foreground/15" />
            {SOCIAL.map((s) => (
              <a key={s.name} href={s.href} className="font-mono uppercase tracking-wider hover:text-foreground">{s.name}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
