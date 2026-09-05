"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { MomentumCard, StatTile } from "./product-mockups";
import { SIGNUPS_ENABLED } from "@/lib/auth/signups";

export function CtaSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-24 lg:py-32">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-12">
        <div
          className={`relative overflow-hidden rounded-[2rem] bg-foreground text-background transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          {/* dot-grid texture + accent glow */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "24px 24px" }} />
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(229,56,15,0.35), transparent 70%)" }} />

          <div className="relative z-10 grid items-center gap-12 px-8 py-16 lg:grid-cols-2 lg:px-16 lg:py-24">
            {/* Left */}
            <div>
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-background/20 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-background/70">
                <Sparkles className="h-3.5 w-3.5 text-[#e5380f]" /> Get started
              </span>
              <h2 className="mb-6 font-serif text-4xl leading-[0.98] tracking-tight lg:text-6xl">
                Ready to fund
                <br />
                your vision?
              </h2>
              <p className="mb-10 max-w-xl text-lg leading-relaxed text-background/60">
                Join hundreds of founders who&apos;ve raised over $2.4B using Anker.
                Start your fundraising journey today.
              </p>

              <div className="flex flex-col items-start gap-4 sm:flex-row">
                <Button size="lg" className="group h-14 rounded-full bg-background px-8 text-base text-foreground hover:bg-background/90" asChild>
                  <a href={SIGNUPS_ENABLED ? "/register" : "/login"}>
                    {SIGNUPS_ENABLED ? "Start Fundraising Free" : "Sign in"}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="h-14 rounded-full border-background/25 bg-transparent px-8 text-base text-background hover:bg-background/10" asChild>
                  <a href="/contact">Contact Us</a>
                </Button>
              </div>

              <p className="mt-8 font-mono text-sm text-background/50">Free to start. No credit card required.</p>
            </div>

            {/* Right — floating mockups (white cards pop on the dark block) */}
            <div className="relative hidden min-h-[300px] items-center justify-center lg:flex">
              <div className="animate-floaty w-[300px] drop-shadow-2xl">
                <MomentumCard />
              </div>
              <div className="animate-floaty absolute -right-2 top-4" style={{ animationDelay: "1.4s" }}>
                <StatTile value="$2.4B" label="Raised on Anker" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
