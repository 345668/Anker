"use client"

/**
 * OutreachPageClient — /dashboard/outreach.
 *
 * The outreach studio, extracted from the CRM (which is now exclusively
 * relationship management). Pick a contact (or arrive with ?entry=<id>
 * from the CRM's "Draft outreach" button), set your founder context, and
 * run the research → sender profile → drafts flow.
 */

import { useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Search, Send } from "lucide-react"
import { OutreachStudio, type StudioEntry } from "@/components/tesseract/outreach-studio"
import { FounderContextCard, useFounderContext } from "@/components/tesseract/founder-context-card"

interface Props {
  entries: StudioEntry[]
}

const STAGE_COLOR: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-100 text-blue-700",
  responded: "bg-amber-100 text-amber-700",
  meeting: "bg-cyan-100 text-cyan-700",
  in_diligence: "bg-violet-100 text-violet-700",
  committed: "bg-emerald-100 text-emerald-700",
  passed: "bg-rose-100 text-rose-700",
}

export function OutreachPageClient({ entries }: Props) {
  const params = useSearchParams()
  const router = useRouter()
  const preselect = params.get("entry")
  const [activeId, setActiveId] = useState<string | null>(
    preselect && entries.some((e) => e.id === preselect) ? preselect : null,
  )
  const [q, setQ] = useState("")
  const [founder, setFounder] = useFounderContext()

  const active = activeId ? entries.find((e) => e.id === activeId) ?? null : null

  const visible = useMemo(() => {
    const f = q.trim().toLowerCase()
    if (!f) return entries
    return entries.filter((e) =>
      [e.displayName, e.displayTitle, e.displayType, e.displayLocation]
        .some((v) => (v ?? "").toLowerCase().includes(f)))
  }, [entries, q])

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="px-6 lg:px-10 pt-6 pb-4 border-b border-foreground/10">
        <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-1.5">
          <span className="w-8 h-px bg-foreground/30" />
          Outreach · research → profile → drafts
        </span>
        <h1 className="text-3xl lg:text-4xl font-display tracking-tight leading-[0.95]">Outreach studio.</h1>
      </div>

      <div className="px-6 lg:px-10 py-6 space-y-6">
        <FounderContextCard ctx={founder} onChange={setFounder} defaultCollapsed />

        {active ? (
          <OutreachStudio
            entry={active}
            founder={founder}
            onClose={() => { setActiveId(null); router.replace("/dashboard/outreach") }}
          />
        ) : (
          <div className="max-w-[900px]">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Pick a contact to draft for…"
                className="h-10 w-full max-w-md pl-9 pr-3 rounded-md border border-input bg-background text-sm" />
            </div>
            <div className="border border-foreground/10 rounded-lg overflow-hidden divide-y divide-foreground/5">
              {visible.slice(0, 100).map((e) => (
                <button key={e.id} onClick={() => setActiveId(e.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.03]">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{e.displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[e.displayTitle, e.displayType, e.displayLocation].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STAGE_COLOR[e.stage] ?? "bg-foreground/5"}`}>
                    {e.stage.replace("_", " ")}
                  </span>
                  <Send className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
              {!visible.length && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No contacts match — add investors in the CRM first.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
