"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { AnimatedTesseract } from "@/components/tesseract/animated-tesseract";
import { SIGNUPS_ENABLED } from "@/lib/auth/signups";

const words = ["fund", "scale", "launch", "grow"];

export default function PlatformPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % words.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main>
        {/* Hero Section - Optimus style */}
        <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
          {/* Animated Anker background */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] lg:w-[800px] lg:h-[800px] opacity-50 pointer-events-none">
            <AnimatedTesseract />
          </div>
          
          {/* Subtle grid lines */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
            {[...Array(8)].map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute h-px bg-foreground/10"
                style={{
                  top: `${12.5 * (i + 1)}%`,
                  left: 0,
                  right: 0,
                }}
              />
            ))}
            {[...Array(12)].map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute w-px bg-foreground/10"
                style={{
                  left: `${8.33 * (i + 1)}%`,
                  top: 0,
                  bottom: 0,
                }}
              />
            ))}
          </div>
          
          <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 py-32 lg:py-40">
            {/* Eyebrow */}
            <div 
              className={`mb-8 transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
                <span className="w-8 h-px bg-foreground/30" />
                The platform for founders
              </span>
            </div>
            
            {/* Main headline */}
            <div className="mb-12">
              <h1
                className={`text-[clamp(2.75rem,8vw,6.5rem)] font-serif font-normal leading-[1.02] tracking-[-0.01em] transition-all duration-1000 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
              >
                <span className="block">Ready to</span>
                <span className="block">
                  <span className="relative inline-block">
                    <span 
                      key={wordIndex}
                      className="inline-flex"
                    >
                      {words[wordIndex].split("").map((char, i) => (
                        <span
                          key={`${wordIndex}-${i}`}
                          className="inline-block animate-char-in"
                          style={{
                            animationDelay: `${i * 50}ms`,
                          }}
                        >
                          {char}
                        </span>
                      ))}
                    </span>
                    <span className="absolute -bottom-2 left-0 right-0 h-3 bg-foreground/10" />
                  </span>
                </span>
              </h1>
            </div>
            
            {/* Description and CTAs */}
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-end">
              <p 
                className={`text-xl lg:text-2xl text-muted-foreground leading-relaxed max-w-xl transition-all duration-700 delay-200 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                Join thousands of founders connecting with the right investors. 
                AI-powered matchmaking, zero guesswork.
              </p>
              
              {/* CTAs */}
              <div 
                className={`flex flex-col sm:flex-row items-start gap-4 transition-all duration-700 delay-300 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <Button 
                  asChild
                  size="lg" 
                  className="bg-foreground hover:bg-foreground/90 text-background px-8 h-14 text-base rounded-full group"
                >
                  <Link href={SIGNUPS_ENABLED ? "/auth/sign-up" : "/auth/login"}>
                    {SIGNUPS_ENABLED ? "Start building free" : "Sign in"}
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button 
                  asChild
                  size="lg" 
                  variant="outline" 
                  className="h-14 px-8 text-base rounded-full border-foreground/20 hover:bg-foreground/5"
                >
                  <Link href="/auth/login">
                    Sign in
                  </Link>
                </Button>
              </div>
            </div>
            
            {/* No credit card required */}
            <p 
              className={`text-sm text-muted-foreground mt-8 font-mono transition-all duration-700 delay-400 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              No credit card required
            </p>
          </div>
          
          {/* Stats marquee - Optimus style */}
          <div 
            className={`absolute bottom-24 left-0 right-0 transition-all duration-700 delay-500 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="flex gap-16 marquee whitespace-nowrap">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex gap-16">
                  {[
                    { value: "$2.4B", label: "raised by founders", company: "TOTAL" },
                    { value: "847", label: "successful matches", company: "FOUNDERS" },
                    { value: "92%", label: "match accuracy", company: "AI ENGINE" },
                    { value: "14 days", label: "avg. time to term sheet", company: "SPEED" },
                  ].map((stat) => (
                    <div key={`${stat.company}-${i}`} className="flex items-baseline gap-4">
                      <span className="text-4xl lg:text-5xl font-serif">{stat.value}</span>
                      <span className="text-sm text-muted-foreground">
                        {stat.label}
                        <span className="block font-mono text-xs mt-1">{stat.company}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section - Optimus style */}
        <section className="py-24 lg:py-32 border-t border-foreground/10">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            {/* Section header */}
            <div className="max-w-3xl mb-16">
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
                <span className="w-8 h-px bg-foreground/30" />
                How it works
              </span>
              <h2 className="text-4xl lg:text-6xl font-serif tracking-tight mb-6">
                Your fundraise,
                <br />
                supercharged
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Three simple steps to connect with investors who actually fund companies like yours.
              </p>
            </div>

            {/* Features grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-foreground/10">
              {[
                {
                  step: "01",
                  title: "Build your profile",
                  description: "Share your company details, metrics, and fundraising goals. Our AI analyzes over 50 data points to understand your unique position.",
                },
                {
                  step: "02",
                  title: "Get matched",
                  description: "Our algorithms scan thousands of investors to find those with proven track records funding companies at your stage and sector.",
                },
                {
                  step: "03",
                  title: "Start conversations",
                  description: "Reach out with confidence using AI-generated insights about each investor's preferences, portfolio, and decision-making patterns.",
                },
              ].map((feature, index) => (
                <div
                  key={feature.step}
                  className={`bg-background p-8 lg:p-12 transition-all duration-700 ${
                    isVisible
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: `${600 + index * 150}ms` }}
                >
                  <span className="font-mono text-sm text-muted-foreground mb-6 block">
                    {feature.step}
                  </span>
                  <h3 className="text-2xl font-serif mb-4">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section - Optimus style */}
        <section className="py-24 lg:py-32 bg-foreground text-background">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">
              <div>
                <h2 className="text-4xl lg:text-6xl font-serif tracking-tight mb-6 leading-[0.95]">
                  Ready to find
                  <br />
                  your investors?
                </h2>
                <p className="text-xl text-background/70 leading-relaxed mb-8">
                  Join hundreds of founders who&apos;ve already found their perfect investor match.
                </p>
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <Button 
                    asChild
                    size="lg" 
                    className="bg-background hover:bg-background/90 text-foreground px-8 h-14 text-base rounded-full group"
                  >
                    <Link href={SIGNUPS_ENABLED ? "/auth/sign-up" : "/auth/login"}>
                      {SIGNUPS_ENABLED ? "Get started free" : "Sign in"}
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button 
                    asChild
                    size="lg" 
                    variant="outline" 
                    className="h-14 px-8 text-base rounded-full border-background/20 text-background hover:bg-background/10"
                  >
                    <Link href="/contact">
                      Talk to us
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: "50+", label: "Data points analyzed" },
                    { value: "10K+", label: "Investors in database" },
                    { value: "92%", label: "Match accuracy" },
                    { value: "24/7", label: "AI assistance" },
                  ].map((stat) => (
                    <div key={stat.label} className="p-6 border border-background/10">
                      <span className="text-3xl font-serif block mb-2">{stat.value}</span>
                      <span className="text-sm text-background/60 font-mono">{stat.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <FooterSection />
    </div>
  );
}
