/**
 * /dashboard/outreach/studio — per-contact outreach studio, extracted from
 * the CRM. The campaigns engine lives one level up at /dashboard/outreach.
 *
 * The CRM (/dashboard/crm) is exclusively relationship management; drafting
 * happens here. Arrives with ?entry=<crm_entry_id> when deep-linked from a
 * contact's detail pane.
 */
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sql } from "@/lib/db"
import { OutreachPageClient } from "@/components/crm/outreach-page-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Outreach — Anker",
  description: "Research → sender profile → curated drafts, per investor.",
}

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let rows: any[] = []
  try {
    rows = await sql`
      SELECT id, display_name, display_title, display_type, display_location,
             display_linkedin, display_email, why_match, research_summary,
             research_url, stage
      FROM crm_entries
      WHERE user_id = ${user.id}
      ORDER BY display_score DESC NULLS LAST, added_at DESC
      LIMIT 2000
    `
  } catch { rows = [] }

  const entries = rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    displayTitle: r.display_title ?? null,
    displayType: r.display_type ?? null,
    displayLocation: r.display_location ?? null,
    displayLinkedin: r.display_linkedin ?? null,
    displayEmail: r.display_email ?? null,
    whyMatch: r.why_match ?? null,
    researchSummary: r.research_summary ?? null,
    researchUrl: r.research_url ?? null,
    stage: r.stage,
  }))

  return (
    <Suspense>
      <OutreachPageClient entries={entries} />
    </Suspense>
  )
}
