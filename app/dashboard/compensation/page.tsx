import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { listBands } from "@/lib/modules/carta-modules"
import { isBenchmarkConfigured } from "@/lib/compensation/benchmark"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { CompClient } from "@/components/modules/comp-client"
import { CompBenchmark } from "@/components/modules/comp-benchmark"

export const dynamic = "force-dynamic"
export const metadata = { title: "Compensation — Anker" }

export default async function CompensationPage() {
  await requirePersona(["founder"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const companyId = await resolveFounderCompanyId(user.id)
  const bands = await listBands(companyId)
  return (
    <PageShell>
      <PageHeader accent="#e5380f" eyebrow="Equity Suite" title="Compensation" description="Build salary and equity bands for every role, level, and region — and keep every offer inside them." />
      <CompBenchmark configured={isBenchmarkConfigured()} />
      <CompClient initial={bands} />
    </PageShell>
  )
}
