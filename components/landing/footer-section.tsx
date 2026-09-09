"use client";

import { AnkerLogo } from "@/components/brand/anker-logo";
import { openCookiePreferences } from "@/lib/consent";

const COLUMNS: {
  heading: string;
  accent?: boolean;
  links: { name: string; href: string; badge?: string }[];
}[] = [
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
      { name: "Fundraising Guide", href: "/fundraising-guide" },
      { name: "Pitch Deck Templates", href: "/pitch-deck-templates" },
      { name: "Investor Database", href: "/investor-database" },
      { name: "Newsroom", href: "/newsroom" },
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

export function FooterSection() {
  return (
    <footer className="marketing-site border-t border-foreground/15">
      <div className="max-w-[1376px] mx-auto px-6 lg:px-12">
        <div className="py-12 flex flex-col md:flex-row justify-between items-start gap-8 border-b border-foreground/15">
          <a href="/" aria-label="Anker home">
            <AnkerLogo variant="default" className="h-10 w-auto" />
          </a>
          <p className="font-serif text-2xl md:text-3xl max-w-md leading-snug">
            The next interface
            <br />
            for venture.
          </p>
          <a
            href="/contact"
            className="text-sm font-semibold underline underline-offset-4 py-3"
          >
            Start a conversation
          </a>
        </div>
        <nav
          aria-label="Footer"
          className="py-12 grid grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8"
        >
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="text-sm font-semibold mb-5">{col.heading}</h2>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="py-8 border-t border-foreground/15 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
          <span className="mr-auto">© {new Date().getFullYear()} Anker</span>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/security">Security</a>
          <a href="/faq">FAQ</a>
          <button type="button" onClick={() => openCookiePreferences()}>
            Cookie settings
          </button>
          <a
            href="https://github.com/345668/Anker"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
