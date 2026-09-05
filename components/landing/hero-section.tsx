"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { HeroMockups } from "./product-mockups";
import { SIGNUPS_ENABLED } from "@/lib/auth/signups";

const words = ["fund", "build", "scale", "launch"];

const stats = [
  { value: "47K+", label: "investors in database", sub: "VCs · Angels · LPs" },
  { value: "20K+", label: "investment firms", sub: "GLOBALLY" },
  { value: "40K+", label: "HNWIs & LPs", sub: "CURATED" },
  { value: "50+", label: "countries covered", sub: "WORLDWIDE" },
];

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => { setIsVisible(true); }, []);
  useEffect(() => {
    const t = setInterval(() => setWordIndex((p) => (p + 1) % words.length), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative overflow-hidden">
      {/* subtle brand dot-grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "26px 26px", maskImage: "linear-gradient(to bottom, black, transparent 85%)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)" }} />

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 pt-28 pb-16 lg:px-12 lg:pt-36 lg:pb-24">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Left — copy */}
          <div>
            <div className={`mb-6 transition-all duration-700 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
              <span className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/[0.03] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-[#e5380f]" /> The AI platform for ventures
              </span>
            </div>

            <h1 className={`font-serif text-[clamp(2.75rem,6vw,5rem)] font-normal leading-[1.03] tracking-[-0.01em] transition-all duration-1000 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
              <span className="block">Your venture</span>
              <span className="block">
                ready to{" "}
                <span className="relative inline-grid align-baseline">
                  {words.map((w, i) => (
                    <span key={w} aria-hidden={i !== wordIndex}
                      className={`col-start-1 row-start-1 pr-1 transition-opacity duration-500 ${i === wordIndex ? "opacity-100" : "opacity-0"}`}>
                      {w}
                    </span>
                  ))}
                  <span className="pointer-events-none absolute -bottom-1 left-0 right-1 h-[3px] bg-[#e5380f]" />
                </span>
              </span>
            </h1>

            <p className={`mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground transition-all delay-200 duration-700 lg:text-xl ${isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
              AI-powered fundraising intelligence. Find the right investors, craft compelling pitches, and close your round faster.
            </p>

            <div className={`mt-8 flex flex-col items-start gap-4 transition-all delay-300 duration-700 sm:flex-row ${isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
              <Button size="lg" className="group h-14 rounded-full bg-foreground px-8 text-base text-background hover:bg-foreground/90" asChild>
                <a href={SIGNUPS_ENABLED ? "/register" : "/login"}>
                  {SIGNUPS_ENABLED ? "Start Fundraising" : "Sign in"}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="h-14 rounded-full border-foreground/20 px-8 text-base hover:bg-foreground/5" asChild>
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>
          </div>

          {/* Right — floating dashboard mockups */}
          <div className={`relative hidden min-h-[440px] items-center justify-center transition-all delay-300 duration-1000 lg:flex ${isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
            <HeroMockups className="scale-[0.92] xl:scale-100" />
          </div>
        </div>

        {/* Stats — contained editorial row */}
        <div className={`mt-16 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-foreground/10 pt-10 transition-all delay-500 duration-700 lg:mt-24 lg:grid-cols-4 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          {stats.map((s) => (
            <div key={s.sub} className="flex flex-col">
              <span className="font-display text-4xl leading-none lg:text-5xl">{s.value}</span>
              <span className="mt-3 text-sm text-muted-foreground">{s.label}</span>
              <span className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
