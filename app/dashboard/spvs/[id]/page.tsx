import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { getSpv, listSubscriptions, getSpvRollup } from "@/lib/modules/spv-lifecycle"
import { SpvDetailClient } from "@/components/modules/spv-detail-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "SPV — Anker" }

export default async function SpvDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { id } = await params
  const spv = await getSpv(user.id, id)
  if (!spv) redirect("/dashboard/spvs")

  const [subscriptions, rollup] = await Promise.all([
    listSubscriptions(id),
    getSpvRollup(id, spv.target_amount),
  ])

  return <SpvDetailClient initialSpv={spv} initialSubs={subscriptions} initialRollup={rollup} />
}
