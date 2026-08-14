import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { listFilings } from "@/lib/modules/carta-modules"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { EquityComplianceClient } from "@/components/modules/equity-compliance-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Equity Compliance — Anker" }

export default async function EquityCompliancePage() {
  await requirePersona(["founder"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const companyId = await resolveFounderCompanyId(user.id)
  const filings = await listFilings(companyId)

  return (
    <PageShell>
      <PageHeader accent="#e5380f" eyebrow="Equity Suite" title="Equity Compliance" description="Keep your statutory registers accurate and never miss a filing — track every deadline in one register." />
      <EquityComplianceClient initial={filings} />
    </PageShell>
  )
}
