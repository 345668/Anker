import Link from "next/link"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
/**
 * /dashboard/crm — primary CRM page.
 *
 * July 2026 powerhouse pass: the page is exclusively relationship
 * management — Attio-style list + detail pane, saved views, follow-up
 * tasks, funnel KPIs, bulk actions. Grid (Excel-style) and Kanban remain
 * as view modes. Outreach moved to /dashboard/outreach.
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sql } from "@/lib/db"
import { CrmPowerhouse, type Board } from "@/components/crm/crm-powerhouse"
import { requirePersona } from "@/lib/auth/persona-guard"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "CRM — Anker",
  description: "Excel-style CRM of matched investors, organized into boards, with an integrated outreach studio.",
}

export default async function CRMPage() {
  await requirePersona(["founder", "vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const scope = await requireCrmWorkspace()
  let entries: any[] = []
  let boardRows: any[] = []
  try {
    entries = await sql`
      SELECT * FROM crm_entries
      WHERE org_id = ${scope.orgId}
      ORDER BY display_score DESC NULLS LAST, added_at DESC
      LIMIT 5000
    `
  } catch {
    throw new Error("Your relationship records could not be loaded.")
  }
  try {
    boardRows = await sql`
      SELECT * FROM crm_boards
      WHERE org_id = ${scope.orgId} AND archived = false
      ORDER BY position ASC NULLS LAST, created_at ASC
    `
  } catch {
    throw new Error("Your relationship boards could not be loaded.")
  }

  const counts: Record<string, number> = {}
  let unassigned = 0
  for (const e of entries) {
    if (!e.board_id) unassigned++
    else counts[e.board_id] = (counts[e.board_id] ?? 0) + 1
  }

  const boards: Board[] = boardRows.map((b) => ({
    id: b.id,
    name: b.name,
    sourceSessionId: b.source_session_id ?? null,
    position: b.position ?? null,
    isDefault: !!b.is_default,
    count: counts[b.id] ?? 0,
  }))

  return (
    <><div className="px-6 pt-6 text-sm text-muted-foreground">{scope.name} · Shared workspace CRM. {scope.canWrite ? "Members can edit." : "Your access is read only."} <Link className="underline" href="/dashboard/workspaces/legacy">Move older records</Link></div><CrmPowerhouse
      key={scope.orgId}
      canWrite={scope.canWrite}
      initialBoards={boards}
      initialEntries={entries.map(serialize)}
      unassigned={unassigned}
    /></>
  )
}

function serialize(r: any) {
  return {
    id: r.id,
    source: r.source,
    sourceSessionId: r.source_session_id ?? null,
    boardId: r.board_id ?? null,
    firmId: r.firm_id ?? null,
    investorId: r.investor_id ?? null,
    displayName: r.display_name,
    displayTitle: r.display_title ?? null,
    displayEmail: r.display_email ?? null,
    displayLinkedin: r.display_linkedin ?? null,
    displayLocation: r.display_location ?? null,
    displayType: r.display_type ?? null,
    displayScore: r.display_score ?? null,
    displayTier: r.display_tier ?? null,
    whyMatch: r.why_match ?? null,
    stage: r.stage,
    notes: r.notes ?? null,
    owner: r.owner ?? null,
    researchSummary: r.research_summary ?? null,
    researchUrl: r.research_url ?? null,
    addedAt: toIso(r.added_at),
    lastContactedAt: toIso(r.last_contacted_at),
    tags: Array.isArray(r.tags) ? r.tags : [],
  }
}

function toIso(v: any): string | null {
  if (!v) return null
  try { return new Date(v).toISOString() } catch { return null }
}
