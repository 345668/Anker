import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug, listLps } from "@/lib/portfolio/funds"
import { CapitalCallWizard, type WizardLp } from "@/components/portfolio/capital-call-wizard"

export const dynamic = "force-dynamic"
export const metadata = { title: "Initiate capital activity — Anker" }

const CLASS_LABEL: Record<string, string> = {
  family_office: "Family office",
  institutional: "Institutional",
  hnwi: "HNWI",
  corporate: "Corporate",
  fund_of_funds: "Fund of funds",
}

export default async function NewCapitalCallPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const lps = fund ? await listLps(fund.id) : []

  const wizardLps: WizardLp[] = lps
    .filter((l) => l.status !== "transferred")
    .map((l) => ({
      id: l.id,
      name: l.lp_name,
      lpClass: l.lp_type ? (CLASS_LABEL[l.lp_type] ?? l.lp_type) : "Unassigned partners",
      committed: Number(l.commitment_amount) || 0,
      called: Number(l.called_amount) || 0,
    }))

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-5xl">
      {wizardLps.length ? (
        <CapitalCallWizard fundName={fund?.name ?? "Fund"} lps={wizardLps} />
      ) : (
        <p className="text-sm text-muted-foreground">No limited partners on this fund yet — add LPs before calling capital.</p>
      )}
    </div>
  )
}
