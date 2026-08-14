import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { isOwner } from "@/lib/auth/admin"
import { FundTabs } from "@/components/portfolio/fund-tabs"

export const dynamic = "force-dynamic"

/**
 * Wraps every fund sub-page with the Carta-style fund detail tab bar, and
 * guards the GP fund back-office: an LP-persona member (who is not an owner)
 * is bounced to their own portal — the fund management surfaces are GP-only.
 */
export default async function FundLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && !isOwner(user.email)) {
    const { active } = await resolveActiveMembership(user.id)
    if (active?.persona === "lp") redirect("/lp")
  }

  return (
    <>
      <FundTabs />
      {children}
    </>
  )
}
