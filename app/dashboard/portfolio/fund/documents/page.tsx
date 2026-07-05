import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug, listLps } from "@/lib/portfolio/funds"
import { listDocuments } from "@/lib/portfolio/data-room"
import { DataRoomAdminClient } from "@/components/portfolio/data-room-admin-client"

export const dynamic = "force-dynamic"

export default async function DataRoomAdminPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const [docs, lps] = await Promise.all([
    listDocuments({ fundId: fund.id, limit: 200 }),
    listLps(fund.id),
  ])

  return (
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
  )
}
