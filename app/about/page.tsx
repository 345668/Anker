"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";

const values = [
  {
    number: "01",
    title: "Founder First",
    description: "Every decision we make starts with one question: how does this help founders succeed? We exist to serve entrepreneurs building the future.",
  },
  {
    number: "02", 
    title: "Radical Transparency",
    description: "We believe in open communication. From our investment criteria to our decision timelines, founders always know where they stand.",
  },
  {
    number: "03",
    title: "Long-term Partnership",
    description: "We're building for the long arc of a fund and a company — tools you keep using well beyond any single round.",
  },
  {
    number: "04",
    title: "Data-Driven Conviction",
    description: "We combine human intuition with AI-powered analysis to make smarter investment decisions, faster.",
  },
];

const milestones = [
  { year: "Dec 2025", event: "Anker begins as a research concept", metric: "First principles" },
  { year: "2026", event: "Building the venture OS in the open", metric: "Pre-seed" },
];

export default function AboutPage() {
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero Section */}
      <section ref={heroRef} className="relative pt-32 pb-24 lg:pt-40 lg:pb-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
                <span className="w-8 h-px bg-foreground/30" />
                About Anker
              </span>
              <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight mb-8">
                {["One", "system", "for", "private", "capital"].map((word, i) => (
                  <span
                    key={word}
                    className={`inline-block mr-4 transition-all duration-700 ${
                      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                    }`}
                    style={{ transitionDelay: `${i * 100}ms` }}
                  >
                    {word}
                  </span>
                ))}
              </h1>
              <p className="text-xl text-muted-foreground max-w-xl leading-relaxed">
                Anker is an AI-native operating system for the whole private-capital
                lifecycle — founders raising, VCs running funds, and LPs tracking their
                capital. It began as a research concept in December 2025.
              </p>
            </div>
            <div className="lg:col-span-5 flex items-end">
              <div className="w-full border border-foreground/10 p-8">
                <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
                  Where we are
                </span>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <span className="font-serif text-4xl text-foreground">Dec 2025</span>
                    <p className="text-sm text-muted-foreground mt-1">Concept, from research</p>
                  </div>
                  <div>
                    <span className="font-serif text-4xl text-foreground">Pre-seed</span>
                    <p className="text-sm text-muted-foreground mt-1">Current stage</p>
                  </div>
                  <div>
                    <span className="font-serif text-4xl text-foreground">$0</span>
                    <p className="text-sm text-muted-foreground mt-1">Raised — no round yet</p>
                  </div>
                  <div>
                    <span className="font-serif text-4xl text-foreground">1</span>
                    <p className="text-sm text-muted-foreground mt-1">Person building it</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section - Dark */}
      <section className="relative py-24 lg:py-32 bg-foreground text-background">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <div className="absolute inset-0" style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 40px,
              currentColor 40px,
              currentColor 41px
            )`
          }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
          <div className="mb-16">
            <span className="inline-flex items-center gap-3 text-sm font-mono text-background/50 mb-6">
              <span className="w-8 h-px bg-background/30" />
              Our Values
            </span>
            <h2 className="font-serif text-4xl lg:text-6xl tracking-tight">
              What drives us
              <br />
              <span className="text-background/50">every day.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-background/10">
            {values.map((value) => (
              <div 
                key={value.number}
                className="p-8 lg:p-12 bg-foreground group hover:bg-background/5 transition-colors duration-500"
              >
                <span className="font-mono text-sm text-background/30 block mb-4">{value.number}</span>
                <h3 className="font-serif text-2xl lg:text-3xl text-background mb-4 group-hover:translate-x-2 transition-transform duration-300">
                  {value.title}
                </h3>
                <p className="text-background/60 leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-24 lg:py-32 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="mb-16">
            <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
              Our Journey
            </span>
            <h2 className="font-serif text-4xl lg:text-5xl tracking-tight">
              Just getting started
            </h2>
          </div>

          <div className="space-y-0">
            {milestones.map((milestone, idx) => (
              <div 
                key={milestone.year}
                className="py-8 border-b border-foreground/10 grid grid-cols-12 gap-4 items-center group hover:bg-foreground/[0.02] transition-colors duration-300"
              >
                <div className="col-span-2">
                  <span className="font-serif text-3xl lg:text-4xl text-foreground">{milestone.year}</span>
                </div>
                <div className="col-span-6">
                  <p className="text-lg text-foreground group-hover:translate-x-2 transition-transform duration-300">
                    {milestone.event}
                  </p>
                </div>
                <div className="col-span-4 text-right">
                  <span className="font-mono text-sm text-muted-foreground">{milestone.metric}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 lg:py-32 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-serif text-4xl lg:text-5xl tracking-tight mb-6">
                Ready to build
                <br />
                <span className="text-muted-foreground">with us?</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-md">
                Whether you&apos;re a founder seeking capital or an investor looking for opportunities, 
                we&apos;d love to hear from you.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/products/discover"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:bg-foreground/90 transition-colors group"
                >
                  Start Building
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link 
                  href="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-foreground/20 text-foreground text-sm font-medium rounded-full hover:border-foreground hover:bg-foreground/5 transition-all"
                >
                  Get in Touch
                </Link>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="grid grid-cols-2 gap-4">
                <Link 
                  href="/team"
                  className="p-8 border border-foreground/10 hover:border-foreground/30 transition-colors group"
                >
                  <span className="font-mono text-xs text-muted-foreground block mb-4">Meet the</span>
                  <span className="font-serif text-2xl text-foreground flex items-center gap-2">
                    Team
                    <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </Link>
                <Link 
                  href="/vision"
                  className="p-8 border border-foreground/10 hover:border-foreground/30 transition-colors group"
                >
                  <span className="font-mono text-xs text-muted-foreground block mb-4">Our</span>
                  <span className="font-serif text-2xl text-foreground flex items-center gap-2">
                    Vision
                    <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
