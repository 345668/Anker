"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  PieChart,
  Search,
  TrendingUp,
  Wallet,
  FileText,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { NativeTool, ToolAudience } from "@/lib/tools/manifest"

const CAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "SaaS": TrendingUp,
  "Ecommerce": Building2,
  "Unit Economics": PieChart,
  "Cash & Runway": Wallet,
  "Valuation": Briefcase,
  "Cap Table": Layers,
  "VC Fund Modeling": Briefcase,
  "VC Performance": TrendingUp,
  "Tax & Legal": FileText,
}

const AUDIENCE_LABEL: Record<ToolAudience, string> = {
  founder: "Founder",
  vc: "VC / Fund",
  both: "Both",
}
const AUDIENCE_TONE: Record<ToolAudience, string> = {
  founder: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  vc: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  both: "bg-amber-500/10 text-amber-700 border-amber-500/20",
}

export function ToolsIndex({ tools }: { tools: NativeTool[] }) {
  const [query, setQuery] = useState("")
  const [audience, setAudience] = useState<ToolAudience | "all">("all")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tools.filter((t) => {
      if (audience !== "all" && t.audience !== audience && t.audience !== "both") return false
      if (activeCategory && t.category !== activeCategory) return false
      if (!q) return true
      return [t.title, t.description, t.category].join(" ").toLowerCase().includes(q)
    })
  }, [tools, query, audience, activeCategory])

  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tools) {
      if (audience !== "all" && t.audience !== audience && t.audience !== "both") continue
      m.set(t.category, (m.get(t.category) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [tools, audience])

  const shippedCount = tools.filter((t) => t.status === "shipped").length

  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4">
            <span className="w-8 h-px bg-foreground/30" />
            Tools · {shippedCount} shipped · {tools.length - shippedCount} planned
          </span>
          <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-4">
            Calculators,
            <br />
            built natively.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Every model rebuilt as a live in-platform calculator with its own xlsx
            export — original Anker code, no licensed templates.
          </p>
        </div>
      </div>

      <div className="border-b border-foreground/10 sticky top-0 bg-background z-10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-4 flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools…" className="pl-9 h-10" />
          </div>
          <div className="inline-flex items-center gap-1 p-1 border border-foreground/10 rounded-full">
            {(["all", "founder", "vc"] as const).map((a) => (
              <button
                key={a}
                onClick={() => { setAudience(a); setActiveCategory(null) }}
                className={cn(
                  "px-4 h-8 rounded-full text-xs font-medium transition-colors",
                  audience === a ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                {a === "all" ? "All" : a === "founder" ? "Founder" : "VC / Fund"}
              </button>
            ))}
          </div>
          <span className="text-xs font-mono text-muted-foreground ml-auto">
            {filtered.length} of {tools.length}
          </span>
        </div>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 pb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              "px-3 h-7 rounded-full text-xs font-medium transition-colors border",
              !activeCategory ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-muted-foreground hover:border-foreground/30",
            )}
          >
            All categories
          </button>
          {categories.map(([cat, n]) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={cn(
                "px-3 h-7 rounded-full text-xs font-medium transition-colors border inline-flex items-center gap-1.5",
                activeCategory === cat ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-muted-foreground hover:border-foreground/30",
              )}
            >
              {cat}
              <span className="font-mono text-[10px] opacity-60">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((t) => {
            const Icon = CAT_ICONS[t.category] ?? FileText
            const isShipped = t.status === "shipped"
            const Inner = (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-md bg-foreground/5 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("px-2 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-wider border", AUDIENCE_TONE[t.audience])}>
                      {AUDIENCE_LABEL[t.audience]}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider inline-flex items-center gap-1",
                        isShipped ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700",
                      )}
                    >
                      {isShipped ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {isShipped ? "live" : "planned"}
                    </span>
                  </div>
                </div>
                <h3 className="font-display text-xl mb-2">{t.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">{t.description}</p>
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-foreground/5">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {t.category}{t.exports.length ? ` · exports: ${t.exports.join(", ")}` : ""}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 text-xs font-mono", isShipped ? "text-foreground" : "text-muted-foreground")}>
                    {isShipped ? "Open" : "Coming soon"}
                    {isShipped && <ArrowRight className="w-3 h-3" />}
                  </span>
                </div>
              </>
            )
            return isShipped ? (
              <Link
                key={t.slug}
                href={t.href}
                className="border border-foreground/10 rounded-lg p-6 hover:border-foreground/30 transition-colors flex flex-col group"
              >{Inner}</Link>
            ) : (
              <div key={t.slug} className="border border-dashed border-foreground/10 rounded-lg p-6 flex flex-col opacity-70">
                {Inner}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
