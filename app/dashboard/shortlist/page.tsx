/**
 * /dashboard/shortlist — shortlist-driven outreach CRM.
 *
 * This is the live counterpart to the matchmaking xlsx shortlists.
 * Workflow:
 *   1. User runs LP matchmaking or founder matchmaking → gets xlsx
 *   2. Opens xlsx, unchecks "Contact" on rows they don't want
 *   3. Re-uploads via the ShortlistUploader card here OR on the matchmaking
 *      results page
 *   4. Server walks each sheet and inserts ticked rows into crm_entries
 *      with stage='queued'
 *   5. This page renders crm_entries as a kanban grouped by stage:
 *
 *        queued → contacted → responded → meeting → in_diligence
 *                                                  → committed
 *                                                  → passed
 *
 * Distinct from /dashboard/crm (legacy outreaches table, per-startup) and
 * /dashboard/pipeline (legacy deals view).
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sql } from "@/lib/db"
import { ShortlistContent } from "@/components/tesseract/shortlist-content"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Outreach Shortlist — Anker",
  description: "Track every LP and investor you decided to contact, end-to-end.",
}

export default async function ShortlistPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let entries: any[] = []
  try {
    entries = await sql`
      SELECT * FROM crm_entries
      WHERE user_id = ${user.id}
      ORDER BY added_at DESC
      LIMIT 1000
    `
  } catch {
    entries = []
  }

  return <ShortlistContent initialEntries={entries.map(serialize)} />
}

function serialize(r: any) {
  return {
    id: r.id,
    source: r.source,
    sourceSessionId: r.source_session_id ?? null,
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
    addedAt: toIso(r.added_at),
    lastContactedAt: toIso(r.last_contacted_at),
    updatedAt: toIso(r.updated_at),
    twentyOpportunityId: r.twenty_opportunity_id ?? null,
    twentyOpportunityUrl: r.twenty_opportunity_url ?? null,
    twentyLastSyncedAt: toIso(r.twenty_last_synced_at),
  }
}

function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
