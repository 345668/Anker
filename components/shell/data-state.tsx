"use client"

import { Loader2, RefreshCw } from "lucide-react"

export function DataLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  )
}

export function DataError({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <span>{label}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 text-xs hover:bg-destructive/10">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  )
}

export function DataEmpty({ label }: { label: string }) {
  return <div role="status" className="py-10 text-center text-sm text-muted-foreground">{label}</div>
}
