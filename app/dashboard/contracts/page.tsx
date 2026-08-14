import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { listContracts } from "@/lib/modules/carta-modules"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { ContractsClient } from "@/components/modules/contracts-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Contracts — Anker" }

export default async function ContractsPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const contracts = await listContracts(user.id)
  return (
    <PageShell>
      <PageHeader eyebrow="Fund services" title="Contracts" description="Track every agreement from draft to signature — NDAs, side letters, SAFEs, and MSAs in one register." />
      <ContractsClient initial={contracts} />
    </PageShell>
  )
}
