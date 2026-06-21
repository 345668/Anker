import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getReportById } from "@/lib/portfolio/lp-quarterly-report"
import { LpReportDetailClient } from "@/components/portfolio/lp-report-detail-client"

export const dynamic = "force-dynamic"

export default async function LpReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const report = await getReportById(id)
  if (!report) notFound()
  return <LpReportDetailClient initialReport={report} />
}
