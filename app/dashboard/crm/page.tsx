/**
 * /dashboard/crm — primary CRM page.
 *
 * As of the May 2026 boards pass this route renders the CRM workspace:
 *   - an Excel-style spreadsheet of every matched investor (default view)
 *   - a Kanban toggle (queued → contacted → … → committed)
 *   - named, switchable, renameable boards ("CRM sessions")
 *   - the integrated outreach studio (research → sender profile → drafts)
 *
 * The earlier kanban-only view is still available at /dashboard/shortlist.
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sql } from "@/lib/db"
import { CrmWorkspace, type Board } from "@/components/tesseract/crm-workspace"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "CRM — Anker",
  description: "Excel-style CRM of matched investors, organized into boards, with an integrated outreach studio.",
}

export default async function CRMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let entries: any[] = []
  let boardRows: any[] = []
  try {
    entries = await sql`
      SELECT * FROM crm_entries
      WHERE user_id = ${user.id}
      ORDER BY display_score DESC NULLS LAST, added_at DESC
      LIMIT 5000
    `
  } catch {
    entries = []
  }
  try {
    boardRows = await sql`
      SELECT * FROM crm_boards
      WHERE user_id = ${user.id} AND archived = false
      ORDER BY position ASC NULLS LAST, created_at ASC
    `
  } catch {
    boardRows = []
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
    <CrmWorkspace
      initialBoards={boards}
      initialEntries={entries.map(serialize)}
      unassigned={unassigned}
    />
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
  }
}

function toIso(v: any): string | null {
  if (!v) return null
  try { return new Date(v).toISOString() } catch { return null }
}
