"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, ChevronDown, ArrowRight, ArrowUpRight } from "lucide-react";
import { AnkerLogo } from "@/components/brand/anker-logo";
import { SIGNUP_CTA_VISIBLE } from "@/lib/auth/signups";
import { ThemeToggle } from "@/components/theme-toggle";
// Nav taxonomy is shared with the in-app shell so the two never drift.
import { SUITES, SOLUTIONS, NAV_LINKS as LINKS } from "@/lib/nav/taxonomy";

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
          <a href="/" className="flex items-center group" aria-label="Anker — home">
            <AnkerLogo className={`w-auto transition-all duration-500 ${isScrolled ? "h-8" : "h-10"}`} />
          </a>

          <div className="hidden md:flex items-center gap-7">
            <ProductsMega />
            <SolutionsMega />
            <a href="/fundraising-guide" className="text-sm text-foreground/70 hover:text-foreground transition-colors">Resources</a>
            <a href="/vision" className="text-sm text-foreground/70 hover:text-foreground transition-colors">Company</a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle className="inline-flex items-center justify-center h-8 w-8 rounded-full text-foreground/70 hover:text-foreground hover:bg-foreground/5" />
            <a href="/login" className={`text-foreground/70 hover:text-foreground transition-all duration-500 ${isScrolled ? "text-xs" : "text-sm"}`}>Sign in</a>
            <Button size="sm" className={`bg-foreground hover:bg-foreground/90 text-background rounded-full transition-all duration-500 ${isScrolled ? "px-4 h-8 text-xs" : "px-6"}`} asChild>
              <a href={SIGNUP_CTA_VISIBLE ? "/register" : "/login"}>{SIGNUP_CTA_VISIBLE ? "Get Started" : "Sign in"}</a>
            </Button>
          </div>

          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2" aria-label="Toggle menu">
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div className={`md:hidden fixed inset-0 bg-background z-40 transition-all duration-500 ${isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} style={{ top: 0 }}>
        <div className="flex flex-col h-full px-8 pt-28 pb-8 overflow-y-auto">
          <div className="flex-1 flex flex-col gap-8">
            {SUITES.map((s) => (
              <div key={s.key}>
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">{s.label}</div>
                <div className="flex flex-col gap-3">
                  {s.items.map((p) => (
                    <a key={p.name} href={p.href} onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-serif text-foreground">{p.name}</a>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Anker for</div>
              <div className="flex flex-col gap-3">
                {SOLUTIONS.map((p) => (
                  <a key={p.name} href={p.href} onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-serif text-foreground">{p.name}</a>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {LINKS.map((l) => (
                <a key={l.name} href={l.href} onClick={() => setIsMobileMenuOpen(false)} className="text-base text-foreground/80">{l.name}</a>
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

/** Carta-style Products mega-menu: left suite tabs → right items + featured card. */
function ProductsMega() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suite = SUITES[active];

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="inline-flex items-center gap-1 text-sm text-foreground/70 hover:text-foreground transition-colors py-2">
        Products <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`absolute left-1/2 -translate-x-1/2 top-full pt-3 transition-all duration-200 ${open ? "opacity-100 visible translate-y-0" : "opacity-0 invisible translate-y-1"}`}>
        <div className="w-[880px] rounded-2xl border border-foreground/10 bg-background/98 backdrop-blur-xl shadow-2xl overflow-hidden grid grid-cols-[240px_1fr]">
          {/* Suite tabs */}
          <div className="border-r border-foreground/10 bg-foreground/[0.015] p-3">
            {SUITES.map((s, i) => (
              <button key={s.key} onMouseEnter={() => setActive(i)}
                className={`w-full text-left rounded-xl px-4 py-3 transition-colors ${i === active ? "bg-foreground text-background" : "hover:bg-foreground/[0.05]"}`}>
                <div className="text-[10px] font-mono uppercase tracking-[0.15em] opacity-60 mb-0.5">Suite</div>
                <div className="text-sm font-medium">{s.label}</div>
              </button>
            ))}
          </div>

          {/* Active suite content */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-4 pb-3 mb-3 border-b border-foreground/10">
              <p className="text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground">{suite.tagline}</p>
              <a href={suite.exploreHref} className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline shrink-0">
                Explore the suite <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="grid grid-cols-[1fr_200px] gap-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {suite.items.map((it) => (
                  <a key={it.name} href={it.href} className="group/item block">
                    <div className="text-sm font-medium text-foreground group-hover/item:text-foreground">{it.name}</div>
                    <div className="text-xs text-muted-foreground leading-snug">{it.desc}</div>
                  </a>
                ))}
              </div>
              {/* Featured */}
              <a href={suite.featured.href}
                className={`relative rounded-xl p-4 flex flex-col justify-between overflow-hidden group/feat ${suite.featured.dark ? "bg-[#111] text-white" : "bg-foreground/[0.04]"}`}>
                {suite.featured.dark && (
                  <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)", backgroundSize: "16px 16px" }} aria-hidden />
                )}
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`font-serif text-base ${suite.featured.dark ? "" : "text-foreground"}`}>{suite.featured.title}</span>
                    {suite.featured.badge && <span className="text-[9px] font-mono uppercase tracking-wider bg-[#e5380f] text-white px-1.5 py-0.5">{suite.featured.badge}</span>}
                  </div>
                  <p className={`text-xs leading-snug ${suite.featured.dark ? "text-white/70" : "text-muted-foreground"}`}>{suite.featured.desc}</p>
                </div>
                <span className={`relative mt-3 inline-grid place-items-center w-8 h-8 rounded ${suite.featured.dark ? "bg-[#e5380f] text-white" : "bg-foreground text-background"} group-hover/feat:translate-x-0.5 transition-transform`}>
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Anker for" persona menu. */
function SolutionsMega() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="inline-flex items-center gap-1 text-sm text-foreground/70 hover:text-foreground transition-colors py-2">
        Solutions <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`absolute left-1/2 -translate-x-1/2 top-full pt-3 transition-all duration-200 ${open ? "opacity-100 visible translate-y-0" : "opacity-0 invisible translate-y-1"}`}>
        <div className="w-[300px] rounded-2xl border border-foreground/10 bg-background/98 backdrop-blur-xl shadow-xl p-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground px-3 pt-1 pb-2">Anker for</div>
          {SOLUTIONS.map((it) => (
            <a key={it.name} href={it.href} className="block rounded-xl p-3 hover:bg-foreground/[0.05] transition-colors">
              <div className="text-sm font-medium text-foreground">{it.name}</div>
              <div className="text-xs text-muted-foreground">{it.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
