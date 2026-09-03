"use client";

import { useEffect, useState, useRef } from "react";

const dataSources = [
  { name: "Crunchbase", category: "Company Data" },
  { name: "PitchBook", category: "Deal Intelligence" },
  { name: "LinkedIn", category: "Network Data" },
  { name: "SEC Filings", category: "Regulatory" },
  { name: "AngelList", category: "Startup Data" },
  { name: "CB Insights", category: "Market Intel" },
  { name: "Preqin", category: "LP Data" },
  { name: "Dealroom", category: "European Data" },
  { name: "Tracxn", category: "Emerging Markets" },
  { name: "Mattermark", category: "Growth Signals" },
  { name: "Owler", category: "Competitive Intel" },
  { name: "PrivCo", category: "Private Markets" },
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
            Intelligence from
            <br />
            the best sources.
          </h2>
          <p className="text-xl text-muted-foreground">
            We aggregate data from 12+ premium sources to build the most comprehensive investor profiles.
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
                  className="shrink-0 px-8 py-6 border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.02] transition-all duration-300 group"
                >
                  <div className="text-lg font-medium group-hover:translate-x-1 transition-transform">
                    {source.name}
                  </div>
                  <div className="text-sm text-muted-foreground">{source.category}</div>
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
                  className="shrink-0 px-8 py-6 border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.02] transition-all duration-300 group"
                >
                  <div className="text-lg font-medium group-hover:translate-x-1 transition-transform">
                    {source.name}
                  </div>
                  <div className="text-sm text-muted-foreground">{source.category}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
