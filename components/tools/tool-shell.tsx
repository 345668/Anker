"use client"

import { ReactNode } from "react"
import { ArrowLeft, Download, Loader2, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ToolShellProps {
  slug: string
  title: string
  eyebrow: string
  description: string
  inputs: ReactNode
  outputs: ReactNode
  state: any
  exporting?: boolean
  setExporting?: (b: boolean) => void
}

/**
 * Common shell for native calculator pages.
 *
 * Layout: header → 1/3 inputs · 2/3 outputs · sticky export button.
 * The export button POSTs the current state to /api/tools/<slug>/export
 * and triggers a browser download.
 */
export function ToolShell({
  slug,
  title,
  eyebrow,
  description,
  inputs,
  outputs,
  state,
  exporting,
  setExporting,
}: ToolShellProps) {
  const onExport = async () => {
    if (setExporting) setExporting(true)
    try {
      const res = await fetch(`/api/tools/${slug}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      })
      if (!res.ok) {
        alert("Export failed: " + (await res.text()))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Anker — ${title}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      if (setExporting) setExporting(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          <Link
            href="/dashboard/tools"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            All tools
          </Link>
          <div className="flex items-start justify-between gap-8 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4">
                <span className="w-8 h-px bg-foreground/30" />
                {eyebrow}
              </span>
              <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-4">
                {title}
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">{description}</p>
            </div>
            <Button
              onClick={onExport}
              disabled={exporting}
              size="lg"
              className="rounded-full h-12 px-6 bg-foreground text-background hover:bg-foreground/90"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Building xlsx…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export to Excel
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="border border-foreground/10 rounded-lg p-6 space-y-5">{inputs}</div>
        </div>
        <div className="lg:col-span-2 space-y-6">{outputs}</div>
      </div>
    </div>
  )
}

export function ToolField({
  label,
  unit,
  children,
}: {
  label: string
  unit?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between mb-1.5">
        <span>{label}</span>
        {unit && <span className="font-mono text-[10px]">{unit}</span>}
      </label>
      {children}
    </div>
  )
}

export function ToolKpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string
  value: string
  sub?: string
  tone?: "good" | "warn" | "bad" | "neutral"
}) {
  return (
    <div
      className={cn(
        "p-5 border border-foreground/10 rounded-lg",
        tone === "good" && "bg-emerald-500/5 border-emerald-500/30",
        tone === "warn" && "bg-amber-500/5 border-amber-500/30",
        tone === "bad" && "bg-destructive/5 border-destructive/30",
      )}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-2xl font-display">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

export function ToolNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/5 border border-amber-500/20 text-xs">
      <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
      <span className="text-foreground/80">{children}</span>
    </div>
  )
}
