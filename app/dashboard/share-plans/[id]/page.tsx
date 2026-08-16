import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { getGrantServicing } from "@/lib/modules/share-plans"
import { GrantDetailClient } from "@/components/modules/grant-detail-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Grant — Anker" }

export default async function GrantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersona(["founder"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const companyId = await resolveFounderCompanyId(user.id)
  const { id } = await params
  const servicing = await getGrantServicing(companyId, id)
  if (!servicing) redirect("/dashboard/share-plans")

  return <GrantDetailClient initial={servicing} />
}
