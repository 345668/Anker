"use client"

import { useMemo, useState } from "react"
import { FileText, ArrowUpRight, Search, ChevronDown, ChevronRight, User } from "lucide-react"
import { FUND_SECTIONS, completeness, type FundTaxonomySection } from "@/lib/dataroom/taxonomy"

export type RoomDoc = {
  id: string
  title: string
  section: string | null
  category: string
  fund_id: string
  fund_lp_id: string | null
  file_name: string | null
  byte_size: number | null
  created_at: string
  description?: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  subscription: "Subscription", quarterly_letter: "Quarterly letter", capital_call: "Capital call",
  distribution: "Distribution", k1: "K-1 / tax", financials: "Financials", policy: "Policy / LPA", other: "Other",
}

const ACCENT = "#127c78"

/**
 * Section-grouped, read-only data-room view for LPs. Groups documents by the
 * ILPA-informed fund taxonomy with a completeness meter. Fund docs only for
 * now (LP-facing); a founder variant can pass FOUNDER_SECTIONS later.
 */
export function RoomSections({ docs, fundNameById }: { docs: RoomDoc[]; fundNameById?: Record<string, string> }) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? docs.filter((d) => `${d.title} ${d.file_name ?? ""} ${d.description ?? ""}`.toLowerCase().includes(q)) : docs
  }, [docs, query])

  const bySection = useMemo(() => {
    const m = new Map<string, RoomDoc[]>()
    for (const d of filtered) {
      const key = d.section ?? "ir"
      const arr = m.get(key) ?? []
      arr.push(d)
      m.set(key, arr)
    }
    return m
  }, [filtered])

  const sectionsWithDocs = useMemo(() => {
    const s = new Set<string>()
    for (const d of docs) if (d.section) s.add(d.section)
    return s
  }, [docs])
  const score = completeness("fund", sectionsWithDocs)

  // Show sections that have documents; plus required-but-empty sections as
  // "missing" nudges (guidance, not a gate).
  const visibleSections: FundTaxonomySection[] = FUND_SECTIONS.filter(
    (s) => bySection.has(s.key) || s.items.some((i) => i.required),
  )

  return (
    <div>
      {/* Completeness header */}
      <div className="border border-foreground/10 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-medium">Data room completeness</div>
            <div className="text-xs text-muted-foreground">{score.met} of {score.total} required sections have documents</div>
          </div>
          <span className="text-2xl font-semibold tabular-nums" style={{ color: ACCENT }}>{score.pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${score.pct}%`, backgroundColor: ACCENT }} />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents…"
          className="w-full rounded-lg border border-foreground/12 bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-foreground/40" />
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {visibleSections.map((section) => {
          const rows = bySection.get(section.key) ?? []
          const isCollapsed = collapsed.has(section.key)
          const requiredMet = section.items.some((i) => i.required) ? rows.length > 0 : null
          return (
            <div key={section.key} className="border border-foreground/10 rounded-xl overflow-hidden">
              <button onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(section.key) ? n.delete(section.key) : n.add(section.key); return n })}
                className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-foreground/[0.02]">
                <div className="flex items-center gap-3">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-sm font-medium">{section.label}</span>
                  <span className="text-xs text-muted-foreground">{rows.length}</span>
                  {requiredMet === false && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">Missing</span>
                  )}
                </div>
              </button>
              {!isCollapsed && (
                <div className="border-t border-foreground/10">
                  {rows.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-muted-foreground">
                      No documents yet.{" "}
                      <span className="text-foreground/70">Expected: {section.items.filter((i) => i.required).map((i) => i.label).join(", ") || section.items.slice(0, 3).map((i) => i.label).join(", ")}</span>
                    </div>
                  ) : (
                    <ul className="divide-y divide-foreground/[0.06]">
                      {rows.map((d) => (
                        <li key={d.id}>
                          <a href={`/api/portfolio/data-room/${d.id}/file`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-4 px-5 py-3 hover:bg-foreground/[0.02] group">
                            <span className="grid place-items-center w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 shrink-0"><FileText className="w-4 h-4 text-foreground/60" /></span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">{d.title}</span>
                                <span className="text-[10px] font-mono uppercase tracking-wider border border-foreground/15 rounded px-1.5 py-0.5 text-foreground/70">{CATEGORY_LABEL[d.category] ?? d.category}</span>
                                {d.fund_lp_id && <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider border border-[#127c78]/25 bg-[#127c78]/10 text-[#127c78] rounded px-1.5 py-0.5"><User className="w-2.5 h-2.5" /> Only you</span>}
                                {fundNameById && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">· {fundNameById[d.fund_id] ?? ""}</span>}
                              </div>
                              <div className="mt-0.5 text-[11px] font-mono text-muted-foreground truncate">
                                {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                {d.byte_size != null && ` · ${(d.byte_size / 1024).toFixed(0)} KB`}
                                {d.file_name && ` · ${d.file_name}`}
                              </div>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
