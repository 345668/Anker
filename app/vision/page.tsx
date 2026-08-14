"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { AnimatedSphere } from "@/components/landing/animated-sphere";

const pillars = [
  {
    number: "I",
    title: "Democratize Access",
    description: "Break down barriers between founders and capital. Use technology to level the playing field for entrepreneurs regardless of their network or background.",
  },
  {
    number: "II",
    title: "Intelligence at Scale",
    description: "Harness AI and data to make smarter investment decisions. Surface the best opportunities and match them with the right investors.",
  },
  {
    number: "III",
    title: "Build for Europe",
    description: "Create solutions designed for European markets. Understand local contexts, navigate regulatory complexity, and celebrate continental diversity.",
  },
];

const beliefs = [
  {
    statement: "Europe will produce the next trillion-dollar company",
    context: "With deep technical talent, strong research universities, and a maturing startup ecosystem, the opportunity to build category-defining companies has never been greater.",
  },
  {
    statement: "The best founders are everywhere",
    context: "Talent is equally distributed, but opportunity is not. We're using technology to change that equation.",
  },
  {
    statement: "Venture capital needs to evolve",
    context: "The traditional VC model was built for Silicon Valley. We're building what venture looks like for Europe and beyond.",
  },
];

export default function VisionPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeBelief, setActiveBelief] = useState(0);
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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveBelief((prev) => (prev + 1) % beliefs.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero Section with Animated Sphere */}
      <section ref={heroRef} className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
                <span className="w-8 h-px bg-foreground/30" />
                Our Vision
              </span>
              <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight mb-8">
                {["Reimagining", "venture", "for", "Europe"].map((word, i) => (
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
                Anker is an early-stage concept, born from research in December 2025:
                one operating system for the whole private-capital lifecycle —
                founders raising, VCs running funds, and LPs tracking their capital.
              </p>
            </div>
            <div className="relative h-[400px] lg:h-[500px]">
              <AnimatedSphere />
            </div>
          </div>
        </div>
      </section>

      {/* Strategic Pillars - Dark Section */}
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
          <div className="mb-16 lg:mb-24">
            <span className="inline-flex items-center gap-3 text-sm font-mono text-background/50 mb-6">
              <span className="w-8 h-px bg-background/30" />
              Strategic Pillars
            </span>
            <h2 className="font-serif text-4xl lg:text-6xl tracking-tight">
              How we&apos;re building
              <br />
              <span className="text-background/50">the future.</span>
            </h2>
          </div>

          <div className="space-y-0">
            {pillars.map((pillar) => (
              <div 
                key={pillar.number}
                className="py-10 border-b border-background/10 group"
              >
                <div className="flex items-start gap-8">
                  <span className="font-serif text-4xl text-background/30 shrink-0">{pillar.number}</span>
                  <div className="flex-1">
                    <h3 className="font-serif text-2xl lg:text-3xl text-background mb-3 group-hover:translate-x-2 transition-transform duration-300">
                      {pillar.title}
                    </h3>
                    <p className="text-background/60 leading-relaxed max-w-2xl">
                      {pillar.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beliefs Section - Rotating */}
      <section className="py-24 lg:py-32 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-4 mb-16">
            <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Core Beliefs
            </span>
            <div className="flex-1 h-px bg-foreground/10" />
            <span className="font-mono text-xs text-muted-foreground">
              {String(activeBelief + 1).padStart(2, "0")} / {String(beliefs.length).padStart(2, "0")}
            </span>
          </div>

          <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
            <div className="lg:col-span-8">
              <blockquote className="transition-all duration-500">
                <p className="font-serif text-4xl md:text-5xl lg:text-6xl leading-[1.1] tracking-tight text-foreground">
                  "{beliefs[activeBelief].statement}"
                </p>
              </blockquote>
              <p className="mt-8 text-lg text-muted-foreground max-w-2xl">
                {beliefs[activeBelief].context}
              </p>
            </div>

            <div className="lg:col-span-4 flex flex-col justify-end">
              <div className="flex gap-2">
                {beliefs.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveBelief(idx)}
                    className={`h-2 transition-all duration-300 ${
                      idx === activeBelief
                        ? "w-8 bg-foreground"
                        : "w-2 bg-foreground/20 hover:bg-foreground/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Impact Metrics */}
      <section className="py-24 lg:py-32 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-16">
            <div>
              <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
                Where we are
              </span>
              <h2 className="font-serif text-4xl lg:text-5xl tracking-tight mb-6">
                Day one, honestly
              </h2>
              <p className="text-lg text-muted-foreground">
                Anker began as a research concept in December 2025. We&apos;re at the
                very start — pre-seed, pre-raise — building the product in the open
                before we raise our first round.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-px bg-foreground/10">
              <div className="p-8 bg-background">
                <span className="font-serif text-5xl text-foreground">Dec 2025</span>
                <p className="text-sm text-muted-foreground mt-2">Concept, from first-principles research</p>
              </div>
              <div className="p-8 bg-background">
                <span className="font-serif text-5xl text-foreground">Pre-seed</span>
                <p className="text-sm text-muted-foreground mt-2">Current stage</p>
              </div>
              <div className="p-8 bg-background">
                <span className="font-serif text-5xl text-foreground">$0</span>
                <p className="text-sm text-muted-foreground mt-2">Raised to date — no round yet</p>
              </div>
              <div className="p-8 bg-background">
                <span className="font-serif text-5xl text-foreground">1</span>
                <p className="text-sm text-muted-foreground mt-2">Person building it</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 lg:py-32 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 text-center">
          <h2 className="font-serif text-4xl lg:text-5xl tracking-tight mb-6">
            Join us in building this future
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Whether you&apos;re a founder, investor, or operator, there&apos;s a place 
            for you in the Tesseract ecosystem.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              href="/platform"
              className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:bg-foreground/90 transition-colors group"
            >
              Get Started
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link 
              href="/about"
              className="inline-flex items-center gap-2 px-6 py-3 border border-foreground/20 text-foreground text-sm font-medium rounded-full hover:border-foreground hover:bg-foreground/5 transition-all"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
