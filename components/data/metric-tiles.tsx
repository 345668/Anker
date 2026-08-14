import { TrendingUp, TrendingDown } from "lucide-react"

export type Metric = {
  label: string
  value: string | number
  /** optional delta chip, e.g. "+12%" */
  delta?: { value: string; positive?: boolean }
  hint?: string
}

/**
 * Carta-style metric tiles — the summary row above a data table
 * (Active investments · Cost · Value · Unrealized gain, or IRR/TVPI/DPI/RVPI).
 */
export function MetricTiles({ metrics, columns = 4 }: { metrics: Metric[]; columns?: 2 | 3 | 4 | 5 }) {
  const cols =
    columns === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : columns === 3 ? "sm:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"
  return (
    <div className={`grid grid-cols-2 ${cols} gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden`}>
      {metrics.map((m) => (
        <div key={m.label} className="bg-background p-4 lg:p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{m.label}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl lg:text-2xl font-semibold tabular-nums tracking-tight">{m.value}</span>
            {m.delta ? (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${m.delta.positive ? "text-emerald-600" : "text-rose-600"}`}>
                {m.delta.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {m.delta.value}
              </span>
            ) : null}
          </div>
          {m.hint ? <div className="mt-1 text-xs text-muted-foreground">{m.hint}</div> : null}
        </div>
      ))}
    </div>
  )
}
