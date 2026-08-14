import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getLpMembershipsForEmail, listDocumentsForLp } from "@/lib/portfolio/data-room"
import { LpDashboardClient } from "@/components/lp/lp-dashboard-client"

export const dynamic = "force-dynamic"

export default async function LpDocumentsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login?redirect=/lp/documents")

  const memberships = await getLpMembershipsForEmail(user.email ?? "")
  const documents = await listDocumentsForLp(memberships, { limit: 200 })

  return <LpDashboardClient memberships={memberships} initialDocuments={documents} view="documents" />
}
