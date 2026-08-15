import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"

/**
 * Carta-style empty state — a calm, centered icon + message (+ optional action),
 * for tables, panels, and tabs with nothing to show. Replaces ad-hoc "No X yet"
 * strings scattered across the app so empties read as one system.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className = "",
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  /** Tighter padding for inline / in-table use. */
  compact?: boolean
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-10" : "py-16"} px-6 ${className}`}>
      <div className="grid place-items-center w-11 h-11 rounded-xl border border-foreground/10 bg-foreground/[0.03] text-muted-foreground mb-3.5">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <p className="font-display text-base tracking-tight">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
