/**
 * /dashboard/crm/legacy — the table view over the legacy `outreaches`
 * table.  Kept as a deep-link until the data is fully migrated into
 * crm_entries.  The primary CRM is now /dashboard/crm.
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CRMContent } from "@/components/tesseract/crm-content"
import {
  getOutreachesWithDetails,
  getOutreachCountByStage,
  getInvestors,
} from "@/lib/db/platform-queries"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"
export const metadata = { title: "Legacy CRM — Anker" }

export default async function LegacyCRMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let startupId: string | undefined
  try {
    const startupResults = await sql`SELECT id FROM startups WHERE owner_id = ${user.id} LIMIT 1`
    startupId = startupResults[0]?.id
    if (!startupId) {
      const fallbackResults = await sql`SELECT id FROM startups WHERE founder_id = ${user.id} LIMIT 1`
      startupId = fallbackResults[0]?.id
    }
  } catch { /* ignore */ }

  const [outreaches, stageCounts, investors] = await Promise.all([
    startupId ? getOutreachesWithDetails(startupId, 200) : Promise.resolve([]),
    startupId ? getOutreachCountByStage(startupId) : Promise.resolve({}),
    getInvestors(50),
  ])

  return (
    <CRMContent
      user={user}
      outreaches={outreaches}
      stageCounts={stageCounts}
      investors={investors}
      startupId={startupId ?? null}
    />
  )
}
