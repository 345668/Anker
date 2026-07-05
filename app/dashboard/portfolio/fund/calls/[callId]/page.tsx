import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundById } from "@/lib/portfolio/funds"
import { getCallById, listLineItems } from "@/lib/portfolio/capital-calls"
import { CapitalCallDetailClient } from "@/components/portfolio/capital-call-detail-client"

export const dynamic = "force-dynamic"

export default async function CapitalCallDetail({
  params,
}: {
  params: Promise<{ callId: string }>
}) {
  const { callId } = await params

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const call = await getCallById(callId)
  if (!call) notFound()
  const [fund, lineItems] = await Promise.all([
    getFundById(call.fund_id),
    listLineItems(callId),
  ])
  if (!fund) notFound()

  return (
    <CapitalCallDetailClient
      fund={fund}
      initialCall={call}
      initialLineItems={lineItems}
    />
  )
}
