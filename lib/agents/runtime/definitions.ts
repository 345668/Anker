/** The agents. Plain data and queries: no routes, no model (the tool decides facts, docs/architecture/37 §4). docs/architecture/44 §6. */
import type { AgentDefinition } from "./model"

const MAX_PER_RUN = 10

export const pipelineKeeper: AgentDefinition = {
  id: "pipeline_keeper", version: 1, title: "Pipeline keeper",
  summary: "Every morning, finds contacts you have gone quiet on and proposes a follow-up task for each.",
  personas: ["founder", "vc"], riskCeiling: "R0", maxSpendUsd: 0, schedule: "daily@07",
  defaults: { staleDays: 14 },
  guarantees: ["Only proposes follow-up tasks, which you approve in Actions", "Never contacts anyone and never moves a stage", `At most ${MAX_PER_RUN} proposals per run`],
  steps: [
    {
      id: "find_stale", label: "Find contacts in Contacted or Responded with no recent contact and no open task",
      async run(ctx) {
        const days = Math.max(1, Math.min(365, Number(ctx.config.staleDays) || 14))
        const rows = await ctx.rows(`SELECT e.id, e.display_name, e.stage, e.last_contacted_at,
            GREATEST(0, floor(extract(epoch FROM (now() - e.last_contacted_at)) / 86400))::int AS days
          FROM crm_entries e
          WHERE e.org_id = $1 AND e.stage IN ('contacted','responded') AND e.last_contacted_at IS NOT NULL
            AND e.last_contacted_at < now() - ($2::int * interval '1 day')
            AND NOT EXISTS (SELECT 1 FROM crm_tasks t WHERE t.crm_entry_id = e.id AND t.done_at IS NULL)
          ORDER BY e.last_contacted_at ASC LIMIT ${MAX_PER_RUN}`, [days])
        return { staleDays: days, found: rows.map((r) => ({ id: String(r.id), name: r.display_name, stage: r.stage, days: Number(r.days) })) }
      },
    },
    {
      id: "propose_tasks", label: "Propose one follow-up task per contact",
      async run(ctx) {
        const out: string[] = []
        for (const c of ctx.prev.find_stale.found as Array<{ id: string; name: string; days: number }>) {
          const r = await ctx.propose("crm_add_task", { title: `Follow up with ${c.name}: no contact for ${c.days} days`, entryId: c.id })
          out.push(r.summary)
        }
        return { proposals: out }
      },
    },
  ],
  finish: (s) => ({ summary: `${s.propose_tasks.proposals.length} follow-up${s.propose_tasks.proposals.length === 1 ? "" : "s"} proposed for contacts quiet for ${s.find_stale.staleDays}+ days.`, proposals: s.propose_tasks.proposals }),
}

export const weeklyBrief: AgentDefinition = {
  id: "weekly_brief", version: 1, title: "Weekly brief",
  summary: "Monday morning: where your pipeline stands, what moved, what is due, and what is waiting for your approval.",
  personas: ["founder", "vc"], riskCeiling: "R0", maxSpendUsd: 0, schedule: "weekly:mon@07",
  defaults: {},
  guarantees: ["Reads your workspace and writes a brief; changes nothing", "Every number comes from a query, not from a model"],
  steps: [
    {
      id: "pipeline", label: "Count contacts by stage and what moved this week",
      async run(ctx) {
        const stages = await ctx.rows(`SELECT stage, count(*)::int AS n FROM crm_entries WHERE org_id = $1 GROUP BY stage ORDER BY n DESC`)
        const [moved] = await ctx.rows(`SELECT count(*)::int AS n FROM crm_entries WHERE org_id = $1 AND updated_at > now() - interval '7 days'`)
        return { stages: stages.map((r) => ({ stage: r.stage, n: Number(r.n) })), movedThisWeek: Number(moved?.n ?? 0) }
      },
    },
    {
      id: "tasks", label: "Count overdue tasks and tasks due this week",
      async run(ctx) {
        const [t] = await ctx.rows(`SELECT count(*) FILTER (WHERE due_at < now())::int AS overdue,
            count(*) FILTER (WHERE due_at >= now() AND due_at < now() + interval '7 days')::int AS due_week
          FROM crm_tasks WHERE org_id = $1 AND done_at IS NULL`)
        return { overdue: Number(t?.overdue ?? 0), dueThisWeek: Number(t?.due_week ?? 0) }
      },
    },
    {
      id: "inbox", label: "Count proposals waiting for approval",
      async run(ctx) {
        const [p] = await ctx.rows(`SELECT count(*)::int AS n FROM action_proposals WHERE org_id = $1 AND status = 'pending' AND expires_at > now()`)
        return { waiting: Number(p?.n ?? 0) }
      },
    },
    {
      id: "deals", label: "For a fund: deal flow by stage",
      async run(ctx) {
        if (ctx.persona !== "vc") return { stages: [] }
        try {
          const rows = await ctx.rows(`SELECT d.stage, count(*)::int AS n FROM deal_opportunities d JOIN organizations o ON o.fund_id::text = d.fund_id::text
            WHERE o.id = $1 GROUP BY d.stage ORDER BY n DESC`)
          return { stages: rows.map((r) => ({ stage: r.stage, n: Number(r.n) })) }
        } catch { return { stages: [] } }
      },
    },
  ],
  finish: (s) => {
    const total = s.pipeline.stages.reduce((a: number, r: any) => a + r.n, 0)
    const lines = [
      `${total} contact${total === 1 ? "" : "s"} in your pipeline${s.pipeline.stages.length ? ": " + s.pipeline.stages.map((r: any) => `${r.n} ${r.stage}`).join(", ") : ""}.`,
      `${s.pipeline.movedThisWeek} updated in the last 7 days.`,
      `${s.tasks.overdue} task${s.tasks.overdue === 1 ? "" : "s"} overdue, ${s.tasks.dueThisWeek} due this week.`,
      `${s.inbox.waiting} change${s.inbox.waiting === 1 ? "" : "s"} waiting for your approval in Actions.`,
    ]
    if (s.deals.stages.length) lines.push(`Deal flow: ${s.deals.stages.map((r: any) => `${r.n} ${r.stage}`).join(", ")}.`)
    return { summary: lines[0], lines, facts: { total, ...s.pipeline, ...s.tasks, ...s.inbox, deals: s.deals.stages } }
  },
}

export const DEFINITIONS: Record<string, AgentDefinition> = { pipeline_keeper: pipelineKeeper, weekly_brief: weeklyBrief }
export const definitionsFor = (persona: string) => Object.values(DEFINITIONS).filter((d) => d.personas.includes(persona as any))
