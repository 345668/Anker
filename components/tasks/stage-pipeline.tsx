import { STAGES, type Stage } from "./stages"

/** Carta-style horizontal stage pipeline with per-stage counts. */
export function StagePipeline({ counts, accent = "#e5380f" }: { counts: Record<Stage, number>; accent?: string }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
      {STAGES.map((s, i) => (
        <div key={s.key} className="bg-background p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
            <span
              className="grid place-items-center w-4 h-4 rounded-full text-[9px]"
              style={s.key === "done" ? { backgroundColor: accent, color: "#fff" } : { border: "1px solid rgba(127,127,127,.4)" }}
            >
              {i + 1}
            </span>
            Stage {i + 1}
          </div>
          <div className="mt-2 text-sm font-medium">{s.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{counts[s.key] ?? 0}</div>
        </div>
      ))}
    </div>
  )
}
