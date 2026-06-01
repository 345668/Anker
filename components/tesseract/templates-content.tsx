"use client"

import { useMemo, useState } from "react"
import {
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Tag,
  Layers,
  CheckSquare,
  TrendingUp,
  Wallet,
  Building2,
  PieChart,
  Briefcase,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  type TemplateAudience,
  type TemplateDef,
  templateUrl,
} from "@/lib/templates/manifest"

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "SaaS": TrendingUp,
  "Ecommerce": Building2,
  "Unit Economics": PieChart,
  "Cash & Runway": Wallet,
  "Valuation": Briefcase,
  "Cap Table": Layers,
  "VC Fund Modeling": Briefcase,
  "VC Performance": TrendingUp,
  "Checklists": CheckSquare,
  "Reference": FileText,
}

const AUDIENCE_LABEL: Record<TemplateAudience, string> = {
  founder: "Founder",
  vc: "VC / Fund",
  both: "Both",
}

const AUDIENCE_TONE: Record<TemplateAudience, string> = {
  founder: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  vc: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  both: "bg-amber-500/10 text-amber-700 border-amber-500/20",
}

export function TemplatesContent({ templates }: { templates: TemplateDef[] }) {
  const [query, setQuery] = useState("")
  const [audience, setAudience] = useState<TemplateAudience | "all">("all")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter((t) => {
      if (audience !== "all" && t.audience !== audience && t.audience !== "both") return false
      if (activeCategory && t.category !== activeCategory) return false
      if (!q) return true
      const hay = [t.title, t.description, t.category, t.tags.join(" "), t.source].join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [templates, query, audience, activeCategory])

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of templates) {
      if (audience !== "all" && t.audience !== audience && t.audience !== "both") continue
      map.set(t.category, (map.get(t.category) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [templates, audience])

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4">
            <span className="w-8 h-px bg-foreground/30" />
            Financial models · {templates.length} templates
          </span>
          <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-4">
            Built once.
            <br />
            Reuse forever.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            VC fund models, SaaS forecasts, cap tables, runway planners, and due-diligence checklists.
            Open-source-licensed; download as .xlsx / .docx / .pdf.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-foreground/10 sticky top-0 bg-background z-10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-4 flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates, tags, sources…"
              className="pl-9 h-10"
            />
          </div>

          {/* Audience pill toggle */}
          <div className="inline-flex items-center gap-1 p-1 border border-foreground/10 rounded-full">
            {(["all", "founder", "vc"] as const).map((a) => (
              <button
                key={a}
                onClick={() => {
                  setAudience(a)
                  setActiveCategory(null)
                }}
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
            {filtered.length} of {templates.length}
          </span>
        </div>

        {/* Category chips */}
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 pb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              "px-3 h-7 rounded-full text-xs font-medium transition-colors border",
              !activeCategory
                ? "bg-foreground text-background border-foreground"
                : "border-foreground/15 text-muted-foreground hover:border-foreground/30",
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
                activeCategory === cat
                  ? "bg-foreground text-background border-foreground"
                  : "border-foreground/15 text-muted-foreground hover:border-foreground/30",
              )}
            >
              {cat}
              <span className="font-mono text-[10px] opacity-60">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No templates match your filters.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((t) => {
              const Icon = CATEGORY_ICONS[t.category] ?? FileText
              const url = templateUrl(t)
              return (
                <div
                  key={t.slug}
                  className="border border-foreground/10 rounded-lg p-6 hover:border-foreground/30 transition-colors flex flex-col"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-md bg-foreground/5 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-wider border",
                          AUDIENCE_TONE[t.audience],
                        )}
                      >
                        {AUDIENCE_LABEL[t.audience]}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        {t.kind}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-display text-xl mb-2">{t.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                    {t.description}
                  </p>

                  {t.sheets && (
                    <div className="text-xs font-mono text-muted-foreground mb-3 line-clamp-1">
                      Sheets: {t.sheets.slice(0, 4).join(" · ")}
                      {t.sheets.length > 4 && ` +${t.sheets.length - 4}`}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {t.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded font-mono text-[10px] text-muted-foreground bg-foreground/5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-foreground/5">
                    <span className="text-[10px] font-mono text-muted-foreground inline-flex items-center gap-1.5">
                      <Tag className="w-3 h-3" />
                      {t.source}
                    </span>
                    <Button asChild size="sm" className="rounded-full h-8">
                      <a href={url} download={t.filename} className="inline-flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
