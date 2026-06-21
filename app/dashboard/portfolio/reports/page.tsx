import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { listReports } from "@/lib/portfolio/lp-quarterly-report"
import { LpReportsListClient } from "@/components/portfolio/lp-reports-list-client"

export const dynamic = "force-dynamic"

export default async function LpReportsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fundId = "svs-fund-ii"
  const rows = await listReports(fundId, 40)

  return <LpReportsListClient fundId={fundId} initialReports={rows} />
}
