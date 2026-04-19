"use client";

import { useState, useEffect, useRef } from "react";
import { Target, Users, FileText, TrendingUp } from "lucide-react";

const platformFeatures = [
  {
    icon: Target,
    label: "AI Matching",
    title: "Find your perfect investors",
    description: "Our AI analyzes your startup profile against 60,000+ investors to surface the ones most likely to invest in companies like yours.",
    stats: [
      { value: "92%", label: "Match accuracy" },
      { value: "3.2x", label: "Faster intros" },
    ]
  },
  {
    icon: Users,
    label: "Investor Network",
    title: "Access the largest database",
    description: "20,000+ VCs and investment firms plus 40,000+ HNWIs and LPs. Curated profiles with investment history, check sizes, and thesis.",
    stats: [
      { value: "60K+", label: "Investors" },
      { value: "50+", label: "Countries" },
    ]
  },
  {
    icon: FileText,
    label: "Pitch Intelligence",
    title: "Perfect your pitch",
    description: "AI-powered pitch deck analysis with feedback from patterns of successful raises. Know exactly what investors want to see.",
    stats: [
      { value: "1000+", label: "Decks analyzed" },
      { value: "47%", label: "Higher response" },
    ]
  },
  {
    icon: TrendingUp,
    label: "Pipeline CRM",
    title: "Track every conversation",
    description: "From first contact to term sheet, manage your entire fundraising pipeline. Never miss a follow-up or lose track of warm intros.",
    stats: [
      { value: "6 weeks", label: "Avg close time" },
      { value: "2.4x", label: "More meetings" },
    ]
  },
];

export function DevelopersSection() {
  const [activeFeature, setActiveFeature] = useState(0);
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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % platformFeatures.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const feature = platformFeatures[activeFeature];

  return (
    <section id="platform" ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left: Content */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Platform
            </span>
            <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8">
              Everything you need
              <br />
              <span className="text-muted-foreground">to close your round.</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-12 leading-relaxed">
              From investor discovery to term sheet, Anker gives you the tools, 
              data, and intelligence to fundraise like a pro.
            </p>
            
            {/* Feature Navigation */}
            <div className="space-y-4">
              {platformFeatures.map((f, index) => (
                <button
                  key={f.label}
                  onClick={() => setActiveFeature(index)}
                  className={`w-full text-left p-4 border transition-all duration-300 ${
                    activeFeature === index 
                      ? "border-foreground bg-foreground/[0.02]" 
                      : "border-foreground/10 hover:border-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <f.icon className={`w-5 h-5 transition-colors ${
                      activeFeature === index ? "text-foreground" : "text-muted-foreground"
                    }`} />
                    <span className={`font-medium transition-colors ${
                      activeFeature === index ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {f.label}
                    </span>
                    {activeFeature === index && (
                      <span className="ml-auto w-2 h-2 bg-foreground rounded-full" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Right: Feature Detail */}
          <div
            className={`lg:sticky lg:top-32 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            <div className="border border-foreground/10 p-8 lg:p-12">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 flex items-center justify-center border border-foreground/10">
                  <feature.icon className="w-6 h-6" />
                </div>
                <span className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
                  {feature.label}
                </span>
              </div>
              
              <h3 className="text-2xl lg:text-3xl font-display mb-4">
                {feature.title}
              </h3>
              
              <p className="text-muted-foreground leading-relaxed mb-8">
                {feature.description}
              </p>
              
              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-foreground/10">
                {feature.stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="text-3xl font-display mb-1">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Progress indicator */}
            <div className="mt-6 flex gap-2">
              {platformFeatures.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-1 flex-1 transition-all duration-300 ${
                    idx === activeFeature ? "bg-foreground" : "bg-foreground/10"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
