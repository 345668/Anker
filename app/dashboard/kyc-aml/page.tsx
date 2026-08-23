import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { listCases } from "@/lib/modules/kyc"
import { isOpenSanctionsConfigured } from "@/lib/modules/opensanctions"
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
  const liveProvider = isOpenSanctionsConfigured()

  return (
    <PageShell>
      <PageHeader
        eyebrow="Fund services"
        title="KYC / AML"
        description="Investor onboarding and screening — name screening against sanctions, PEP, and adverse-media lists, plus document collection. Risk and status are derived from open hits and verified documents."
      />
      {liveProvider ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-2.5 text-[13px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Screening is <span className="font-medium text-foreground">live</span> — matches run against OpenSanctions (sanctions · PEP · adverse-media).
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">⚠ Screening is running in dev-fallback mode</span> — against the local
          watchlist only, <span className="font-medium text-foreground">not a live sanctions provider</span>. Results here are
          not a reliable clear. Set <span className="font-mono text-[12px]">OPENSANCTIONS_API_KEY</span> to enable real
          sanctions / PEP / adverse-media screening before relying on it.
        </div>
      )}
      <KycClient initial={cases} />
    </PageShell>
  )
}
