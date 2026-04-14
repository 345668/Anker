"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AnimatedWave } from "@/components/landing/animated-wave";

const footerLinks = {
  Platform: [
    { name: "Submit Pitch", href: "/pitch" },
    { name: "Investor Matching", href: "#" },
    { name: "Pitch Analysis", href: "#" },
    { name: "Research Tools", href: "#" },
  ],
  Company: [
    { name: "Portfolio", href: "#portfolio" },
    { name: "Industries", href: "#industries" },
    { name: "Team", href: "#team" },
    { name: "Newsroom", href: "/newsroom" },
  ],
  Resources: [
    { name: "FAQ", href: "/faq" },
    { name: "Documentation", href: "#" },
    { name: "API Access", href: "#" },
    { name: "Contact", href: "#contact", badge: "Open" },
  ],
  Legal: [
    { name: "Privacy", href: "/privacy" },
    { name: "Terms", href: "/terms" },
    { name: "Security", href: "#" },
  ],
};

const socialLinks = [
  { name: "Twitter", href: "https://twitter.com" },
  { name: "LinkedIn", href: "https://linkedin.com" },
  { name: "GitHub", href: "https://github.com" },
];

export function FooterSection() {
  return (
    <footer id="contact" className="relative border-t border-foreground/10">
      {/* Animated wave background */}
      <div className="absolute inset-0 h-64 opacity-20 pointer-events-none overflow-hidden">
        <AnimatedWave />
      </div>
      
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Main Footer */}
        <div className="py-16 lg:py-24">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-12 lg:gap-8">
            {/* Brand Column */}
            <div className="col-span-2">
              <Link href="/" className="inline-flex items-center gap-2 mb-6">
                <span className="text-2xl font-display">Anker</span>
                <span className="text-xs text-muted-foreground font-mono">VC</span>
              </Link>

              <p className="text-muted-foreground leading-relaxed mb-8 max-w-xs">
                Fueling vision with capital. AI-powered investor matching for founders who build the future.
              </p>

              {/* Social Links */}
              <div className="flex gap-6">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                ))}
              </div>
            </div>

            {/* Link Columns */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium mb-6">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                      >
                        {link.name}
                        {"badge" in link && link.badge && (
                          <span className="text-xs px-2 py-0.5 bg-foreground text-background rounded-full">
                            {link.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {new Date().getFullYear()} Anker VC. All rights reserved.
          </p>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
