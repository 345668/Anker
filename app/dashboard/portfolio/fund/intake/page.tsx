/** /dashboard/portfolio/fund/intake — the fund's public application form and the engine that ranks what arrives (docs/architecture/39). */
import Link from "next/link"
import { requireActiveFund } from "@/lib/auth/fund-access"
import { IntakeSettings } from "@/components/intake/intake-settings"

export const dynamic = "force-dynamic"
export const metadata = { title: "Deal intake — Anker" }

export default async function IntakePage() {
  const fund = await requireActiveFund()
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
      <Link href="/dashboard/portfolio/fund/deals" className="text-sm text-muted-foreground hover:text-foreground">← Deal flow</Link>
      <h1 className="font-display mt-3 text-3xl">Deal intake</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">Publish an application form for {fund.name}, link it from your website, and let your own criteria rank what arrives. Every application lands in Deal flow, already scored and sorted into Passed, Review or Not a fit.</p>
      <IntakeSettings fundId={fund.id} />
    </div>
  )
}
