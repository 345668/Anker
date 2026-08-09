import type { ReactNode } from "react"

/**
 * Carta-style page chrome shared across the platform.
 *
 * PageShell   — consistent max-width + horizontal/vertical rhythm so every
 *               page sits on the same grid (px-6 lg:px-8, max-w-6xl).
 * PageHeader  — accent eyebrow (mono, uppercase, tracking) + display title +
 *               optional description and a right-aligned actions slot.
 *
 * Accent colours follow the persona palette: cobalt (VC/fund), vermilion
 * (founder), teal (LP). Default cobalt.
 */

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-6 lg:px-8 py-8 lg:py-10 max-w-6xl ${className}`}>{children}</div>
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  accent = "#2f45e0",
  className = "",
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  accent?: string
  className?: string
}) {
  return (
    <div className={`mb-6 flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span className="w-2.5 h-2.5" style={{ backgroundColor: accent }} />
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-3xl font-display tracking-tight">{title}</h1>
        {description ? <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  )
}
