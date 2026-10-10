/** Activation: how far workspaces have got through the loop (docs/architecture/37 section 12, doc 50). Reads the `activation_by_workspace` view: counts and times, never content. */
import { sql } from "@/lib/db"
export const STAGES = ["workspace_created", "contacts_added", "outreach_drafted", "send_authorized", "email_sent", "reply_received"] as const
export type Stage = (typeof STAGES)[number]
export interface WorkspaceActivation {
  orgId: string; name: string; kind: string; createdAt: string; furthest: Stage; contacts: number; itemsSent: number; proposalsDecided: number; agentRuns: number
  lastActivityAt: string | null; hoursToFirstSend: number | null; weeklyActive: boolean
}
export interface Funnel { generatedAt: string; workspaces: number; reached: Record<Stage, number>; weeklyActive: number; agentsUsed: number; proposalsDecided: number; rows: WorkspaceActivation[] }
const rank = (s: string) => STAGES.indexOf(s as Stage)
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)
/** `exclude` removes throwaway and internal workspaces (by id) so the numbers describe real use. */
export async function activationFunnel(opts: { exclude?: string[]; now?: Date } = {}): Promise<Funnel> {
  const now = opts.now ?? new Date()
  const rows = ((await sql`SELECT * FROM activation_by_workspace ORDER BY workspace_created_at DESC`) as any[]).filter((r) => !(opts.exclude ?? []).includes(r.org_id))
  const out: WorkspaceActivation[] = rows.map((r) => {
    const first = r.first_send_at ?? r.first_message_sent_at
    const last = r.last_activity_at ? new Date(r.last_activity_at) : null
    return {
      orgId: r.org_id, name: r.name, kind: r.kind, createdAt: iso(r.workspace_created_at)!, furthest: r.furthest, contacts: Number(r.contacts), itemsSent: Number(r.items_sent), proposalsDecided: Number(r.proposals_decided), agentRuns: Number(r.agent_runs),
      lastActivityAt: iso(r.last_activity_at), hoursToFirstSend: first ? Math.round((new Date(first).getTime() - new Date(r.workspace_created_at).getTime()) / 36e5) : null,
      weeklyActive: !!last && now.getTime() - last.getTime() < 7 * 86_400_000,
    }
  })
  const reached = Object.fromEntries(STAGES.map((s) => [s, out.filter((w) => rank(w.furthest) >= rank(s)).length])) as Record<Stage, number>
  return { generatedAt: now.toISOString(), workspaces: out.length, reached, weeklyActive: out.filter((w) => w.weeklyActive).length, agentsUsed: out.filter((w) => w.agentRuns > 0).length, proposalsDecided: out.reduce((n, w) => n + w.proposalsDecided, 0), rows: out }
}
