import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { listFounderDocuments } from "@/lib/portfolio/data-room"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { RoomSections, type RoomDoc } from "@/components/dataroom/room-sections"
import { PageHeader } from "@/components/shell/page-header"

export const dynamic = "force-dynamic"
export const metadata = { title: "Data room — Anker" }

export default async function DataRoomPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const companyId = await resolveFounderCompanyId(user.id)
  const documents = await listFounderDocuments(companyId)

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
        description="Your diligence room, organized by the sections investors expect. Upload into each section — completeness is tracked as you go."
      />
      <RoomSections docs={docs} room="founder" canUpload />
    </div>
  )
}
