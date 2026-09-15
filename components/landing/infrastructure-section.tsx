"use client";

import { useEffect, useState, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const investorTypes = [
  { type: "Venture Capital", count: "Profile set", description: "Seed to growth-stage funds" },
  { type: "Angel Investors", count: "Profile set", description: "Individual angels & syndicates" },
  { type: "Family Offices", count: "Profile set", description: "Single & multi-family offices" },
  { type: "Private Equity", count: "Profile set", description: "Growth & buyout funds" },
  { type: "Corporate VCs", count: "Profile set", description: "Strategic investors" },
  { type: "Limited Partners", count: "Profile set", description: "LPs, endowments & foundations" },
];

export function InfrastructureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeType, setActiveType] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(() => {
      setActiveType((prev) => (prev + 1) % investorTypes.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  return (
    <section ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden bg-foreground/[0.02] border-t border-foreground/10">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Left: Content */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-[#e5380f]" />
              Investor Database
            </span>
            <h2 className="text-4xl lg:text-6xl font-serif tracking-tight mb-8">
              Every investor
              <br />
              type covered.
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed mb-12">
              From seed-stage angels to institutional LPs, our database covers 
              the full spectrum of capital sources. Updated weekly with new 
              investment activity, portfolio companies, and thesis changes.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8">
              <div>
                <div className="text-4xl lg:text-5xl font-serif mb-2">Curated</div>
                <div className="text-sm text-muted-foreground">Investor profiles</div>
              </div>
              <div>
                <div className="text-4xl lg:text-5xl font-serif mb-2">Weekly</div>
                <div className="text-sm text-muted-foreground">Data updates</div>
              </div>
              <div>
                <div className="text-4xl lg:text-5xl font-serif mb-2">Rich</div>
                <div className="text-sm text-muted-foreground">Context on each profile</div>
              </div>
            </div>
          </div>

          {/* Right: Investor type list */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            <div className="border border-foreground/10">
              {/* Header */}
              <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
                <span className="text-sm font-mono text-muted-foreground">Investor Types</span>
                <span className="flex items-center gap-2 text-xs font-mono text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live data
                </span>
              </div>

              {/* Types */}
              <div>
                {investorTypes.map((investor, index) => (
                  <div
                    key={investor.type}
                    className={`px-6 py-5 border-b border-foreground/5 last:border-b-0 flex items-center justify-between transition-all duration-300 ${
                      activeType === index ? "bg-foreground/[0.02]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span 
                        className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                          activeType === index ? "bg-foreground" : "bg-foreground/20"
                        }`}
                      />
                      <div>
                        <div className="font-medium">{investor.type}</div>
                        <div className="text-sm text-muted-foreground">{investor.description}</div>
                      </div>
                    </div>
                    <span className="font-mono text-sm text-muted-foreground">{investor.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
