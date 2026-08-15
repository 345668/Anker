import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { listCases } from "@/lib/modules/kyc"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { KycClient } from "@/components/modules/kyc-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "KYC / AML — Anker" }

export default async function KycAmlPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const cases = await listCases(user.id)

  return (
    <PageShell>
      <PageHeader
        eyebrow="Fund services"
        title="KYC / AML"
        description="Investor onboarding and screening — name screening against sanctions, PEP, and adverse-media lists, plus document collection. Risk and status are derived from open hits and verified documents."
      />
      <KycClient initial={cases} />
    </PageShell>
  )
}
