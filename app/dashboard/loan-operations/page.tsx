import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { listLoans } from "@/lib/modules/carta-modules"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { LoansClient } from "@/components/modules/loans-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Loan Operations — Anker" }

export default async function LoanOperationsPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const loans = await listLoans(user.id)
  return (
    <PageShell>
      <PageHeader eyebrow="Fund services" title="Loan Operations" description="Originate, service, and track private-credit loans — principal, interest, maturity, and covenants in one book." />
      <LoansClient initial={loans} />
    </PageShell>
  )
}
