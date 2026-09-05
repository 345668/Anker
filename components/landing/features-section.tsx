"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MatchCard, MomentumCard, MixDonut, PipelineCard } from "./product-mockups";

interface Feature {
  number: string;
  tag: string;
  title: string;
  description: string;
  visual: ReactNode;
}

const features: Feature[] = [
  {
    number: "01", tag: "MATCH", title: "AI Investor Matching",
    description: "Our AI analyzes your startup profile against 47,000+ investors to find the perfect matches based on stage, sector, and investment thesis.",
    visual: <MatchCard />,
  },
  {
    number: "02", tag: "PITCH", title: "Smart Pitch Analysis",
    description: "Get instant feedback on your pitch deck with AI-powered insights. Identify weaknesses, highlight strengths, and optimize for investor engagement.",
    visual: <MomentumCard />,
  },
  {
    number: "03", tag: "SECURE", title: "Deal Room & Data Room",
    description: "Securely share documents with investors. Track engagement, manage access, and keep your fundraising organized in one place.",
    visual: <MixDonut />,
  },
  {
    number: "04", tag: "TRACK", title: "Pipeline Management",
    description: "Track every investor conversation from first contact to term sheet. Never miss a follow-up with smart reminders and CRM integration.",
    visual: <PipelineCard />,
  },
];

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.2 });
    if (ref.current) o.observe(ref.current);
    const t = setTimeout(() => setVisible(true), 500);
    return () => { o.disconnect(); clearTimeout(t); };
  }, []);
  const reversed = index % 2 === 1;

  return (
    <div ref={ref}
      className={`grid items-center gap-10 py-14 lg:grid-cols-2 lg:gap-20 lg:py-20 transition-all duration-700 ${visible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"}`}>
      {/* Copy */}
      <div className={reversed ? "lg:order-2" : ""}>
        <span className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          <span className="h-1.5 w-1.5 bg-[#e5380f]" /> {feature.number} · {feature.tag}
        </span>
        <h3 className="mb-4 font-serif text-3xl tracking-tight lg:text-4xl">{feature.title}</h3>
        <p className="max-w-md text-lg leading-relaxed text-muted-foreground">{feature.description}</p>
      </div>

      {/* Visual — mockup card in a tinted device frame */}
      <div className={reversed ? "lg:order-1" : ""}>
        <div className="relative rounded-3xl border border-foreground/10 bg-gradient-to-br from-foreground/[0.04] to-[#e5380f]/[0.04] p-8 sm:p-12">
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl opacity-[0.5]"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "22px 22px", opacity: 0.05 }} />
          <div className="relative mx-auto max-w-[340px]">{feature.visual}</div>
        </div>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.1 });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []);

  return (
    <section id="features" ref={ref} className="relative border-t border-foreground/10 py-24 lg:py-32">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-12">
        <div className="mb-8 grid gap-8 lg:mb-12 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <span className="mb-6 inline-flex items-center gap-3 font-mono text-sm text-muted-foreground">
              <span className="h-px w-8 bg-[#e5380f]" /> Capabilities
            </span>
            <h2 className={`font-serif text-4xl tracking-tight transition-all duration-700 lg:text-6xl ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
              Everything you need.
              <br />
              <span className="text-muted-foreground">Nothing you don&apos;t.</span>
            </h2>
          </div>
          <p className="text-base leading-relaxed text-muted-foreground lg:col-span-4">
            One platform for the whole raise — from finding the right investors to closing the round. No sprawl, no busywork.
          </p>
        </div>

        <div className="divide-y divide-foreground/10">
          {features.map((f, i) => <FeatureRow key={f.number} feature={f} index={i} />)}
        </div>
      </div>
    </section>
  );
}
