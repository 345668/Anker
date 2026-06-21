import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundById } from "@/lib/portfolio/funds"
import {
  getDistributionById, listDistributionLineItems,
} from "@/lib/portfolio/distributions"
import { DistributionDetailClient } from "@/components/portfolio/distribution-detail-client"

export const dynamic = "force-dynamic"

export default async function DistributionDetail({
  params,
}: {
  params: Promise<{ distId: string }>
}) {
  const { distId } = await params

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const dist = await getDistributionById(distId)
  if (!dist) notFound()
  const [fund, lineItems] = await Promise.all([
    getFundById(dist.fund_id),
    listDistributionLineItems(distId),
  ])
  if (!fund) notFound()

  return (
    <DistributionDetailClient
      fund={fund}
      initialDistribution={dist}
      initialLineItems={lineItems}
    />
  )
}
