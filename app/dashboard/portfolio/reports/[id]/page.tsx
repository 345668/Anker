import { notFound } from "next/navigation"
import { requireActiveFund } from "@/lib/auth/fund-access"
import { getReportById } from "@/lib/portfolio/lp-quarterly-report"
import { LpReportDetailClient } from "@/components/portfolio/lp-report-detail-client"

export const dynamic = "force-dynamic"

export default async function LpReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const fund = await requireActiveFund()

  const report = await getReportById(id, fund.id)
  if (!report) notFound()
  return <LpReportDetailClient initialReport={report} />
}
