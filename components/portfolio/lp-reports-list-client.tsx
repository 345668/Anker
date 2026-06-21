"use client"

/**
 * LP quarterly reports — list + generate-new panel.
 *
 * Top of the page: a quarter picker + "Generate" button that fires
 * POST /api/portfolio/reports, then navigates the user to the new report.
 * Below: the list of past reports with status chips and quick links.
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  FileText, Loader2, Sparkles, ArrowUpRight, CheckCircle2,
  AlertTriangle, Send, Archive, Calendar,
} from "lucide-react"
import type { LpQuarterlyReport } from "@/lib/portfolio/lp-quarterly-report"

interface Props {
  fundId: string
  initialReports: LpQuarterlyReport[]
}

const STATUS_META: Record<LpQuarterlyReport["status"], { label: string; tone: string }> = {
  draft:    { label: "Draft",    tone: "text-foreground/70 bg-foreground/5 border-foreground/10" },
  reviewed: { label: "Reviewed", tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  sent:     { label: "Sent",     tone: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  archived: { label: "Archived", tone: "text-muted-foreground bg-foreground/5 border-foreground/10" },
}

export function LpReportsListClient({ fundId, initialReports }: Props) {
  const router = useRouter()
  const [reports, setReports] = useState(initialReports)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quarterEnd, setQuarterEnd] = useState(defaultQuarterEnd())

  async function generate() {
    setGenerating(true); setError(null)
    try {
      const res = await fetch("/api/portfolio/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId, quarterEnd }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Generation failed (${res.status})`)
      router.push(`/dashboard/portfolio/reports/${data.report.id}`)
    } catch (e: any) { setError(e?.message ?? "Generation failed") }
    finally { setGenerating(false) }
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground mb-3"
        >
          ← Portfolio
        </Link>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight">
          LP quarterly letters
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Reads from the portfolio + KPI snapshots and drafts a quarterly letter on the deep model tier.
          Each generation freezes a snapshot of the rollup so the report is reproducible later.
        </p>
      </div>

      {/* Generate panel */}
      <div className="border border-foreground/15 rounded-md p-5 mb-8 bg-foreground/[0.02]">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-[200px]">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              Quarter end
            </label>
            <input
              type="date"
              value={quarterEnd}
              onChange={(e) => setQuarterEnd(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </div>
          <div className="text-xs text-muted-foreground max-w-md">
            The generator snaps the date you choose to the last day of its calendar quarter,
            so any day in Q2 produces the {/* eslint-disable-line react/no-unescaped-entities */}
            <span className="font-mono">2026-Q2</span> letter.
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="ml-auto inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Drafting… (30-90s)</>
              : <><Sparkles className="w-4 h-4" /> Generate</>}
          </button>
        </div>
        {error && (
          <div className="mt-3 px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> {error}
          </div>
        )}
      </div>

      {/* List */}
      <div className="border border-foreground/10 rounded-md divide-y divide-foreground/10 bg-background">
        {reports.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No quarterly reports yet. Generate the current quarter above.
          </div>
        ) : reports.map((r) => (
          <Link
            key={r.id}
            href={`/dashboard/portfolio/reports/${r.id}`}
            className="flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] group"
          >
            <div className="w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-foreground/60" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-base text-foreground group-hover:translate-x-0.5 transition-transform">
                  {r.quarter_label}
                </span>
                <StatusChip status={r.status} />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  · quarter end {r.quarter_end}
                </span>
              </div>
              {r.summary && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-2xl">
                  {r.summary}
                </div>
              )}
            </div>
            <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 text-right">
              <div className="text-xs font-mono text-foreground/70">
                <Calendar className="w-3 h-3 inline mr-1" />
                {new Date(r.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                updated
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: LpQuarterlyReport["status"] }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${meta.tone}`}>
      {meta.label}
    </span>
  )
}

/** Default to the last day of the current calendar quarter. */
function defaultQuarterEnd(): string {
  const now = new Date()
  const q = Math.floor(now.getUTCMonth() / 3)
  const eom = new Date(Date.UTC(now.getUTCFullYear(), 3 * q + 3, 0))
  return eom.toISOString().slice(0, 10)
}
