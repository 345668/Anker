"use client";

import { useEffect, useState, useRef } from "react";

/**
 * `live` MUST reflect a real, shipped integration. Audited 2026-09: LinkedIn is
 * the only connected source (the LinkedOut extension suite); every other entry
 * had zero implementing code while being presented as an aggregated feed. Flip
 * a flag to true only when the integration actually ships — a logo a buyer
 * reads as "connected" is the claim that surfaces in diligence.
 */
const dataSources = [
  { name: "LinkedIn", category: "Network Data", live: true },
  { name: "Crunchbase", category: "Company Data", live: false },
  { name: "PitchBook", category: "Deal Intelligence", live: false },
  { name: "SEC Filings", category: "Regulatory", live: false },
  { name: "AngelList", category: "Startup Data", live: false },
  { name: "CB Insights", category: "Market Intel", live: false },
  { name: "Preqin", category: "LP Data", live: false },
  { name: "Dealroom", category: "European Data", live: false },
  { name: "Tracxn", category: "Emerging Markets", live: false },
  { name: "Mattermark", category: "Growth Signals", live: false },
  { name: "Owler", category: "Competitive Intel", live: false },
  { name: "PrivCo", category: "Private Markets", live: false },
];

export function IntegrationsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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

  return (
    <section id="data-sources" ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div
          className={`text-center max-w-3xl mx-auto mb-16 lg:mb-24 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-[#e5380f]" />
            Data Sources
            <span className="w-8 h-px bg-[#e5380f]" />
          </span>
          <h2 className="text-4xl lg:text-6xl font-serif tracking-tight mb-6">
            Built on
            <br />
            the network graph.
          </h2>
          <p className="text-xl text-muted-foreground">
            LinkedIn is connected today, powering warm-intro paths. These are the sources
            we&apos;re evaluating for future integrations.
          </p>
        </div>

      </div>
      
      {/* Full-width marquees outside container */}
      <div className="w-full mb-6">
        <div className="flex gap-6 marquee">
          {[...Array(2)].map((_, setIndex) => (
            <div key={setIndex} className="flex gap-6 shrink-0">
              {dataSources.map((source) => (
                <div
                  key={`${source.name}-${setIndex}`}
                  className="shrink-0 rounded-2xl px-8 py-6 border border-foreground/10 bg-card/50 hover:border-[#e5380f]/40 hover:bg-foreground/[0.02] transition-all duration-300 group"
                >
                  <div className="text-lg font-medium group-hover:translate-x-1 transition-transform">
                    {source.name}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {source.category}
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        source.live
                          ? "bg-[#e5380f]/10 text-[#e5380f]"
                          : "bg-foreground/[0.06] text-muted-foreground"
                      }`}
                    >
                      {source.live ? "Connected" : "Soon"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      
      {/* Reverse marquee */}
      <div className="w-full">
        <div className="flex gap-6 marquee-reverse">
          {[...Array(2)].map((_, setIndex) => (
            <div key={setIndex} className="flex gap-6 shrink-0">
              {[...dataSources].reverse().map((source) => (
                <div
                  key={`${source.name}-reverse-${setIndex}`}
                  className="shrink-0 rounded-2xl px-8 py-6 border border-foreground/10 bg-card/50 hover:border-[#e5380f]/40 hover:bg-foreground/[0.02] transition-all duration-300 group"
                >
                  <div className="text-lg font-medium group-hover:translate-x-1 transition-transform">
                    {source.name}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {source.category}
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        source.live
                          ? "bg-[#e5380f]/10 text-[#e5380f]"
                          : "bg-foreground/[0.06] text-muted-foreground"
                      }`}
                    >
                      {source.live ? "Connected" : "Soon"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
