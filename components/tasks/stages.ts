// Shared task-stage config (no server deps — safe for client + server).
export type Stage = "to_do" | "in_progress" | "review" | "done"

export const STAGES: { key: Stage; label: string }[] = [
  { key: "to_do", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "In Review" },
  { key: "done", label: "Done" },
]

export const STAGE_LABEL: Record<Stage, string> = {
  to_do: "To Do",
  in_progress: "In Progress",
  review: "In Review",
  done: "Done",
}

export type Task = {
  id: string
  title: string
  entity_label: string | null
  stage: Stage
  priority: "low" | "normal" | "high" | null
  due_date: string | null
}
