"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, ArrowUpRight, Search, ChevronDown, ChevronRight, User, Upload, Loader2, Check, Plus, Send } from "lucide-react"
import { sectionsFor, completeness, itemCompleteness, type RoomType, type TaxonomySection } from "@/lib/dataroom/taxonomy"

export type RoomDoc = {
  id: string
  title: string
  section: string | null
  item_key?: string | null
  category: string
  fund_id: string | null
  fund_lp_id: string | null
  file_name: string | null
  byte_size: number | null
  created_at: string
  description?: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  subscription: "Subscription", quarterly_letter: "Quarterly letter", capital_call: "Capital call",
  distribution: "Distribution", k1: "K-1 / tax", financials: "Financials", policy: "Policy / LPA", other: "Document",
}

/**
 * Section-grouped data-room view for both the LP-facing fund room (read-only)
 * and the founder raise room (upload-enabled). Groups by the room's taxonomy
 * with a completeness meter + missing-section nudges.
 */
export function RoomSections({
  docs, room = "fund", fundNameById, canUpload = false, fileHrefFor, requestToken,
}: {
  docs: RoomDoc[]
  room?: RoomType
  fundNameById?: Record<string, string>
  /** Founder room: show per-section upload. */
  canUpload?: boolean
  /** Override the file link (e.g. tokenized investor view). */
  fileHrefFor?: (id: string) => string
  /** Tokenized investor view: enables "Request" on missing checklist items. */
  requestToken?: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<string | null>(null)
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const pendingItemKey = useRef<string | null>(null)

  const accent = room === "founder" ? "#e5380f" : "#127c78"
  const fileHref = fileHrefFor ?? ((id: string) => (room === "founder" ? `/api/dataroom/founder/${id}/file` : `/api/portfolio/data-room/${id}/file`))
  const sections = sectionsFor(room)
  const showChecklist = room === "founder"

  // Which checklist items are covered by a tagged document + the doc per item.
  const docByItem = useMemo(() => {
    const m = new Map<string, RoomDoc>()
    for (const d of docs) if (d.item_key && !m.has(d.item_key)) m.set(d.item_key, d)
    return m
  }, [docs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? docs.filter((d) => `${d.title} ${d.file_name ?? ""} ${d.description ?? ""}`.toLowerCase().includes(q)) : docs
  }, [docs, query])

  const bySection = useMemo(() => {
    const m = new Map<string, RoomDoc[]>()
    for (const d of filtered) {
      const key = d.section ?? (room === "fund" ? "ir" : "corporate")
      const arr = m.get(key) ?? []
      arr.push(d)
      m.set(key, arr)
    }
    return m
  }, [filtered, room])

  const sectionsWithDocs = useMemo(() => {
    const s = new Set<string>()
    for (const d of docs) if (d.section) s.add(d.section)
    return s
  }, [docs])
  // Founder rooms score at item level (required checklist items covered);
  // fund rooms score at section level.
  const score = showChecklist
    ? itemCompleteness(room, new Set(Array.from(docByItem.keys())))
    : completeness(room, sectionsWithDocs)

  // Founder: show every section (so all upload slots are visible). Fund: show
  // sections with docs plus required-but-empty ones as nudges.
  const visibleSections: TaxonomySection[] = room === "founder"
    ? sections
    : sections.filter((s) => bySection.has(s.key) || s.items.some((i) => i.required))

  async function upload(sectionKey: string, file: File, itemKey?: string | null) {
    setUploading(itemKey ?? sectionKey)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("section", sectionKey)
      if (itemKey) fd.append("itemKey", itemKey)
      fd.append("title", file.name)
      const res = await fetch("/api/dataroom/founder/upload", { method: "POST", body: fd })
      if (res.ok) router.refresh()
    } catch { /* ignore */ } finally { setUploading(null) }
  }

  async function requestDoc(sectionKey: string, itemLabel: string) {
    if (!requestToken) return
    setRequested((s) => new Set(s).add(itemLabel))
    try {
      await fetch(`/room/${requestToken}/request`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ section: sectionKey, itemLabel }),
      })
    } catch { /* keep optimistic */ }
  }

  return (
    <div>
      {/* Completeness header */}
      <div className="border border-foreground/10 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-medium">{room === "founder" ? "Raise room completeness" : "Data room completeness"}</div>
            <div className="text-xs text-muted-foreground">{score.met} of {score.total} required {showChecklist ? "documents" : "sections"} {showChecklist ? "provided" : "have documents"}</div>
          </div>
          <span className="text-2xl font-semibold tabular-nums" style={{ color: accent }}>{score.pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${score.pct}%`, backgroundColor: accent }} />
        </div>
        {room === "founder" && score.pct < 60 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Investors judge a raise partly on room completeness — fill the required sections before sharing.</p>
        )}
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
          const isRequired = section.items.some((i) => i.required)
          const missing = isRequired && rows.length === 0
          return (
            <div key={section.key} className="border border-foreground/10 rounded-xl overflow-hidden">
              <div className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-foreground/[0.02]">
                <button onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(section.key) ? n.delete(section.key) : n.add(section.key); return n })}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className="text-sm font-medium truncate">{section.label}</span>
                  <span className="text-xs text-muted-foreground">{rows.length}</span>
                  {missing && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">Missing</span>}
                </button>
                {canUpload && (
                  <>
                    <input ref={(el) => { fileInputs.current[section.key] = el }} type="file" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(section.key, f, pendingItemKey.current); pendingItemKey.current = null; e.target.value = "" }} />
                    <button onClick={() => { pendingItemKey.current = null; fileInputs.current[section.key]?.click() }} disabled={uploading === section.key}
                      className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/[0.04] disabled:opacity-50 shrink-0">
                      {uploading === section.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
                    </button>
                  </>
                )}
              </div>
              {!isCollapsed && (
                <div className="border-t border-foreground/10">
                  {/* Item checklist (founder room + investor token view) */}
                  {showChecklist && (
                    <ul className="divide-y divide-foreground/[0.06] bg-foreground/[0.015]">
                      {section.items.map((item) => {
                        const covered = docByItem.get(item.key)
                        const wasRequested = requested.has(item.label)
                        return (
                          <li key={item.key} className="flex items-center gap-3 px-5 py-2.5">
                            <span className={`grid place-items-center w-4 h-4 rounded-full shrink-0 ${covered ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "border border-foreground/25"}`}>
                              {covered ? <Check className="w-3 h-3" /> : null}
                            </span>
                            <span className={`text-sm flex-1 ${covered ? "" : "text-muted-foreground"}`}>
                              {item.label}
                              {item.required && !covered && <span className="ml-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Required</span>}
                            </span>
                            {covered ? (
                              <a href={fileHref(covered.id)} target="_blank" rel="noreferrer" className="text-xs text-[#127c78] hover:underline shrink-0">View</a>
                            ) : canUpload ? (
                              <button onClick={() => { pendingItemKey.current = item.key; fileInputs.current[section.key]?.click() }} disabled={uploading === item.key}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0">
                                {uploading === item.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add
                              </button>
                            ) : requestToken ? (
                              wasRequested ? (
                                <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Requested</span>
                              ) : (
                                <button onClick={() => requestDoc(section.key, item.label)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0">
                                  <Send className="w-3 h-3" /> Request
                                </button>
                              )
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {/* Uploaded documents (all rooms) */}
                  {rows.length === 0 ? (
                    showChecklist ? null : (
                    <div className="px-5 py-4 text-sm text-muted-foreground">
                      No documents yet.{" "}
                      <span className="text-foreground/70">Expected: {(section.items.filter((i) => i.required).length ? section.items.filter((i) => i.required) : section.items.slice(0, 3)).map((i) => i.label).join(", ")}</span>
                    </div>
                    )
                  ) : (
                    <ul className="divide-y divide-foreground/[0.06]">
                      {rows.map((d) => (
                        <li key={d.id}>
                          <a href={fileHref(d.id)} target="_blank" rel="noreferrer"
                            className="flex items-center gap-4 px-5 py-3 hover:bg-foreground/[0.02] group">
                            <span className="grid place-items-center w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 shrink-0"><FileText className="w-4 h-4 text-foreground/60" /></span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">{d.title}</span>
                                {room === "fund" && <span className="text-[10px] font-mono uppercase tracking-wider border border-foreground/15 rounded px-1.5 py-0.5 text-foreground/70">{CATEGORY_LABEL[d.category] ?? d.category}</span>}
                                {d.fund_lp_id && <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider border border-[#127c78]/25 bg-[#127c78]/10 text-[#127c78] rounded px-1.5 py-0.5"><User className="w-2.5 h-2.5" /> Only you</span>}
                                {fundNameById && d.fund_id && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">· {fundNameById[d.fund_id] ?? ""}</span>}
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
