"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Circle } from "lucide-react"
import { DataTable, type Column } from "@/components/data/data-table"
import { StagePipeline } from "./stage-pipeline"
import { STAGE_LABEL, type Stage, type Task } from "./stages"

type Tab = "mine" | "completed" | "all"

function dueMeta(due: string | null, done: boolean) {
  if (!due) return { label: "—", overdue: false }
  const d = new Date(due + "T00:00:00")
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const overdue = !done && d < today
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return { label, overdue }
}

export function TaskFeed() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [tab, setTab] = useState<Tab>("mine")
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const r = await fetch("/api/tasks")
      const d = await r.json()
      setTasks(d.tasks ?? [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { to_do: 0, in_progress: 0, review: 0, done: 0 }
    for (const t of tasks) c[t.stage] = (c[t.stage] ?? 0) + 1
    return c
  }, [tasks])

  const inProgress = counts.to_do + counts.in_progress + counts.review
  const rows = useMemo(() => {
    if (tab === "completed") return tasks.filter((t) => t.stage === "done")
    if (tab === "all") return tasks
    return tasks.filter((t) => t.stage !== "done")
  }, [tasks, tab])

  async function complete(id: string) {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, stage: "done" } : t)))
    try { await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "done" }) }) } catch { load() }
  }

  const columns: Column<Task>[] = [
    { key: "title", header: "Item", render: (t) => <span className="font-medium">{t.title}</span> },
    { key: "entity_label", header: "Entity", value: (t) => t.entity_label ?? "", render: (t) => t.entity_label ?? "—" },
    {
      key: "stage", header: "Stage", value: (t) => t.stage,
      render: (t) => <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border border-foreground/15 rounded-full px-2 py-0.5">{STAGE_LABEL[t.stage]}</span>,
    },
    {
      key: "due_date", header: "Due", value: (t) => t.due_date ?? "",
      render: (t) => {
        const m = dueMeta(t.due_date, t.stage === "done")
        return <span className={m.overdue ? "text-rose-600 font-medium" : "text-muted-foreground"}>{m.overdue ? `${m.label} · overdue` : m.label}</span>
      },
    },
    {
      key: "action", header: "", sortable: false, value: () => "",
      render: (t) =>
        t.stage === "done" ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3.5 h-3.5" /> Done</span>
        ) : (
          <button onClick={() => complete(t.id)} className="inline-flex items-center gap-1.5 text-xs border border-foreground/15 rounded-md px-2.5 py-1 hover:border-foreground/40" type="button">
            <Circle className="w-3 h-3" /> Complete
          </button>
        ),
    },
  ]

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "mine", label: "My To-Dos", n: inProgress },
    { key: "completed", label: "Completed", n: counts.done },
    { key: "all", label: "All", n: tasks.length },
  ]

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2.5 mb-4 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        <span className="w-2 h-2 bg-[#e5380f]" />
        {loading ? "Loading…" : `${inProgress} item${inProgress === 1 ? "" : "s"} in progress`}
      </div>

      <div className="mb-5"><StagePipeline counts={counts} /></div>

      <div className="flex items-center gap-1 mb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md ${tab === t.key ? "bg-foreground/[0.07] font-medium" : "text-muted-foreground hover:text-foreground"}`}
            type="button"
          >
            {t.label}
            <span className="text-[10px] font-mono border border-foreground/15 rounded-full px-1.5 py-0.5">{t.n}</span>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(t) => t.id}
        exportName="my-tasks"
        searchPlaceholder="Search tasks…"
        emptyText={tab === "completed" ? "Nothing completed yet." : "You're all caught up."}
      />
    </section>
  )
}
