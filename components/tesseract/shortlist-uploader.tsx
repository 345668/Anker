"use client"

/**
 * Drop-zone / button that uploads an edited shortlist xlsx to
 *   POST /api/crm/import-shortlist
 *
 * The endpoint walks each sheet, finds rows where the leftmost "Contact"
 * column is TRUE, and inserts them into crm_entries.  We render the
 * per-sheet summary inline so the user sees exactly how many rows were
 * promoted from each tab.
 */

import { useRef, useState } from "react"
import { Upload, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react"
import Link from "next/link"

type SheetSummary = {
  sheet: string
  rowsTotal: number
  ticked: number
  unticked: number
  inserted: number
  alreadyPresent: number
  skipped: number
}

interface Props {
  source?: string             // "lp_matching" | "founder_matching"
  sessionId?: string | null   // optional session this shortlist came from
  /** Compact = small inline button. Otherwise a full-width drop card. */
  compact?: boolean
  className?: string
}

export function ShortlistUploader({
  source = "lp_matching",
  sessionId = null,
  compact = false,
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    filename: string
    sheets: SheetSummary[]
    totalInserted: number
  } | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append("xlsx", file)
      fd.append("source", source)
      if (sessionId) fd.append("session_id", sessionId)
      const res = await fetch("/api/crm/import-shortlist", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`)
      setResult(json)
    } catch (e: any) {
      setError(e?.message ?? "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function onPick() {
    inputRef.current?.click()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void handleFile(f)
  }

  // Compact variant — single small button used on session row actions
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 border border-foreground/10 rounded hover:border-foreground/30 transition-colors disabled:opacity-50"
          title="Upload edited shortlist (rows with Contact=TRUE will be added to your CRM)"
        >
          {uploading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
          Upload to CRM
        </button>
        {result && (
          <span className="text-[10px] font-mono text-emerald-600">
            +{result.totalInserted} added
          </span>
        )}
        {error && <span className="text-[10px] font-mono text-rose-600">{error}</span>}
      </span>
    )
  }

  // Full card — used on the deliverables panel and standalone /dashboard/outreach
  return (
    <div className={`border border-foreground/10 rounded-lg p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-display text-lg mb-1">Upload edited shortlist</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Open the xlsx, uncheck rows you don't want to contact, save, then drop the file here.
            Every row with Contact=TRUE goes into your CRM as <span className="font-mono">queued</span>.
          </p>
        </div>
        <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={onFileChange}
      />

      <button
        type="button"
        onClick={onPick}
        disabled={uploading}
        className="w-full inline-flex items-center justify-center gap-2 py-3 border-2 border-dashed border-foreground/20 rounded-md hover:border-foreground/40 hover:bg-foreground/[0.02] transition-colors text-sm disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Reading sheets and importing…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Choose .xlsx file
          </>
        )}
      </button>

      {error && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="text-rose-700 dark:text-rose-400">{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-md text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-emerald-700 dark:text-emerald-400">
              <strong>{result.totalInserted}</strong> row{result.totalInserted === 1 ? "" : "s"} added to CRM
              <span className="text-muted-foreground"> from {result.filename}</span>
            </span>
            <Link
              href="/dashboard/outreach"
              className="ml-auto inline-flex items-center gap-1 text-xs font-mono hover:underline text-emerald-700 dark:text-emerald-400"
            >
              Open CRM <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground border-b border-foreground/10">
                  <th className="text-left font-mono font-normal py-1.5">Sheet</th>
                  <th className="text-right font-mono font-normal">Rows</th>
                  <th className="text-right font-mono font-normal">Ticked</th>
                  <th className="text-right font-mono font-normal">Unticked</th>
                  <th className="text-right font-mono font-normal">Added</th>
                  <th className="text-right font-mono font-normal">Already</th>
                  <th className="text-right font-mono font-normal">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {result.sheets.map((s) => (
                  <tr key={s.sheet} className="border-b border-foreground/5">
                    <td className="py-1.5 font-medium">{s.sheet}</td>
                    <td className="text-right font-mono text-muted-foreground">{s.rowsTotal}</td>
                    <td className="text-right font-mono">{s.ticked}</td>
                    <td className="text-right font-mono text-muted-foreground">{s.unticked}</td>
                    <td className="text-right font-mono text-emerald-600">{s.inserted}</td>
                    <td className="text-right font-mono text-muted-foreground">{s.alreadyPresent}</td>
                    <td className="text-right font-mono text-muted-foreground">{s.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
