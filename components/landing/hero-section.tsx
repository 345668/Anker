"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AnimatedSphere } from "./animated-sphere";
import { SIGNUPS_ENABLED } from "@/lib/auth/signups";

const words = ["fund", "build", "scale", "launch"];

const stats = [
  { value: "60K+", label: "investors in database", sub: "VCs & LPs" },
  { value: "20K+", label: "investment firms", sub: "GLOBALLY" },
  { value: "40K+", label: "HNWIs & LPs", sub: "CURATED" },
  { value: "50+", label: "countries covered", sub: "WORLDWIDE" },
];

export function HeroSection() {
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
    <section className="relative flex min-h-screen flex-col justify-center overflow-hidden">
      {/* Animated sphere — constrained + clipped so it never bleeds past the edge */}
      <div className="pointer-events-none absolute -right-24 top-1/2 h-[520px] w-[520px] -translate-y-1/2 opacity-30 lg:h-[720px] lg:w-[720px]">
        <AnimatedSphere />
      </div>

      {/* Subtle brand dot-grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-16 pt-32 lg:px-12 lg:pt-40">
        {/* Eyebrow */}
        <div
          className={`mb-8 transition-all duration-700 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <span className="inline-flex items-center gap-3 font-mono text-sm text-muted-foreground">
            <span className="h-px w-8 bg-[#e5380f]" />
            The AI platform for ventures
          </span>
        </div>

        {/* Main headline */}
        <h1
          className={`mb-10 font-serif text-[clamp(2.75rem,8vw,6.5rem)] font-normal leading-[1.02] tracking-[-0.01em] transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <span className="block">Your venture</span>
          <span className="block">
            ready to{" "}
            {/* Stacked words share one grid cell → container is as wide as the
                widest word, so the swap never clips or shifts layout. */}
            <span className="relative inline-grid align-baseline">
              {words.map((w, i) => (
                <span
                  key={w}
                  aria-hidden={i !== wordIndex}
                  className={`col-start-1 row-start-1 pr-1 transition-opacity duration-500 ${
                    i === wordIndex ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {w}
                </span>
              ))}
              <span className="pointer-events-none absolute -bottom-1 left-0 right-1 h-[3px] bg-[#e5380f]" />
            </span>
          </span>
        </h1>

        {/* Description + CTAs */}
        <div className="grid items-end gap-10 lg:grid-cols-2 lg:gap-24">
          <p
            className={`max-w-xl text-xl leading-relaxed text-muted-foreground transition-all delay-200 duration-700 lg:text-2xl ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            AI-powered fundraising intelligence. Find the right investors,
            craft compelling pitches, and close your round faster.
          </p>

          <div
            className={`flex flex-col items-start gap-4 transition-all delay-300 duration-700 sm:flex-row ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            <Button
              size="lg"
              className="group h-14 rounded-full bg-foreground px-8 text-base text-background hover:bg-foreground/90"
              asChild
            >
              <a href={SIGNUPS_ENABLED ? "/register" : "/login"}>
                {SIGNUPS_ENABLED ? "Start Fundraising" : "Sign in"}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 rounded-full border-foreground/20 px-8 text-base hover:bg-foreground/5"
              asChild
            >
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </div>
        </div>

        {/* Stats — contained editorial row (replaces the edge-bleeding marquee) */}
        <div
          className={`mt-16 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-foreground/10 pt-10 transition-all delay-500 duration-700 lg:mt-24 lg:grid-cols-4 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          {stats.map((stat) => (
            <div key={stat.sub} className="flex flex-col">
              <span className="font-display text-4xl leading-none lg:text-5xl">{stat.value}</span>
              <span className="mt-3 text-sm text-muted-foreground">{stat.label}</span>
              <span className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
                {stat.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
