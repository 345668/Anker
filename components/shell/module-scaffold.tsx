import type { ReactNode } from "react"
import { PageHeader, PageShell } from "@/components/shell/page-header"

/**
 * Carta-style scaffold for a platform module whose backend is still being
 * built out. Renders the standard page chrome + a capability grid + an honest
 * "on the roadmap" status band, so the surface reads as a real product area
 * rather than a dead link.
 */
export function ModuleScaffold({
  accent = "#2f45e0",
  eyebrow,
  title,
  description,
  capabilities,
  status = "In build — the module surface is live; automation lands next.",
  children,
}: {
  accent?: string
  eyebrow: string
  title: string
  description: string
  capabilities: { title: string; desc: string }[]
  status?: string
  children?: ReactNode
}) {
  return (
    <PageShell>
      <PageHeader accent={accent} eyebrow={eyebrow} title={title} description={description} />

      {children}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-foreground/10 border border-foreground/10 rounded-xl overflow-hidden mt-2">
        {capabilities.map((c) => (
          <div key={c.title} className="bg-background p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-2 h-2" style={{ backgroundColor: accent }} />
              <h3 className="text-sm font-semibold">{c.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-5 py-4 text-sm text-muted-foreground">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] mr-2" style={{ color: accent }}>Status</span>
        {status}
      </div>
    </PageShell>
  )
}
