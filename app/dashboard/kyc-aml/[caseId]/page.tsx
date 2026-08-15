import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { getCase, REQUIRED_DOCS } from "@/lib/modules/kyc"
import { KycCaseClient } from "@/components/modules/kyc-case-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "KYC case — Anker" }

export default async function KycCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { caseId } = await params
  const data = await getCase(user.id, caseId)
  if (!data) redirect("/dashboard/kyc-aml")

  return (
    <KycCaseClient
      initialCase={data.case}
      initialHits={data.hits}
      initialDocs={data.documents}
      requiredDocs={REQUIRED_DOCS[data.case.subject_type]}
    />
  )
}
