import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { getSpv } from "@/lib/modules/spv-lifecycle"
import { getSpvEconomics, getSpvCapTable } from "@/lib/modules/spv-economics"
import { SpvWaterfallClient } from "@/components/modules/spv-waterfall-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "SPV cap table & waterfall — Anker" }

export default async function SpvWaterfallPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { id } = await params
  const spv = await getSpv(user.id, id)
  if (!spv) redirect("/dashboard/spvs")

  const [economics, capTable] = await Promise.all([getSpvEconomics(id), getSpvCapTable(id)])

  return (
    <SpvWaterfallClient
      spvId={id}
      spvName={spv.name}
      dealName={spv.deal_name}
      economics={economics}
      capTable={capTable}
    />
  )
}
