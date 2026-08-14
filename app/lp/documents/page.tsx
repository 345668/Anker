import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getLpMembershipsForEmail, listDocumentsForLp } from "@/lib/portfolio/data-room"
import { RoomSections, type RoomDoc } from "@/components/dataroom/room-sections"

export const dynamic = "force-dynamic"

export default async function LpDocumentsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login?redirect=/lp/documents")

  const memberships = await getLpMembershipsForEmail(user.email ?? "")
  const documents = await listDocumentsForLp(memberships, { limit: 200 })

  const docs: RoomDoc[] = documents.map((d) => ({
    id: d.id, title: d.title, section: d.section, category: d.category,
    fund_id: d.fund_id, fund_lp_id: d.fund_lp_id, file_name: d.file_name,
    byte_size: d.byte_size, created_at: d.created_at, description: d.description,
  }))
  const fundNameById = Object.fromEntries(memberships.map((m) => [m.fund_id, m.fund_name]))

  return (
    <main className="max-w-6xl mx-auto px-6 lg:px-10 py-8 lg:py-10 space-y-6">
      <div>
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#127c78]" /> Data room
        </div>
        <h1 className="text-3xl font-display tracking-tight">Documents</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Statements, letters, K-1s and reports — organized by section.
        </p>
      </div>
      <RoomSections docs={docs} fundNameById={memberships.length > 1 ? fundNameById : undefined} />
    </main>
  )
}
