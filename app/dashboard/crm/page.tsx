/**
 * /dashboard/crm — primary CRM page.
 *
 * As of the May 2026 integration pass this route renders the
 * shortlist-driven CRM (kanban over `crm_entries`).  The earlier
 * legacy view (table over the `outreaches` table) is still available
 * at /dashboard/crm/legacy for any deep-links.
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sql } from "@/lib/db"
import { ShortlistContent } from "@/components/tesseract/shortlist-content"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "CRM — Anker",
  description: "Outreach kanban: queued → contacted → responded → meeting → committed.",
}

export default async function CRMPage() {
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
