"use client"

import { useMemo, useState } from "react"
import { Check, CircleDot, Clock, FileText, Sparkles, ChevronRight, Loader2 } from "lucide-react"

const COBALT = "#2f45e0"

export type ReportStep = {
  key: string
  group: string
  label: string
  desc: string
  status: "todo" | "in_progress" | "done"
  by?: string
  bullets?: string[]
  completedBy?: string
  completedAt?: string
}
export type FinancialReport = {
  id: string
  entityName: string
  period: string
  status: "draft" | "needs_review" | "done"
  steps: ReportStep[]
}

const STATUS_BADGE: Record<FinancialReport["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-foreground/[0.06] text-muted-foreground" },
  needs_review: { label: "Needs review", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  done: { label: "Done", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
}

function progressOf(r: FinancialReport) {
  const done = r.steps.filter((s) => s.status === "done").length
  return { done, total: r.steps.length, pct: r.steps.length ? Math.round((done / r.steps.length) * 100) : 0 }
}

export function FinancialReportProgress({ reports: initial }: { reports: FinancialReport[] }) {
  const [reports, setReports] = useState(initial)
  const [activeId, setActiveId] = useState(initial[0]?.id ?? "")
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const active = useMemo(() => reports.find((r) => r.id === activeId) ?? reports[0], [reports, activeId])

  async function markStep(step: ReportStep, next: "done" | "todo") {
    if (!active) return
    setBusyKey(step.key)
    // optimistic
    setReports((rs) =>
      rs.map((r) => {
        if (r.id !== active.id) return r
        const steps = r.steps.map((s) => (s.key === step.key ? { ...s, status: next, completedAt: next === "done" ? new Date().toISOString().slice(0, 10) : undefined, completedBy: next === "done" ? "You" : undefined } : s))
        const allDone = steps.every((s) => s.status === "done")
        return { ...r, steps, status: allDone ? "done" : "needs_review" }
      }),
    )
    try {
      await fetch(`/api/fund-reports/${active.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepKey: step.key, status: next }),
      })
    } catch {
      /* keep optimistic state; a refresh reconciles */
    } finally {
      setBusyKey(null)
    }
  }

  if (!active) {
    return <p className="text-sm text-muted-foreground">No reporting periods yet.</p>
  }

  const groups = Array.from(new Set(active.steps.map((s) => s.group)))
  const prog = progressOf(active)

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      {/* Left rail — reporting entities / periods */}
      <aside className="lg:border-r lg:border-foreground/10 lg:pr-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Reporting periods</div>
        <ul className="space-y-1">
          {reports.map((r) => {
            const p = progressOf(r)
            const on = r.id === active.id
            const badge = STATUS_BADGE[r.status]
            return (
              <li key={r.id}>
                <button
                  onClick={() => setActiveId(r.id)}
                  className={`w-full text-left rounded-lg border px-3.5 py-3 transition-colors ${on ? "border-foreground/25 bg-foreground/[0.03]" : "border-foreground/10 hover:border-foreground/25"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{r.period}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 rounded-full bg-foreground/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, backgroundColor: r.status === "done" ? "#10b981" : COBALT }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{p.done}/{p.total}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* Detail — step checklist */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="text-xl font-display tracking-tight">
            {active.period} Financial Report
          </h2>
          <span className={`text-xs font-medium px-2 py-1 rounded ${STATUS_BADGE[active.status].cls}`}>{STATUS_BADGE[active.status].label}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {active.entityName} · {prog.done} of {prog.total} steps complete
          {active.status !== "done" ? " — finish each step to publish to your limited partners." : " — published to your limited partners."}
        </p>

        {groups.map((group) => (
          <section key={group} className="mb-7">
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">{group}</div>
            <div className="border border-foreground/10 rounded-xl divide-y divide-foreground/[0.07] overflow-hidden">
              {active.steps.filter((s) => s.group === group).map((step) => {
                const done = step.status === "done"
                const carta = !!step.by
                const busy = busyKey === step.key
                return (
                  <div key={step.key} className="flex items-start gap-4 p-4 sm:p-5">
                    <span className={`grid place-items-center w-8 h-8 rounded-full shrink-0 mt-0.5 ${done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : carta ? "bg-[#2f45e0]/10 text-[#2f45e0]" : "bg-foreground/[0.06] text-muted-foreground"}`}>
                      {done ? <Check className="w-4 h-4" /> : carta ? <Sparkles className="w-4 h-4" /> : <CircleDot className="w-4 h-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{step.label}</h3>
                        {carta ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#2f45e0]/10 text-[#2f45e0]">Handled by Anker</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
                      {step.bullets ? (
                        <ul className="mt-2 space-y-1">
                          {step.bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#2f45e0]" /> {b}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {done && step.completedBy ? (
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Clock className="w-3 h-3" /> Completed{step.completedAt ? ` ${step.completedAt}` : ""} by {step.completedBy}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 self-center">
                      {carta ? (
                        done ? (
                          <span className="text-xs text-muted-foreground">Complete</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> In progress</span>
                        )
                      ) : step.key === "your_review" && done ? (
                        <button className="inline-flex items-center gap-1 text-sm font-medium text-[#2f45e0] hover:underline">
                          <FileText className="w-4 h-4" /> View financials
                        </button>
                      ) : done ? (
                        <button onClick={() => markStep(step, "todo")} disabled={busy} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
                          Undo
                        </button>
                      ) : (
                        <button
                          onClick={() => markStep(step, "done")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md bg-[#2f45e0] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-[#2637b8] disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Review <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
