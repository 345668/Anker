import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { listValuations } from "@/lib/modules/carta-modules"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { Valuations409aClient } from "@/components/modules/valuations-409a-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "409A Valuations — Anker" }

export default async function Valuations409aPage() {
  await requirePersona(["founder"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const companyId = await resolveFounderCompanyId(user.id)
  const vals = await listValuations(companyId)

  return (
    <PageShell>
      <PageHeader accent="#e5380f" eyebrow="Equity Suite" title="Valuations (409A)" description="Request tailored, audit-ready 409A, EMI, and CSOP valuations, and keep a versioned history of fair market value." />
      <Valuations409aClient initial={vals} />
    </PageShell>
  )
}
