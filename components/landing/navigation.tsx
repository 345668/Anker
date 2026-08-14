"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, ChevronDown, Compass, Target, Wallet, PieChart, Send, Newspaper, Rocket, Building2, Users } from "lucide-react";
import { AnkerLogo } from "@/components/brand/anker-logo";
import { SIGNUP_CTA_VISIBLE } from "@/lib/auth/signups";
import { ThemeToggle } from "@/components/theme-toggle";

const PRODUCT = [
  { name: "Discover", desc: "Find & match investors", href: "/products/discover", icon: Compass },
  { name: "Deal Flow", desc: "Source & track deals", href: "/products/deal-flow", icon: Target },
  { name: "Fund OS", desc: "Fund admin · NAV · LPs", href: "/products/fund-os", icon: Wallet },
  { name: "Cap Table", desc: "Ownership & scenarios", href: "/products/cap-table", icon: PieChart },
  { name: "Outreach", desc: "Campaigns & inbox", href: "/products/outreach", icon: Send },
  { name: "Newsroom", desc: "Private-capital intelligence", href: "/newsroom", icon: Newspaper },
];

const SOLUTIONS = [
  { name: "For Founders", desc: "Raise your round, end to end", href: "/solutions/founders", icon: Rocket },
  { name: "For Venture Funds", desc: "Source deals & run the fund", href: "/solutions/vcs", icon: Building2 },
  { name: "For LPs", desc: "Portfolio visibility & reporting", href: "/solutions/lps", icon: Users },
];

const LINKS = [
  { name: "Pitch us", href: "/apply" },
  { name: "Changelog", href: "/changelog" },
  { name: "Newsroom", href: "/newsroom" },
  { name: "Contact", href: "/contact" },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`fixed z-50 transition-all duration-500 ${isScrolled ? "top-4 left-4 right-4" : "top-0 left-0 right-0"}`}>
      <nav className={`mx-auto transition-all duration-500 ${isScrolled || isMobileMenuOpen ? "bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-lg max-w-[1200px]" : "bg-transparent max-w-[1400px]"}`}>
        <div className={`flex items-center justify-between transition-all duration-500 px-6 lg:px-8 ${isScrolled ? "h-14" : "h-20"}`}>
          {/* Logo */}
          <a href="/" className="flex items-center group" aria-label="Anker — home">
            <AnkerLogo className={`w-auto transition-all duration-500 ${isScrolled ? "h-8" : "h-10"}`} />
          </a>

          {/* Desktop mega-nav */}
          <div className="hidden md:flex items-center gap-8">
            <MegaMenu label="Product" items={PRODUCT} cols={2} wide />
            <MegaMenu label="Solutions" items={SOLUTIONS} cols={1} />
            <a href="/changelog" className="text-sm text-foreground/70 hover:text-foreground transition-colors">Changelog</a>
            <a href="/apply" className="text-sm text-foreground/70 hover:text-foreground transition-colors">Pitch us</a>
            <a href="/contact" className="text-sm text-foreground/70 hover:text-foreground transition-colors">Contact</a>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle className="inline-flex items-center justify-center h-8 w-8 rounded-full text-foreground/70 hover:text-foreground hover:bg-foreground/5" />
            <a href="/login" className={`text-foreground/70 hover:text-foreground transition-all duration-500 ${isScrolled ? "text-xs" : "text-sm"}`}>Sign in</a>
            <Button size="sm" className={`bg-foreground hover:bg-foreground/90 text-background rounded-full transition-all duration-500 ${isScrolled ? "px-4 h-8 text-xs" : "px-6"}`} asChild>
              <a href={SIGNUP_CTA_VISIBLE ? "/register" : "/login"}>{SIGNUP_CTA_VISIBLE ? "Get Started" : "Sign in"}</a>
            </Button>
          </div>

          {/* Mobile toggle */}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2" aria-label="Toggle menu">
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div className={`md:hidden fixed inset-0 bg-background z-40 transition-all duration-500 ${isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} style={{ top: 0 }}>
        <div className="flex flex-col h-full px-8 pt-28 pb-8 overflow-y-auto">
          <div className="flex-1 flex flex-col gap-8">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Product</div>
              <div className="flex flex-col gap-4">
                {PRODUCT.map((p) => (
                  <a key={p.name} href={p.href} onClick={() => setIsMobileMenuOpen(false)} className="text-2xl font-serif text-foreground">{p.name}</a>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Solutions</div>
              <div className="flex flex-col gap-4">
                {SOLUTIONS.map((p) => (
                  <a key={p.name} href={p.href} onClick={() => setIsMobileMenuOpen(false)} className="text-2xl font-serif text-foreground">{p.name}</a>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {LINKS.map((l) => (
                <a key={l.name} href={l.href} onClick={() => setIsMobileMenuOpen(false)} className="text-lg text-foreground/80">{l.name}</a>
              ))}
            </div>
          </div>
          <div className="flex gap-4 pt-8 border-t border-foreground/10">
            <Button variant="outline" className="flex-1 rounded-full h-14 text-base" onClick={() => setIsMobileMenuOpen(false)} asChild>
              <a href="/login">Sign in</a>
            </Button>
            {SIGNUP_CTA_VISIBLE && (
              <Button className="flex-1 bg-foreground text-background rounded-full h-14 text-base" onClick={() => setIsMobileMenuOpen(false)} asChild>
                <a href="/register">Get Started</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MegaMenu({ label, items, cols = 2, wide = false }: { label: string; items: typeof PRODUCT; cols?: 1 | 2; wide?: boolean }) {
  return (
    <div className="relative group">
      <button className="inline-flex items-center gap-1 text-sm text-foreground/70 hover:text-foreground transition-colors py-2">
        {label}
        <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
      </button>
      {/* bridge to prevent hover flicker */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200">
        <div className={`rounded-2xl border border-foreground/10 bg-background/95 backdrop-blur-xl shadow-xl p-3 ${wide ? "w-[520px]" : "w-[300px]"}`}>
          <div className={`grid gap-1 ${cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <a key={it.name} href={it.href} className="flex items-start gap-3 rounded-xl p-3 hover:bg-foreground/[0.05] transition-colors">
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-foreground/[0.06] text-foreground/80 shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{it.name}</span>
                    <span className="block text-xs text-muted-foreground">{it.desc}</span>
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
