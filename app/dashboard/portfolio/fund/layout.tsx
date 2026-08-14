import { requirePersona } from "@/lib/auth/persona-guard"
import { FundTabs } from "@/components/portfolio/fund-tabs"

export const dynamic = "force-dynamic"

/**
 * Wraps every fund sub-page with the Carta-style fund detail tab bar, and
 * guards the GP fund back-office — VC-only. LPs are bounced to their portal,
 * founders to the founder home. Owners / membership-less users pass through.
 */
export default async function FundLayout({ children }: { children: React.ReactNode }) {
  await requirePersona(["vc"])
  return (
    <>
      <FundTabs />
      {children}
    </>
  )
}
