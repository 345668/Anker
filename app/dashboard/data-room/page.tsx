import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { listFounderDocuments, getFounderViewStats, getFounderRecentViews } from "@/lib/portfolio/data-room"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { RoomSections, type RoomDoc } from "@/components/dataroom/room-sections"
import { ShareRoomPanel } from "@/components/dataroom/share-room-panel"
import { DocumentEngagementPanel } from "@/components/portfolio/document-engagement-panel"
import { PageHeader } from "@/components/shell/page-header"

export const dynamic = "force-dynamic"
export const metadata = { title: "Data room — Anker" }

export default async function DataRoomPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const companyId = await resolveFounderCompanyId(user.id)
  const [documents, viewStats, recentViews] = await Promise.all([
    listFounderDocuments(companyId),
    getFounderViewStats(companyId),
    getFounderRecentViews(companyId, 30),
  ])

  const docs: RoomDoc[] = documents.map((d) => ({
    id: d.id, title: d.title, section: d.section, category: d.category,
    fund_id: d.fund_id, fund_lp_id: d.fund_lp_id, file_name: d.file_name,
    byte_size: d.byte_size, created_at: d.created_at, description: d.description,
  }))

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <PageHeader
        accent="#e5380f"
        eyebrow="Fundraising"
        title="Data room"
        description="Your diligence room, organized by the sections investors expect. Upload into each section, then share a tracked link with investors."
      />
      <ShareRoomPanel />
      <DocumentEngagementPanel stats={viewStats} recent={recentViews} bare emptyLabel="No investor views yet — activity appears here once an investor opens a shared link." />
      <RoomSections docs={docs} room="founder" canUpload />
    </div>
  )
}
