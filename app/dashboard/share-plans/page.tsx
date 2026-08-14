import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { listGrants } from "@/lib/modules/carta-modules"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { SharePlansClient } from "@/components/modules/share-plans-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Share Plans — Anker" }

export default async function SharePlansPage() {
  await requirePersona(["founder"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const companyId = await resolveFounderCompanyId(user.id)
  const grants = await listGrants(companyId)

  return (
    <PageShell>
      <PageHeader accent="#e5380f" eyebrow="Equity Suite" title="Share Plans" description="Set up your option pool, grant options online, and track scheme usage — synced to your cap table." />
      <SharePlansClient initial={grants} />
    </PageShell>
  )
}
