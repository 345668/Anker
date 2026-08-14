import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug, listLps } from "@/lib/portfolio/funds"
import { listDocuments, getDocumentViewStats, getRecentDocumentViews } from "@/lib/portfolio/data-room"
import { DataRoomAdminClient } from "@/components/portfolio/data-room-admin-client"
import { DocumentEngagementPanel } from "@/components/portfolio/document-engagement-panel"

export const dynamic = "force-dynamic"

export default async function DataRoomAdminPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const [docs, lps, viewStats, recentViews] = await Promise.all([
    listDocuments({ fundId: fund.id, limit: 200 }),
    listLps(fund.id),
    getDocumentViewStats(fund.id),
    getRecentDocumentViews(fund.id, 30),
  ])

  return (
    <div>
      <DocumentEngagementPanel stats={viewStats} recent={recentViews} />
      <DataRoomAdminClient
        fund={fund}
        initialDocuments={docs.rows}
        lps={lps.map((l) => ({
          id: l.id,
          name: l.lp_name,
          status: l.status,
          has_contact_email: !!l.contact_email,
        }))}
      />
    </div>
  )
}
