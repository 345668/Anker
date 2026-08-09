"use client";

import { ArrowUpRight } from "lucide-react";

const RESOURCES = [
  { tag: "Guide", title: "The fundraising playbook", desc: "How founders run a tight, investor-ready raise on Anker.", href: "/newsroom" },
  { tag: "Article", title: "How investor matching works", desc: "Semantic matching across 60k+ investors, firms, and LPs.", href: "/platform" },
  { tag: "Tool", title: "Fund model & IRR", desc: "Model returns, TVPI/DPI, and carry with native calculators.", href: "/platform" },
  { tag: "Collection", title: "Anker Newsroom", desc: "Independent reporting on private capital and venture flows.", href: "/newsroom" },
];

export function ResourcesSection() {
  return (
    <section className="relative py-24 lg:py-32 overflow-hidden">
      {/* dotted grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1.5px)",
          backgroundSize: "22px 22px",
          color: "var(--foreground)",
          maskImage: "radial-gradient(120% 90% at 50% 40%, #000 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 40%, #000 30%, transparent 85%)",
          opacity: 0.08,
        }}
      />
      <div className="relative max-w-[1400px] mx-auto px-6 lg:px-12">
        <h2 className="text-center font-serif font-normal text-4xl md:text-5xl tracking-tight mb-16">Related resources</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
          {RESOURCES.map((r) => (
            <a key={r.title} href={r.href} className="group relative block border-t border-foreground/15 pt-5">
              <span className="absolute right-0 -top-5 grid place-items-center w-9 h-9 bg-foreground/[0.06] text-foreground/60 transition-colors group-hover:bg-[#e5380f] group-hover:text-white">
                <ArrowUpRight className="w-4 h-4" />
              </span>
              <span className="inline-block text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground bg-foreground/[0.06] px-2 py-1 mb-5">{r.tag}</span>
              <h3 className="font-serif font-normal text-2xl leading-snug mb-3 pr-8">{r.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
