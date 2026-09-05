"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { MetricTiles, type Metric } from "@/components/data/metric-tiles";

type Tab = { key: string; label: string; title: string; desc: string; href: string; metrics: Metric[] };

const TABS: Tab[] = [
  {
    key: "fund-os", label: "Fund OS", title: "Fund administration, done right",
    desc: "Investments, NAV, capital calls, distributions, and LP reporting — accurate numbers that reconcile, with a self-serve LP portal.",
    href: "/solutions/vcs",
    metrics: [{ label: "Net IRR", value: "24.5%", delta: { value: "+3.1", positive: true } }, { label: "TVPI", value: "1.58×" }, { label: "DPI", value: "0.35×" }, { label: "Fund size", value: "$62M" }],
  },
  {
    key: "deal-flow", label: "Deal Flow", title: "Source, score, and close",
    desc: "A shared pipeline from inbound to IC to close, with AI scoring, deal memos, and ownership tracking.",
    href: "/solutions/vcs",
    metrics: [{ label: "Active deals", value: "128" }, { label: "In diligence", value: "14" }, { label: "Pipeline", value: "$210M" }, { label: "Avg. cycle", value: "38d" }],
  },
  {
    key: "cap-table", label: "Cap Table", title: "Ownership & scenarios",
    desc: "Model dilution, SAFEs, and financing rounds, and keep a clean, investor-ready cap table with scenario modeling.",
    href: "/solutions/founders",
    metrics: [{ label: "Fully diluted", value: "72.25M" }, { label: "Amount raised", value: "$15.3M" }, { label: "Your ownership", value: "41.5%" }, { label: "Option pool", value: "12%" }],
  },
  {
    key: "outreach", label: "Outreach", title: "Campaigns & inbox",
    desc: "AI-drafted, personalized outreach with sequences, a shared inbox, and deliverability built for founders and IR teams.",
    href: "/solutions/founders",
    metrics: [{ label: "Sent", value: "1,240" }, { label: "Reply rate", value: "31%", delta: { value: "+9", positive: true } }, { label: "Meetings", value: "48" }, { label: "Deliverability", value: "99%" }],
  },
];

export function ProductTabsSection() {
  const [active, setActive] = useState(0);
  const t = TABS[active];
  return (
    <section className="relative py-24 lg:py-32 border-t border-foreground/10 bg-foreground/[0.02]">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        <h2 className="font-serif font-normal text-3xl md:text-4xl lg:text-5xl tracking-tight">One platform. Every stage.</h2>
        <p className="mt-3 text-lg text-muted-foreground max-w-2xl">A suite that starts strong and scales with you — from your first check to your fifth fund.</p>

        <div className="mt-12 border border-foreground/12 rounded-2xl overflow-hidden grid lg:grid-cols-[240px_1fr]">
          {/* Tabs */}
          <div className="border-b lg:border-b-0 lg:border-r border-foreground/12">
            <div className="flex items-center gap-2 px-5 py-4 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground border-b border-foreground/10">
              <span className="w-2 h-2 bg-[#e5380f]" /> Products &amp; features
            </div>
            <div className="flex lg:flex-col overflow-x-auto">
              {TABS.map((tab, i) => (
                <button
                  key={tab.key}
                  onClick={() => setActive(i)}
                  className={`shrink-0 text-left px-5 py-4 text-sm font-mono uppercase tracking-wider border-b border-foreground/8 transition-colors ${i === active ? "bg-foreground text-background" : "text-foreground/70 hover:bg-foreground/[0.04]"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 lg:p-10">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="font-serif font-normal text-2xl lg:text-3xl leading-snug">{t.title}</h3>
                <p className="mt-3 text-sm lg:text-base text-muted-foreground leading-relaxed">{t.desc}</p>
                <a href={t.href} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground group">
                  Learn more <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
              <div className="rounded-xl border border-foreground/12 bg-foreground/[0.02] p-4">
                <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground mb-3">Krakatoa Ventures · Fund III</div>
                <MetricTiles metrics={t.metrics} columns={2} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
