import Link from "next/link"
import { ArrowRight } from "lucide-react"

export type SpotlightItem = {
  title: string
  sub?: string
  href: string
  cta?: string
  progress?: { done: number; total: number; label: string }
  accent?: string
}

/** Carta-style "Spotlight" cards on the dashboard — in-progress items at a glance. */
export function Spotlight({ items }: { items: SpotlightItem[] }) {
  if (!items.length) return null
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2.5 mb-4 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        <span className="w-2 h-2 bg-[#e5380f]" /> Spotlight
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it, i) => (
          <div key={i} className="rounded-xl border border-foreground/12 bg-foreground/[0.015] p-5 flex flex-col">
            <div className="flex-1">
              <h3 className="text-sm font-semibold leading-snug">{it.title}</h3>
              {it.sub ? <p className="mt-1 text-xs text-muted-foreground">{it.sub}</p> : null}
              {it.progress ? (
                <div className="mt-4">
                  <div className="h-1.5 w-full bg-foreground/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${it.progress.total ? (it.progress.done / it.progress.total) * 100 : 0}%`, backgroundColor: it.accent ?? "#2f45e0" }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                    <span>{it.progress.total ? Math.round((it.progress.done / it.progress.total) * 100) : 0}%</span>
                    <span>{it.progress.label}</span>
                  </div>
                </div>
              ) : null}
            </div>
            <Link href={it.href} className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-foreground group">
              {it.cta ?? "View details"} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
