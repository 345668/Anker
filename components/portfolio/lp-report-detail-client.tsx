"use client"

/**
 * LP quarterly report — detail / editor / preview.
 *
 * Three tabs:
 *   - Preview: rendered markdown (using the newsroom renderer)
 *   - Edit:    raw markdown editor with autosave-on-save
 *   - Snapshot: the frozen kpis_snapshot in collapsed JSON, for audit
 *
 * Status pipeline lives in the header: Draft → Reviewed → Sent.
 * Export DOCX hits /api/portfolio/reports/[id]/export.
 * Regenerate fires the POST endpoint again with the same quarterEnd —
 * the upsert in the queries module overwrites and resets status to draft
 * (unless archived).
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Save, Loader2, AlertTriangle, CheckCircle2,
  Sparkles, Download, Trash2, FileText, Eye, Pencil, Database,
  ArrowRight, Send, Archive,
} from "lucide-react"
import type { LpQuarterlyReport } from "@/lib/portfolio/lp-quarterly-report"
import { renderArticleHtml } from "@/lib/newsroom/markdown"

interface Props {
  initialReport: LpQuarterlyReport
}

type Tab = "preview" | "edit" | "snapshot"

export function LpReportDetailClient({ initialReport }: Props) {
  const router = useRouter()
  const [r, setR] = useState(initialReport)
  const [contentMd, setContentMd] = useState(initialReport.content_md ?? "")
  const [summary, setSummary] = useState(initialReport.summary ?? "")
  const [tab, setTab] = useState<Tab>("preview")
  const [busy, setBusy] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const html = useMemo(() => renderArticleHtml(contentMd || ""), [contentMd])

  async function save() {
    setBusy(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/portfolio/reports/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentMd, summary }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      setR(data.report)
      setSuccess("Saved.")
    } catch (e: any) { setError(e?.message ?? "Save failed") }
    finally { setBusy(false) }
  }

  async function setStatus(status: LpQuarterlyReport["status"]) {
    setBusy(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/portfolio/reports/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Status update failed (${res.status})`)
      setR(data.report)
      setSuccess(`Status: ${status}.`)
    } catch (e: any) { setError(e?.message ?? "Status update failed") }
    finally { setBusy(false) }
  }

  async function regenerate() {
    if (!confirm("Regenerate this letter? Current edits will be overwritten with a fresh draft from the latest portfolio data.")) return
    setRegenerating(true); setError(null); setSuccess(null)
    try {
      const res = await fetch("/api/portfolio/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId: r.fund_id, quarterEnd: r.quarter_end }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Regenerate failed (${res.status})`)
      setR(data.report)
      setContentMd(data.report.content_md ?? "")
      setSummary(data.report.summary ?? "")
      setSuccess("Regenerated from latest portfolio data.")
    } catch (e: any) { setError(e?.message ?? "Regenerate failed") }
    finally { setRegenerating(false) }
  }

  async function remove() {
    if (!confirm("Delete this report? Cannot be undone.")) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/reports/${r.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Delete failed (${res.status})`)
      }
      router.push("/dashboard/portfolio/reports")
    } catch (e: any) { setError(e?.message ?? "Delete failed") }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <Link
        href="/dashboard/portfolio/reports"
        className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Reports
      </Link>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{r.quarter_label} — LP letter</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <span>{r.fund_id}</span>
            <span>· quarter end {r.quarter_end}</span>
            <span>· status {r.status}</span>
            {r.generation_ms != null && (
              <span>· generated in {(r.generation_ms / 1000).toFixed(1)}s</span>
            )}
            {r.sent_at && <span>· sent {new Date(r.sent_at).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/portfolio/reports/${r.id}/export`}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5"
          >
            <Download className="w-4 h-4" /> .docx
          </a>
          <button
            type="button" onClick={regenerate} disabled={regenerating || busy}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
          >
            {regenerating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Regenerating…</>
              : <><Sparkles className="w-4 h-4" /> Regenerate</>}
          </button>
          <button
            type="button" onClick={save} disabled={busy}
            className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
          <button
            type="button" onClick={remove} disabled={busy}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-rose-500/30 text-rose-600 hover:bg-rose-500/5 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status pipeline */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <StatusStep label="Draft"    active={r.status === "draft"}
          done={r.status === "reviewed" || r.status === "sent"}
          onClick={() => setStatus("draft")} disabled={busy} />
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StatusStep label="Reviewed" active={r.status === "reviewed"}
          done={r.status === "sent"}
          onClick={() => setStatus("reviewed")} disabled={busy} />
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StatusStep label="Sent"     active={r.status === "sent"}
          done={false}
          onClick={() => setStatus("sent")} disabled={busy} icon={Send} />
        <span className="text-muted-foreground/30 mx-2">·</span>
        <button
          type="button" onClick={() => setStatus("archived")} disabled={busy}
          className={`inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded border transition-colors ${
            r.status === "archived"
              ? "bg-foreground/5 text-muted-foreground border-foreground/10"
              : "border-foreground/15 text-muted-foreground hover:border-foreground/30"
          }`}
        >
          <Archive className="w-3 h-3" /> Archive
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-3 py-2 text-xs font-mono text-emerald-700 border border-emerald-500/30 bg-emerald-500/5 rounded-md inline-flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3" /> {success}
        </div>
      )}

      {/* Summary block (always visible) */}
      <div className="border border-foreground/10 rounded-md p-4 mb-6 bg-foreground/[0.02]">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
          Executive summary
        </div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className="w-full text-sm bg-transparent border-none focus:outline-none focus:ring-0 resize-y leading-relaxed"
          placeholder="One-paragraph summary the LPs see first."
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-foreground/10">
        <TabBtn label="Preview"  active={tab === "preview"}  onClick={() => setTab("preview")}  Icon={Eye} />
        <TabBtn label="Edit"     active={tab === "edit"}     onClick={() => setTab("edit")}     Icon={Pencil} />
        <TabBtn label="Snapshot" active={tab === "snapshot"} onClick={() => setTab("snapshot")} Icon={Database} />
      </div>

      {tab === "preview" && (
        <article
          className="article-body max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {tab === "edit" && (
        <textarea
          value={contentMd}
          onChange={(e) => setContentMd(e.target.value)}
          rows={28}
          className="w-full text-sm font-mono p-4 border border-foreground/15 rounded-md bg-background leading-relaxed"
          placeholder="Markdown body of the letter."
        />
      )}
      {tab === "snapshot" && (
        <div>
          <div className="text-xs text-muted-foreground mb-3">
            Frozen at generation time. Used to reproduce this report's facts independently of later corrections to KPI rows.
          </div>
          <pre className="text-[11px] font-mono p-4 border border-foreground/10 rounded-md bg-foreground/[0.02] overflow-x-auto max-h-[500px] overflow-y-auto">
{JSON.stringify(r.kpis_snapshot ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function StatusStep({
  label, active, done, onClick, disabled, icon: Icon,
}: {
  label: string
  active: boolean
  done: boolean
  onClick: () => void
  disabled?: boolean
  icon?: any
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
        active
          ? "bg-foreground text-background border-foreground"
          : done
            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
            : "border-foreground/15 text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {Icon ? <Icon className="w-3 h-3" /> : done ? <CheckCircle2 className="w-3 h-3" /> : null}
      {label}
    </button>
  )
}

function TabBtn({
  label, active, onClick, Icon,
}: {
  label: string; active: boolean; onClick: () => void; Icon: any
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}
