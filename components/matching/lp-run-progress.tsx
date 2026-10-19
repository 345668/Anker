"use client"

/** A run that is going on in the background (docs/architecture/63 M2): where it is, in words, and the promise that matters: leaving the page does not stop it. */
import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

export interface RunProgress { phase: string; label: string; pct: number }
export interface Followed { id: string; fundName?: string; source?: string }

/** Polls a run's status until it ends. `onDone` gets the finished run's id; `onFail` the reason. Stops on unmount and when the run ends. */
export function useFollowRun(run: Followed | null, onDone: (id: string) => void, onFail: (id: string, reason: string) => void, everyMs = 1500) {
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const cb = useRef({ onDone, onFail }); cb.current = { onDone, onFail }
  useEffect(() => {
    if (!run) { setProgress(null); return }
    let stop = false, misses = 0
    const tick = async () => {
      if (stop) return
      try {
        const r = await fetch(`/api/lp/matching/sessions/${run.id}/status`, { cache: "no-store" })
        if (r.status === 404) { stop = true; cb.current.onFail(run.id, "That run is no longer in this workspace."); return }
        if (!r.ok) throw new Error("status")
        misses = 0
        const j = await r.json()
        if (stop) return
        if (j.status === "completed") { stop = true; cb.current.onDone(run.id); return }
        if (j.status === "failed") { stop = true; cb.current.onFail(run.id, j.error || "The run did not finish."); return }
        setProgress(j.progress ?? null)
      } catch {
        // A lost connection is not a failed run: keep asking, and say so only if it goes on.
        if (++misses >= 8) { stop = true; cb.current.onFail(run.id, "Lost contact with the run. It may still finish; check Runs in a minute.") ; return }
      }
      if (!stop) timer = setTimeout(tick, everyMs)
    }
    let timer = setTimeout(tick, 400)
    return () => { stop = true; clearTimeout(timer) }
  }, [run?.id, everyMs])
  return progress
}

export function LpRunProgress({ fundName, progress, startedElsewhere }: { fundName?: string; progress: RunProgress | null; startedElsewhere?: boolean }) {
  const pct = Math.max(2, Math.min(100, progress?.pct ?? 2))
  return (
    <section className="border border-foreground/10 rounded-lg p-5 space-y-3" aria-label="Run in progress" aria-live="polite">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <h2 className="font-display text-lg">{startedElsewhere ? "A run is in progress" : "Still running"}{fundName ? `: ${fundName}` : ""}</h2>
      </div>
      <div className="h-2 rounded-full bg-foreground/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Run progress">
        <div className="h-full bg-foreground transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">{progress?.label ?? "Waiting to start"} · {pct}%</p>
      <p className="text-xs text-muted-foreground">You can leave this page. The run carries on, is saved under Runs, and you get a notification in Anker when it finishes.</p>
    </section>
  )
}
