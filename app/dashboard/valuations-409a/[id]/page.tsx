import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { getValuation } from "@/lib/modules/valuation-409a"
import { Valuation409aDetailClient } from "@/components/modules/valuation-409a-detail-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "409A valuation — Anker" }

export default async function Valuation409aDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersona(["founder"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const companyId = await resolveFounderCompanyId(user.id)
  const { id } = await params
  const valuation = await getValuation(companyId, id)
  if (!valuation) redirect("/dashboard/valuations-409a")

  return <Valuation409aDetailClient initial={valuation} />
}
